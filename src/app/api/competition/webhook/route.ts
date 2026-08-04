import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createZAI } from '@/lib/zai';

/**
 * WhatsApp Business API Webhook Handler
 * Supports both Meta Direct API and 360dialog BSP.
 *
 * SETUP:
 * 1. Set WHATSAPP_API_TOKEN (your 360dialog API key or Meta token)
 * 2. Set WHATSAPP_PHONE_NUMBER_ID (from 360dialog Hub or Meta)
 * 3. Set WHATSAPP_VERIFY_TOKEN (any random string — must match what you enter in 360dialog/Meta webhook config)
 * 4. Set BSP_PROVIDER to "360dialog" or "meta" (defaults to "360dialog")
 *
 * Webhook URL: https://your-domain.com/api/competition/webhook
 */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'champion_webhook_verify_2026';
const BSP_PROVIDER = (process.env.BSP_PROVIDER || '360dialog') as '360dialog' | 'meta';

// ─── Conversation State Management ───

type ConversationStep =
  | 'idle'
  | 'askFullName'
  | 'askTraderName'
  | 'askStoreAddress'
  | 'askWholesaleStore'
  | 'askPhone'
  | 'askSlip'
  | 'validating';

interface ConversationState {
  step: ConversationStep;
  entryId?: string;
  data: {
    fullName?: string;
    traderName?: string;
    storeAddress?: string;
    wholesaleStore?: string;
    consumerPhone?: string;
  };
  lastUpdated: number;
}

const conversations = new Map<string, ConversationState>();
const CONVERSATION_TTL_MS = 30 * 60 * 1000;

function cleanExpiredConversations() {
  const now = Date.now();
  for (const [key, state] of conversations.entries()) {
    if (now - state.lastUpdated > CONVERSATION_TTL_MS) {
      conversations.delete(key);
    }
  }
}

function getConversation(phone: string): ConversationState {
  cleanExpiredConversations();
  if (!conversations.has(phone)) {
    conversations.set(phone, { step: 'idle', data: {}, lastUpdated: Date.now() });
  }
  const conv = conversations.get(phone)!;
  conv.lastUpdated = Date.now();
  return conv;
}

function resetConversation(phone: string): ConversationState {
  const conv: ConversationState = { step: 'idle', data: {}, lastUpdated: Date.now() };
  conversations.set(phone, conv);
  return conv;
}

// ─── Participating stores cache ───
let storesCache: string[] = [];
let storesCacheTime = 0;
const STORES_CACHE_TTL = 5 * 60 * 1000;

