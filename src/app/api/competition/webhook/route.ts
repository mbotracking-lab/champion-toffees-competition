import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * WhatsApp Business API Webhook Handler
 * Ready for when the WhatsApp Business API is procured.
 * 
 * SETUP: Configure webhook URL in Meta Business Suite:
 * - URL: https://your-domain.com/api/competition/webhook
 * - Verify token: set WHATSAPP_VERIFY_TOKEN in .env
 */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'champion_webhook_verify_2026';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

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

          if (type === 'text') {
            await handleTextMessage(from, message.text?.body || '');
          } else if (type === 'image') {
            await handleImageMessage(from, message.image?.id || '');
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleTextMessage(phoneNumber: string, text: string) {
  const existingEntry = await db.competitionEntry.findFirst({
    where: { consumerPhone: phoneNumber, validationResult: 'pending' },
    orderBy: { createdAt: 'desc' },
  });

  const lowerText = text.toLowerCase().trim();

  if (lowerText.includes('hi') || lowerText.includes('hello') || lowerText.includes('enter')) {
    if (existingEntry) {
      await sendWhatsAppMessage(phoneNumber, 'Welcome back! Please send your till slip photo to complete your entry.');
    } else {
      await sendWhatsAppMessage(phoneNumber, 'Welcome to Champion Toffees Competition! Send your name and location.\nExample: "Mbongeni from Khayelitsha"');
    }
    return;
  }

  if (!existingEntry) {
    const match = text.match(/^(.+?)\s+from\s+(.+)$/i);
    const name = match ? match[1].trim() : text.trim();
    const location = match ? match[2].trim() : '';

    const maxEntry = await db.competitionEntry.findFirst({
      orderBy: { entryNumber: 'desc' },
      select: { entryNumber: true },
    });
    const entryNumber = (maxEntry?.entryNumber || 0) + 1;

    await db.competitionEntry.create({
      data: { consumerName: name, consumerPhone: phoneNumber, consumerLocation: location, entryNumber, validationResult: 'pending' },
    });

    await sendWhatsAppMessage(phoneNumber, `Thanks ${name}! Entry #${entryNumber}. Now send your till slip photo showing Champion Toffees!`);
    return;
  }

  await sendWhatsAppMessage(phoneNumber, 'Send your till slip photo or say "Hi" to restart.');
}

async function handleImageMessage(phoneNumber: string, imageId: string) {
  const entry = await db.competitionEntry.findFirst({
    where: { consumerPhone: phoneNumber, validationResult: 'pending' },
    orderBy: { createdAt: 'desc' },
  });

  if (!entry) {
    await sendWhatsAppMessage(phoneNumber, 'Please register first! Send your name and location.');
    return;
  }

  await sendWhatsAppMessage(phoneNumber, 'Validating your till slip... please wait!');
  // When WhatsApp API is procured, download image and run VLM validation
  // Same logic as web upload route
}

async function sendWhatsAppMessage(to: string, message: string) {
  const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!API_TOKEN || !PHONE_NUMBER_ID) {
    console.log(`[WhatsApp Mock] To ${to}: "${message}"`);
    return;
  }

  try {
    await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message } }),
    });
  } catch (error) {
    console.error('WhatsApp send error:', error);
  }
}
