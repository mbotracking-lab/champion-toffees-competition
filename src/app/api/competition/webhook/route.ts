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
// Each phone number is tracked through a multi-step conversation.
// State is stored in a simple in-memory map (safe for single-instance Vercel).
// For multi-instance, use Upstash Redis or similar.

type ConversationStep =
  | 'idle'
  | 'askDob'
  | 'askFirstName'
  | 'askSurname'
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
    dateOfBirth?: string;
    firstName?: string;
    surname?: string;
    traderName?: string;
    storeAddress?: string;
    wholesaleStore?: string;
    consumerPhone?: string;
  };
  lastUpdated: number;
}

// In-memory conversation store. Entries expire after 30 minutes of inactivity.
const conversations = new Map<string, ConversationState>();
const CONVERSATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
const STORES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
// Both Meta and 360dialog use the same hub.challenge handshake.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }
  console.warn('[webhook] Verification failed — mismatched token');
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ─── Webhook Message Handler (POST) ───
// 360dialog forwards messages in the same format as Meta's webhook.
// The structure is: body.entry[].changes[].value.messages[]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const messages = (change.value || {}).messages || [];
        for (const message of messages) {
          const from = message.from; // sender phone in international format
          const type = message.type;
          const msgId = message.id; // WhatsApp message ID (for ack)

          // Acknowledge receipt (prevents "clock" icon on WhatsApp)
          await markMessageAsRead(msgId);

          if (type === 'text') {
            await handleTextMessage(from, message.text?.body || '');
          } else if (type === 'image') {
            const imageId = message.image?.id || '';
            const imageCaption = message.image?.caption || '';
            await handleImageMessage(from, imageId, imageCaption);
          } else {
            // Unsupported message type — guide user
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
// Routes the user through the full competition entry flow step by step.

async function handleTextMessage(phoneNumber: string, text: string) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const conv = getConversation(phoneNumber);

  // Global commands — work at any step
  if (lower === 'start' || lower === 'hi' || lower === 'hello' || lower === 'enter') {
    // If they already have a pending entry, ask for the slip
    if (conv.step === 'askSlip' && conv.entryId) {
      await sendWhatsAppMessage(
        phoneNumber,
        'Welcome back! You\'re almost done. Please send a photo of your till slip showing Champion Toffees products.'
      );
      return;
    }
    // Otherwise restart fresh
    resetConversation(phoneNumber);
    await startNewEntry(phoneNumber);
    return;
  }

  if (lower === 'cancel' || lower === 'stop' || lower === 'exit') {
    resetConversation(phoneNumber);
    await sendWhatsAppMessage(
      phoneNumber,
      'Entry cancelled. Send "Hi" or "Start" anytime to begin a new entry. Goodbye!'
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
      '*Champion Toffees Competition Help*\n\n'
      + '*Start* — Begin a new competition entry\n'
      + '*Status* — Check your latest entry result\n'
      + '*Cancel* — Cancel current entry\n'
      + '*Help* — Show this message\n\n'
      + 'Send "Hi" or "Start" to begin!'
    );
    return;
  }

  // Step-by-step flow
  switch (conv.step) {
    case 'idle':
      // User sent text but hasn't started — guide them
      await sendWhatsAppMessage(
        phoneNumber,
        'Welcome to the *Champion Toffees Competition*! \uD83C\uDFC6\n\n'
        + 'Send "*Start*" or "*Hi*" to begin your entry.\n\n'
        + 'Buy Champion Toffees from a participating store, snap your till slip, and win amazing prizes!'
      );
      break;

    case 'askDob': {
      // Validate date format DD/MM/YYYY
      const dobMatch = trimmed.match(/^(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})$/);
      if (!dobMatch) {
        await sendWhatsAppMessage(
          phoneNumber,
          'Please enter your date of birth in *DD/MM/YYYY* format.\nExample: 15/06/1990'
        );
        return;
      }
      const day = dobMatch[1].padStart(2, '0');
      const month = dobMatch[2].padStart(2, '0');
      let year = dobMatch[3];
      if (year.length === 2) year = '19' + year;
      const dob = `${day}/${month}/${year}`;

      // Basic age check (must be 18+)
      const birthDate = new Date(`${year}-${month}-${day}`);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;

      if (age < 18) {
        await sendWhatsAppMessage(
          phoneNumber,
          'Sorry, you must be *18 years or older* to enter this competition. '\n'
        );
        resetConversation(phoneNumber);
        return;
      }

      conv.data.dateOfBirth = dob;
      conv.step = 'askFirstName';
      await sendWhatsAppMessage(phoneNumber, 'What is your *first name*?');
      break;
    }

    case 'askFirstName': {
      const name = trimmed.replace(/[^a-zA-Z\s'-]/g, '').trim();
      if (name.length < 2) {
        await sendWhatsAppMessage(phoneNumber, 'Please enter a valid first name (at least 2 characters).');
        return;
      }
      conv.data.firstName = name;
      conv.step = 'askSurname';
      await sendWhatsAppMessage(phoneNumber, 'What is your *surname*?');
      break;
    }

    case 'askSurname': {
      const surname = trimmed.replace(/[^a-zA-Z\s'-]/g, '').trim();
      if (surname.length < 2) {
        await sendWhatsAppMessage(phoneNumber, 'Please enter a valid surname (at least 2 characters).');
        return;
      }
      conv.data.surname = surname;
      conv.step = 'askTraderName';
      await sendWhatsAppMessage(
        phoneNumber,
        'What is the *name of the trader/spaza shop* you bought from? (Or type "N/A" if not applicable)'
      );
      break;
    }

    case 'askTraderName': {
      conv.data.traderName = trimmed === 'n/a' ? '' : trimmed;
      conv.step = 'askStoreAddress';
      await sendWhatsAppMessage(
        phoneNumber,
        'What is the *address or area* of the store? (e.g., "Khayelitsha Site C" or "CBD Johannesburg")'
      );
      break;
    }

    case 'askStoreAddress': {
      if (trimmed.length < 3) {
        await sendWhatsAppMessage(phoneNumber, 'Please enter a valid store address or area.');
        return;
      }
      conv.data.storeAddress = trimmed;
      conv.step = 'askWholesaleStore';

      // Send list of participating wholesale stores
      const stores = await getParticipatingStoreNames();
      const storeList = stores
        .map((name, i) => `${i + 1}. ${name}`)
        .join('\n');

      await sendWhatsAppMessage(
        phoneNumber,
        `Which *wholesale store* did you purchase from?\n\n${storeList}\n\nType the name or number.`
      );
      break;
    }

    case 'askWholesaleStore': {
      const stores = await getParticipatingStoreNames();

      // Check if they typed a number
      const num = parseInt(trimmed);
      let selectedStore = '';
      if (!isNaN(num) && num >= 1 && num <= stores.length) {
        selectedStore = stores[num - 1];
      } else {
        // Fuzzy match against store names
        const lowerInput = trimmed.toLowerCase();
        selectedStore = stores.find(
          (s) => s.toLowerCase().includes(lowerInput) || lowerInput.includes(s.toLowerCase())
        ) || '';
      }

      if (!selectedStore) {
        await sendWhatsAppMessage(
          phoneNumber,
          'Store not recognised. Please type the *name* or *number* from the list above.\n\n'
          + 'Send "Cancel" to start over.'
        );
        return;
      }

      conv.data.wholesaleStore = selectedStore;
      conv.step = 'askPhone';
      await sendWhatsAppMessage(
        phoneNumber,
        'What is your *contact phone number*? (in case we need to contact you about a prize)'
      );
      break;
    }

    case 'askPhone': {
      // Clean phone number — keep only digits, add +27 if starts with 0
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
          'Please enter a valid South African phone number.\nExample: 0721234567 or +27721234567'
        );
        return;
      }

      conv.data.consumerPhone = phone;
      conv.step = 'askSlip';

      // Create the entry in the database
      try {
        const maxEntry = await db.competitionEntry.findFirst({
          orderBy: { entryNumber: 'desc' },
          select: { entryNumber: true },
        });
        const entryNumber = (maxEntry?.entryNumber || 0) + 1;

        const newEntry = await db.competitionEntry.create({
          data: {
            dateOfBirth: conv.data.dateOfBirth || '',
            firstName: conv.data.firstName || '',
            surname: conv.data.surname || '',
            traderName: conv.data.traderName || '',
            storeAddress: conv.data.storeAddress || '',
            wholesaleStore: conv.data.wholesaleStore || '',
            consumerPhone: phone,
            consumerName: `${conv.data.firstName} ${conv.data.surname}`,
            consumerLocation: conv.data.storeAddress || '',
            entryNumber,
            validationResult: 'pending',
          },
        });

        conv.entryId = newEntry.id;

        await sendWhatsAppMessage(
          phoneNumber,
          `*Entry #${entryNumber} registered!* \u2705\n\n`
          + `Name: ${conv.data.firstName} ${conv.data.surname}\n`
          + `Store: ${conv.data.wholesaleStore}\n\n`
          + `Now send a *clear photo of your till slip* showing Champion Toffees products.\n\n`
          + `Make sure the slip shows:\n`
          + `\u2022 Store name\n`
          + `\u2022 Date\n`
          + `\u2022 Champion Toffees product(s)\n\n`
          + `Take the photo in good lighting for best results! \uD83D\uDCF8`
        );
      } catch (dbError) {
        console.error('[webhook] Failed to create entry:', dbError);
        await sendWhatsAppMessage(
          phoneNumber,
          'Sorry, something went wrong saving your entry. Please try again by sending "Start".'
        );
        resetConversation(phoneNumber);
      }
      break;
    }

    case 'askSlip':
      await sendWhatsAppMessage(
        phoneNumber,
        'Please send a *photo* of your till slip.\n\n'
        + 'To take a photo: tap the \uD83D\uDCF7 icon (or paperclip \uD83D\uDCCE) and select "Camera" or "Gallery".'
      );
      break;

    case 'validating':
      await sendWhatsAppMessage(
        phoneNumber,
        'Your till slip is being validated. Please wait for the result... \u23F3'
      );
      break;

    default:
      await sendWhatsAppMessage(phoneNumber, 'Send "Hi" to start the competition entry.');
  }
}

// ─── Image Message Handler ───
// Downloads the image from WhatsApp, runs VLM validation, updates the entry.

async function handleImageMessage(phoneNumber: string, imageId: string, caption: string) {
  const conv = getConversation(phoneNumber);

  if (conv.step !== 'askSlip' || !conv.entryId) {
    // If they haven't started an entry yet
    if (conv.step === 'idle') {
      await sendWhatsAppMessage(
        phoneNumber,
        'Please start your entry first! Send "*Start*" or "*Hi*" to begin.'
      );
    } else {
      await sendWhatsAppMessage(
        phoneNumber,
        'I\'m expecting text input right now, not a photo. Please type your response or send "Help".'
      );
    }
    return;
  }

  conv.step = 'validating';
  await sendWhatsAppMessage(
    phoneNumber,
    'Till slip received! \uD83D\uDCF8 Validating... please wait (this takes about 30 seconds). \u23F3'
  );

  try {
    // Step 1: Download the image from WhatsApp
    const imageBase64 = await downloadWhatsAppImage(imageId);
    if (!imageBase64) {
      await sendWhatsAppMessage(
        phoneNumber,
        'Sorry, I couldn\'t download your photo. Please try sending it again.'
      );
      conv.step = 'askSlip';
      return;
    }

    // Step 2: Store the image in the database
    await db.competitionEntry.update({
      where: { id: conv.entryId },
      data: { slipPhotoData: imageBase64 },
    });

    // Step 3: Run VLM validation (same logic as the web upload route)
    const result = await validateTillSlip(conv.entryId, imageBase64);

    // Step 4: Send result to user
    if (result.result === 'confirmed') {
      await sendWhatsAppMessage(
        phoneNumber,
        `*\u2705 Entry Confirmed!*\n\n`
        + `Your till slip has been validated:\n`
        + `\u2022 Store: ${result.storeName}\n`
        + `\u2022 Date: ${result.slipDate}\n`
        + `\u2022 Amount: R${result.slipAmount}\n`
        + `\u2022 Products: ${result.championProducts}\n`
        + `\u2022 Confidence: ${Math.round(result.confidence * 100)}%\n\n`
        + `You\'re in the draw! Good luck! \uD83C\uDF89`
      );
    } else if (result.result === 'rejected') {
      await sendWhatsAppMessage(
        phoneNumber,
        `*\u274C Entry Rejected*\n\n${result.reason}\n\n`
        + `Send "*Start*" to try again with a different till slip.`
      );
    } else if (result.result === 'duplicate') {
      await sendWhatsAppMessage(
        phoneNumber,
        `*\u26A0\ufe0f Duplicate Entry*\n\n${result.reason}\n\n`
        + `Each till slip can only be entered once.`
      );
    } else {
      // pending — VLM was unavailable
      await sendWhatsAppMessage(
        phoneNumber,
        `*\u23F3 Pending Review*\n\n${result.reason}\n\n`
        + `Send "*Status*" later to check your result.`
      );
    }

    // Reset conversation for next entry
    resetConversation(phoneNumber);
  } catch (error) {
    console.error('[webhook] Image handling error:', error);
    await sendWhatsAppMessage(
      phoneNumber,
      'Something went wrong processing your till slip. Please try again by sending "Start".'
    );
    resetConversation(phoneNumber);
  }
}

// ─── Download WhatsApp Image ───
// Works with both Meta Direct API and 360dialog.

async function downloadWhatsAppImage(mediaId: string): Promise<string | null> {
  const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
  if (!API_TOKEN) {
    console.error('[webhook] WHATSAPP_API_TOKEN not set — cannot download image');
    return null;
  }

  try {
    // Step 1: Get the media URL
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
      // Meta Direct API
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

    // Step 2: Download the actual image
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
// Identical logic to the web upload route.

async function validateTillSlip(
  entryId: string,
  imageBase64: string
): Promise<{
  result: 'confirmed' | 'rejected' | 'duplicate' | 'pending';
  reason: string;
  storeName: string;
  slipDate: string;
  slipAmount: string;
  championProducts: string;
  confidence: number;
}> {
  // Default: pending
  let defaultResult = {
    result: 'pending' as const,
    reason: 'Validation in progress — check back shortly.',
    storeName: '',
    slipDate: '',
    slipAmount: '',
    championProducts: '',
    confidence: 0,
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
3. Does it contain any Champion Toffees or Champion Sweets products?
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
      validationReason = `The store "${parsed.storeName || 'unknown'}" is not a participating store in this competition. Only receipts from eligible stores qualify.`;
    } else if (!parsed.hasChampionProducts) {
      validationResult = 'rejected';
      validationReason = 'No Champion products found on the till slip.';
    } else {
      validationResult = 'confirmed';
      validationReason = 'Champion products verified on till slip from participating store.';
    }

    // Duplicate detection
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
        validationResult = 'duplicate';
        validationReason = 'This till slip has already been submitted.';
      }
    }

    // Fraud detection
    let isFraud = false;
    if (validationResult === 'confirmed') {
      const similarCount = await db.competitionEntry.count({
        where: {
          consumerPhone: entry.consumerPhone,
          storeName: storeName,
          validationResult: 'confirmed',
        },
      });
      if (similarCount > 5) {
        isFraud = true;
        validationResult = 'rejected';
        validationReason = 'Multiple similar entries detected — flagged for review.';
      }
    }

    // Update the entry in the database
    await db.competitionEntry.update({
      where: { id: entryId },
      data: {
        validated: validationResult === 'confirmed',
        validationResult,
        validationReason,
        storeName,
        slipDate,
        slipAmount,
        championProducts,
        confidenceScore,
        isDuplicate: validationResult === 'duplicate',
        isFraud,
      },
    });

    return {
      result: validationResult,
      reason: validationReason,
      storeName,
      slipDate,
      slipAmount,
      championProducts,
      confidence: Number(confidenceScore) / 100,
    };
  } catch (vlmError) {
    const errMsg = vlmError instanceof Error ? vlmError.message : String(vlmError);
    console.error('[webhook] VLM error:', errMsg);

    // On VLM failure, mark as pending for batch review later
    const pendingReason =
      errMsg.includes('429') || errMsg.includes('rate limit')
        ? 'Validation is busy — your entry will be reviewed within 30 minutes.'
        : 'Your till slip is under review — results will be available shortly.';

    await db.competitionEntry.update({
      where: { id: entryId },
      data: {
        validationResult: 'pending',
        validationReason: pendingReason,
      },
    });

    return { ...defaultResult, reason: pendingReason };
  }
}

// ─── Check Entry Status ───
// Lets a user check their latest entry result.

async function checkEntryStatus(phoneNumber: string) {
  try {
    const latestEntry = await db.competitionEntry.findFirst({
      where: { consumerPhone: phoneNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestEntry) {
      await sendWhatsAppMessage(
        phoneNumber,
        'No entries found for your number. Send "*Start*" to enter!'
      );
      return;
    }

    const statusEmoji =
      latestEntry.validationResult === 'confirmed'
        ? '\u2705'
        : latestEntry.validationResult === 'rejected'
          ? '\u274C'
          : latestEntry.validationResult === 'duplicate'
            ? '\u26A0\ufe0f'
            : '\u23F3';

    await sendWhatsAppMessage(
      phoneNumber,
      `*Entry #${latestEntry.entryNumber} — ${statusEmoji} ${latestEntry.validationResult.toUpperCase()}*\n\n`
      + `Name: ${latestEntry.consumerName}\n`
      + `Store: ${latestEntry.storeName || 'N/A'}\n`
      + `Date: ${latestEntry.slipDate || 'N/A'}\n`
      + `Amount: R${latestEntry.slipAmount || 'N/A'}\n`
      + `Products: ${latestEntry.championProducts || 'N/A'}\n\n`
      + `${latestEntry.validationReason || ''}`
    );
  } catch (error) {
    console.error('[webhook] Status check error:', error);
    await sendWhatsAppMessage(phoneNumber, 'Could not check your entry status. Please try again later.');
  }
}

// ─── Start New Entry ───

async function startNewEntry(phoneNumber: string) {
  const conv = getConversation(phoneNumber);
  conv.step = 'askDob';
  conv.data = {};
  conv.lastUpdated = Date.now();

  await sendWhatsAppMessage(
    phoneNumber,
    '*Champion Toffees Competition* \uD83C\uDFC6\n\n'
    + 'Let\'s get you entered! I\'ll ask you a few quick questions.\n\n'
    + 'First, what is your *date of birth*?\n'
    + '(Format: DD/MM/YYYY — you must be 18 or older to enter)'
  );
}

// ─── Send WhatsApp Message ───
// Supports both 360dialog and Meta Direct API.

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
      to,
      type: 'text',
      text: { body: message },
    };

    if (BSP_PROVIDER === '360dialog') {
      // 360dialog API format
      url = 'https://waba.360dialog.io/v1/messages';
      body['preview_url'] = false;
      // 360dialog doesn't need messaging_product field
    } else {
      // Meta Direct API format
      url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
      body['messaging_product'] = 'whatsapp';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
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
// Removes the "clock" icon (pending) and shows "blue ticks" (read).

async function markMessageAsRead(messageId: string) {
  const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!API_TOKEN || !PHONE_NUMBER_ID) return;

  try {
    let url: string;
    const body: Record<string, unknown> = { status: 'read' };

    if (BSP_PROVIDER === '360dialog') {
      // 360dialog doesn't support marking as read via message ID
      // It auto-acks. Skip this call.
      return;
    }

    // Meta Direct API
    url = `https://graph.facebook.com/v21.0/${messageId}`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Non-critical — don't block the flow
  }
}