async function getParticipatingStoreNames(): Promise<string[]> {
  const now = Date.now();
  if (storesCache.length > 0 && now - storesCacheTime < STORES_CACHE_TTL) {
    return storesCache;
  }
  try {
    const stores = await db.participatingStore.findMany({
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    storesCache = stores.map((s) => s.name);
    storesCacheTime = now;
  } catch {
    // fallback: empty list
  }
  return storesCache;
}

// ─── Webhook Verification (GET) ───

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }
  console.warn('[webhook] Verification failed');
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ─── Webhook Message Handler (POST) ───

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const messages = (change.value || {}).messages || [];
        for (const message of messages) {
          const from = message.from;
          const type = message.type;
          const msgId = message.id;

          await markMessageAsRead(msgId);

          if (type === 'text') {
            await handleTextMessage(from, message.text?.body || '');
          } else if (type === 'image') {
            const imageId = message.image?.id || '';
            await handleImageMessage(from, imageId);
          } else {
            await sendWhatsAppMessage(
              from,
              'Please send a text message or a photo of your till slip to continue.'
            );
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[webhook] Processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// ─── Text Message Handler ───

async function handleTextMessage(phoneNumber: string, text: string) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const conv = getConversation(phoneNumber);

  // Global commands
  if (lower === 'start' || lower === 'hi' || lower === 'hello' || lower === 'enter') {
    if (conv.step === 'askSlip' && conv.entryId) {
      await sendWhatsAppMessage(
        phoneNumber,
        'Welcome back! You\'re almost in. Send a photo of your till slip and we\'ll finish up! \uD83D\uDCF8'
      );
      return;
    }
    resetConversation(phoneNumber);
    await startNewEntry(phoneNumber);
    return;
  }

  if (lower === 'cancel' || lower === 'stop' || lower === 'exit') {
    resetConversation(phoneNumber);
    await sendWhatsAppMessage(
      phoneNumber,
      'No worries, entries cancelled. Whenever you\'re ready, just send "Hi" to start fresh. \uD83D\uDE4C'
    );
    return;
  }

  if (lower === 'status') {
    await checkEntryStatus(phoneNumber);
    return;
  }

  if (lower === 'help' || lower === '?') {
    await sendWhatsAppMessage(
      phoneNumber,
      '*Champion \u2014 Upgrade Your Hustle* \uD83C\uDFC6\n\n'
      + '*Start* \u2014 Enter the competition\n'
      + '*Status* \u2014 Check your latest entry\n'
      + '*Cancel* \u2014 Start over\n'
      + '*Help* \u2014 This message\n\n'
      + 'Prizes: *R1 000 weekly* + *R20 000 grand prize*!\n\n'
      + 'Send "Hi" to get started \uD83D\uDE4C'
    );
    return;
  }

  // Step-by-step flow
  switch (conv.step) {
    case 'idle':
      await sendWhatsAppMessage(
        phoneNumber,
        '*Hey there! Welcome to Champion \u2014 Upgrade Your Hustle!* \uD83C\uDFC6\n\n'
        + 'Here\'s how it works:\n'
        + '\uD83D\uDED2 Buy any 2 Champion or Candy Tops products\n'
        + '\uD83D\uDCF8 Snap your till slip\n'
        + '\uD83C\uDF89 Win *R1 000 cash* every week + *R20 000* in grand prizes!\n\n'
        + 'Ready? Just send "*Start*" or "*Hi*" and we\'ll get you entered! \uD83D\uDE4C'
      );
      break;

    case 'askFullName': {
      const name = trimmed.replace(/[^a-zA-Z\s'-]/g, '').trim();
      if (name.length < 3) {
        await sendWhatsAppMessage(phoneNumber, 'That\'s a bit short \u2014 could you share your full name so we know who to contact if you win?');
        return;
      }
      conv.data.fullName = name;
      conv.step = 'askTraderName';
      await sendWhatsAppMessage(
        phoneNumber,
        'Nice to meet you, ' + name + '! \uD83D\uDE0A\n\nWhat\'s the name of the *trader or spaza shop* where you bought? (Type "N/A" if it\'s for yourself)'
      );
      break;
    }

    case 'askTraderName': {
      conv.data.traderName = trimmed === 'n/a' ? '' : trimmed;
      conv.step = 'askStoreAddress';
      await sendWhatsAppMessage(
        phoneNumber,
        'And which *area or address* is the shop in? (e.g., "Khayelitsha Site C" or "CBD Johannesburg")'
      );
      break;
    }

    case 'askStoreAddress': {
      if (trimmed.length < 3) {
        await sendWhatsAppMessage(phoneNumber, 'Could you be a bit more specific? Even just the neighbourhood works.');
        return;
      }
      conv.data.storeAddress = trimmed;
      conv.step = 'askWholesaleStore';

      const stores = await getParticipatingStoreNames();
      const storeList = stores.map((name, i) => `${i + 1}. ${name}`).join('\n');

      await sendWhatsAppMessage(
        phoneNumber,
        `Which *wholesale store* did you buy from?\n\n${storeList}\n\nType the name or number.\n`
      );
      break;
    }

    case 'askWholesaleStore': {
      const stores = await getParticipatingStoreNames();
      const num = parseInt(trimmed);
      let selectedStore = '';
      if (!isNaN(num) && num >= 1 && num <= stores.length) {
        selectedStore = stores[num - 1];
      } else {
        const lowerInput = trimmed.toLowerCase();
        selectedStore = stores.find(
          (s) => s.toLowerCase().includes(lowerInput) || lowerInput.includes(s.toLowerCase())
        ) || '';
      }

      if (!selectedStore) {
        await sendWhatsAppMessage(
          phoneNumber,
          'Hmm, I don\'t recognise that one. Could you type the name or number from the list?\n\nSend "Cancel" to start over.'
        );
        return;
      }

      conv.data.wholesaleStore = selectedStore;
      conv.step = 'askPhone';
      await sendWhatsAppMessage(
        phoneNumber,
        'Almost there! \uD83D\uDE4C What\'s the best *phone number* to reach you if you win?'
      );
      break;
    }

    case 'askPhone': {
      const digits = trimmed.replace(/[^0-9]/g, '');
      let phone = digits;
      if (phone.startsWith('0') && phone.length === 10) {
        phone = '27' + phone.substring(1);
      }
      if (phone.startsWith('+')) {
        phone = phone.substring(1);
      }

      if (phone.length < 10 || phone.length > 15) {
        await sendWhatsAppMessage(
          phoneNumber,
          'Hmm, that doesn\'t look right. Could you double-check? \uD83D\uDCDE\nExample: 0721234567'
        );
        return;
      }

      conv.data.consumerPhone = phone;
      conv.step = 'askSlip';

      try {
        const maxEntry = await db.competitionEntry.findFirst({
          orderBy: { entryNumber: 'desc' },
          select: { entryNumber: true },
        });
        const entryNumber = (maxEntry?.entryNumber || 0) + 1;

        // Split full name for DB compatibility
        const nameParts = (conv.data.fullName || '').split(/\s+/);
        const firstName = nameParts[0] || '';
        const surname = nameParts.slice(1).join(' ') || '';

        const newEntry = await db.competitionEntry.create({
          data: {
            dateOfBirth: '',
            firstName,
            surname,
            traderName: conv.data.traderName || '',
            storeAddress: conv.data.storeAddress || '',
            wholesaleStore: conv.data.wholesaleStore || '',
            consumerPhone: phone,
            consumerName: conv.data.fullName || '',
            consumerLocation: conv.data.storeAddress || '',
            entryNumber,
            validationResult: 'pending',
          },
        });

        conv.entryId = newEntry.id;

        await sendWhatsAppMessage(
          phoneNumber,
          `*Entry #${entryNumber} is in!* \u2705\n\n`
          + `Name: ${conv.data.fullName}\n`
          + `Store: ${conv.data.wholesaleStore}\n\n`
          + `Now for the fun part \u2014 send a *clear photo of your till slip*! \uD83D\uDCF8\n\n`
          + `Make sure we can see:\n`
          + `\u2022 The store name\n`
          + `\u2022 The date\n`
          + `\u2022 At least 2 Champion or Candy Tops products\n\n`
          + `Good lighting helps a lot! \u2600\ufe0f`
        );
      } catch (dbError) {
        console.error('[webhook] Failed to create entry:', dbError);
        await sendWhatsAppMessage(
          phoneNumber,
          'Sorry, something went wrong on our end. Please send "Start" to try again.'
        );
        resetConversation(phoneNumber);
      }
      break;
    }

    case 'askSlip':
      await sendWhatsAppMessage(
        phoneNumber,
        'Please send a *photo* of your till slip.\n\nTap the \uD83D\uDCF7 icon (or paperclip \uD83D\uDCCE) and select "Camera" or "Gallery".'
      );
      break;

    case 'validating':
      await sendWhatsAppMessage(
        phoneNumber,
        'Still checking your slip... hang tight! \u23F3'
      );
      break;

    default:
      await sendWhatsAppMessage(phoneNumber, 'Send "Hi" to start the competition entry.');
  }
}

// ─── Image Message Handler ───

async function handleImageMessage(phoneNumber: string, imageId: string) {
  const conv = getConversation(phoneNumber);

  if (conv.step !== 'askSlip' || !conv.entryId) {
    if (conv.step === 'idle') {
      await sendWhatsAppMessage(
        phoneNumber,
        'Hey! Send "*Start*" first so we can get you entered. \uD83D\uDE0A'
      );
    } else {
      await sendWhatsAppMessage(
        phoneNumber,
        'I\'m waiting for a text response right now \u2014 type your answer or send "Help" to see your options.'
      );
    }
    return;
  }

  conv.step = 'validating';
  await sendWhatsAppMessage(
    phoneNumber,
    'Got it! \uD83D\uDCF8 Let me take a look at that slip... give me about 30 seconds! \u23F3'
  );

  try {
    const imageBase64 = await downloadWhatsAppImage(imageId);
    if (!imageBase64) {
      await sendWhatsAppMessage(
        phoneNumber,
        'Sorry, I couldn\'t download your photo. Could you try sending it again?'
      );
      conv.step = 'askSlip';
      return;
    }

    await db.competitionEntry.update({
      where: { id: conv.entryId },
      data: { slipPhotoData: imageBase64 },
    });

    const result = await validateTillSlip(conv.entryId, imageBase64);

    if (result.result === 'confirmed') {
      await sendWhatsAppMessage(
        phoneNumber,
        `*\u2705 You\'re in the draw!*\n\n`
        + `We verified your slip:\n`
        + `\u2022 Store: ${result.storeName}\n`
        + `\u2022 Date: ${result.slipDate}\n`
        + `\u2022 Products: ${result.championProducts}\n\n`
        + `You\'re now eligible for our *R1 000 weekly cash prize* and the *R20 000 grand prize*! \uD83C\uDF89\n\n`
        + `Buy more Champion products for more chances. Good luck! \uD83C\uDFC6`
      );
    } else if (result.result === 'rejected' && result.isDuplicate) {
      await sendWhatsAppMessage(
        phoneNumber,
        `*\u26A0\ufe0f We\'ve already seen this slip*\n\n${result.reason}\n\n`
        + `Each till slip can only be entered once, but you can try with a different one! Send "*Start*". \uD83D\uDE0A`
      );
    } else if (result.result === 'rejected') {
      await sendWhatsAppMessage(
        phoneNumber,
        `*\u274C Not quite right*\n\n${result.reason}\n\n`
        + `No stress \u2014 grab another slip and send "*Start*" to try again. \uD83D\uDE4A`
      );
    } else {
      await sendWhatsAppMessage(
        phoneNumber,
        `*\u23F3 We\'re still checking your slip*\n\n${result.reason}\n\n`
        + `Send "*Status*" in a bit to see your result.`
      );
    }

    resetConversation(phoneNumber);
  } catch (error) {
    console.error('[webhook] Image handling error:', error);
    await sendWhatsAppMessage(
      phoneNumber,
      'Something went wrong processing your slip. Please send "Start" to try again.'
    );
    resetConversation(phoneNumber);
  }
}

// ─── Download WhatsApp Image ───

async function downloadWhatsAppImage(mediaId: string): Promise<string | null> {
  const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
  if (!API_TOKEN) {
    console.error('[webhook] WHATSAPP_API_TOKEN not set');
    return null;
  }

  try {
    let mediaUrl = '';
    if (BSP_PROVIDER === '360dialog') {
      const res = await fetch(`https://waba.360dialog.io/v1/media/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${API_TOKEN}` },
      });
      if (!res.ok) {
        console.error(`[webhook] 360dialog media fetch failed: ${res.status}`);
        return null;
      }
      const data = await res.json();
      mediaUrl = data.url || data.media?.url || '';
    } else {
      const res = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${API_TOKEN}` },
      });
      if (!res.ok) {
        console.error(`[webhook] Meta media fetch failed: ${res.status}`);
        return null;
      }
      const data = await res.json();
      mediaUrl = data.url || '';
    }

    if (!mediaUrl) {
      console.error('[webhook] No media URL returned');
      return null;
    }

    const imageRes = await fetch(mediaUrl);
    if (!imageRes.ok) {
      console.error(`[webhook] Image download failed: ${imageRes.status}`);
      return null;
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    console.log(`[webhook] Image downloaded: ${base64.length} chars (base64)`);
    return base64;
  } catch (error) {
    console.error('[webhook] Image download error:', error);
    return null;
  }
}

// ─── VLM Till Slip Validation ───

async function validateTillSlip(
  entryId: string,
  imageBase64: string
): Promise<{
    result: 'confirmed' | 'rejected' | 'pending';
    reason: string;
    storeName: string;
    slipDate: string;
    slipAmount: string;
    championProducts: string;
    confidence: number;
    isDuplicate: boolean;
  }> {
  let defaultResult = {
    result: 'pending' as const,
    reason: 'Validation in progress \u2014 check back shortly.',
    storeName: '', slipDate: '', slipAmount: '', championProducts: '', confidence: 0, isDuplicate: false,
  };

  const entry = await db.competitionEntry.findUnique({ where: { id: entryId } });
  if (!entry) return defaultResult;

  const participatingStoreNames = await getParticipatingStoreNames();
  const storeList = participatingStoreNames.map((name, i) => `${i + 1}. ${name}`).join('\n');

  try {
    const zai = await createZAI();
    console.log('[webhook] ZAI initialized, starting VLM analysis...');

    const vlmResponse = await zai.chat.completions.createVision({
      model: 'glm-4v-plus',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an AI receipt/till slip validator for a Champion Toffees competition in South Africa. Analyze this till slip/receipt image carefully and respond ONLY with a JSON object (no markdown, no explanation, no backticks).

Check for:
1. Is this a valid South African store receipt/till slip?
2. Does the store name on the receipt match one of the PARTICIPATING STORES listed below? (Allow for minor variations like abbreviations, different spacing, or partial names)
3. Does it contain any Champion Toffees, Champion Sweets, or Candy Tops products? (At least 2 products required to enter)
4. Is this receipt authentic (not fabricated, edited, or a screenshot)?

PARTICIPATING STORES (only these stores are eligible):
${storeList}

Respond ONLY with a JSON object in this exact format (no markdown fences, no extra text):
{
  "isReceipt": true/false,
  "isFromParticipatingStore": true/false,
  "storeName": "the store name found",
  "matchedParticipatingStore": "matching participating store name if found",
  "date": "date in YYYY-MM-DD format",
  "totalAmount": "total amount as string",
  "hasChampionProducts": true/false,
  "championProductNames": "names of Champion products found",
  "confidence": "0-100 confidence score",
  "rejectionReason": "reason if rejected, empty string if valid"
}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    const responseText = vlmResponse.choices?.[0]?.message?.content || '';
    const strippedText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const jsonMatch = strippedText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return { ...defaultResult, reason: 'Could not analyze the image. Please try a clearer photo.' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const storeName = parsed.matchedParticipatingStore || parsed.storeName || '';
    const slipDate = parsed.date || '';
    const slipAmount = parsed.totalAmount || '';
    const championProducts = parsed.championProductNames || '';
    const confidenceScore = String(parsed.confidence || 0);

    let validationResult: 'confirmed' | 'rejected' | 'pending' = 'rejected';
    let validationReason = '';

    if (!parsed.isReceipt) {
      validationResult = 'rejected';
      validationReason = parsed.rejectionReason || 'Not a valid receipt';
    } else if (parsed.isFromParticipatingStore === false) {
      validationResult = 'rejected';
      validationReason = `The store "${parsed.storeName || 'unknown'}" is not a participating store in this competition.`;
    } else if (!parsed.hasChampionProducts) {
      validationResult = 'rejected';
      validationReason = 'No Champion or Candy Tops products found on the till slip. You need at least 2 products to enter.';
    } else {
      validationResult = 'confirmed';
      validationReason = 'Champion products verified on till slip from participating store.';
    }

    // Duplicate detection
    let isDuplicate = false;
    if (validationResult === 'confirmed') {
      const duplicate = await db.competitionEntry.findFirst({
        where: {
          id: { not: entryId },
          consumerName: entry.consumerName,
          storeName: storeName,
          slipDate: slipDate,
          slipAmount: slipAmount,
          validationResult: { not: 'rejected' },
        },
      });
      if (duplicate) {
        isDuplicate = true;
        validationResult = 'rejected';
        validationReason = 'This till slip has already been submitted.';
      }
    }

    // Fraud detection
    let isFraud = false;
    if (validationResult === 'confirmed') {
      const similarCount = await db.competitionEntry.count({
        where: { consumerPhone: entry.consumerPhone, storeName: storeName, validationResult: 'confirmed' },
      });
      if (similarCount > 5) {
        isFraud = true;
        validationResult = 'rejected';
        validationReason = 'Multiple similar entries detected \u2014 flagged for review.';
      }
    }

    await db.competitionEntry.update({
      where: { id: entryId },
      data: {
        validated: validationResult === 'confirmed',
        validationResult, validationReason, storeName, slipDate, slipAmount,
        championProducts, confidenceScore,
        isDuplicate, isFraud,
      },
    });

    return { result: validationResult, reason: validationReason, storeName, slipDate, slipAmount, championProducts, confidence: Number(confidenceScore) / 100, isDuplicate };
  } catch (vlmError) {
    const errMsg = vlmError instanceof Error ? vlmError.message : String(vlmError);
    console.error('[webhook] VLM error:', errMsg);

    const pendingReason =
      errMsg.includes('429') || errMsg.includes('rate limit')
        ? 'Validation is busy \u2014 your entry will be reviewed within 30 minutes.'
        : 'Your till slip is under review \u2014 results will be available shortly.';

    await db.competitionEntry.update({
      where: { id: entryId },
      data: { validationResult: 'pending', validationReason: pendingReason },
    });

    return { ...defaultResult, reason: pendingReason };
  }
}

// ─── Check Entry Status ───

async function checkEntryStatus(phoneNumber: string) {
  try {
    const latestEntry = await db.competitionEntry.findFirst({
      where: { consumerPhone: phoneNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestEntry) {
      await sendWhatsAppMessage(phoneNumber, 'No entries found for your number yet. Send "*Start*" to enter! \uD83C\uDFC6');
      return;
    }

    const statusEmoji =
      latestEntry.validationResult === 'confirmed' ? '✅'
        : latestEntry.isDuplicate ? '⚠️'
          : latestEntry.validationResult === 'rejected' ? '❌'
            : '⏳';

    await sendWhatsAppMessage(
      phoneNumber,
      `*Entry #${latestEntry.entryNumber} \u2014 ${statusEmoji} ${latestEntry.validationResult.toUpperCase()}*\n\n`
      + `Name: ${latestEntry.consumerName}\n`
      + `Store: ${latestEntry.storeName || 'N/A'}\n`
      + `Date: ${latestEntry.slipDate || 'N/A'}\n`
      + `Amount: R${latestEntry.slipAmount || 'N/A'}\n`
      + `Products: ${latestEntry.championProducts || 'N/A'}\n\n`
      + `${latestEntry.validationReason || ''}`
    );
  } catch (error) {
    console.error('[webhook] Status check error:', error);
    await sendWhatsAppMessage(phoneNumber, 'Could not check your entry right now. Please try again in a bit.');
  }
}

// ─── Start New Entry ───

async function startNewEntry(phoneNumber: string) {
  const conv = getConversation(phoneNumber);
  conv.step = 'askFullName';
  conv.data = {};
  conv.lastUpdated = Date.now();

  await sendWhatsAppMessage(
    phoneNumber,
    '*Hey there! Welcome to Champion \u2014 Upgrade Your Hustle!* \uD83C\uDFC6\n\n'
    + 'Here\'s how it works:\n'
    + '\uD83D\uDED2 Buy any 2 Champion or Candy Tops products\n'
    + '\uD83D\uDCF8 Snap your till slip\n'
    + '\uD83C\uDF89 Win *R1 000 cash* every week + *R20 000* in grand prizes!\n\n'
    + "Let\'s get you entered! What\'s your *full name*?"
  );
}

// ─── Send WhatsApp Message ───

async function sendWhatsAppMessage(to: string, message: string) {
  const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!API_TOKEN || !PHONE_NUMBER_ID) {
    console.log(`[WhatsApp Mock] To ${to}: "${message.substring(0, 80)}..."`);
    return;
  }

  try {
    let url: string;
    const body: Record<string, unknown> = {
      to, type: 'text', text: { body: message },
    };

    if (BSP_PROVIDER === '360dialog') {
      url = 'https://waba.360dialog.io/v1/messages';
      body['preview_url'] = false;
    } else {
      url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
      body['messaging_product'] = 'whatsapp';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[WhatsApp] Send failed (${res.status}):`, errorBody);
    }
  } catch (error) {
    console.error('[WhatsApp] Send error:', error);
  }
}

// ─── Mark Message as Read ───

async function markMessageAsRead(messageId: string) {
  const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!API_TOKEN || !PHONE_NUMBER_ID) return;
  if (BSP_PROVIDER === '360dialog') return; // 360dialog auto-acks

  try {
    await fetch(`https://graph.facebook.com/v21.0/${messageId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'read' }),
    });
  } catch {
    // Non-critical
  }
}