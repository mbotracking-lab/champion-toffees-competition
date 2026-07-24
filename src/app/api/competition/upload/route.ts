import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

interface ValidationResult {
  result: 'confirmed' | 'rejected' | 'duplicate';
  reason: string;
  storeName: string;
  slipDate: string;
  slipAmount: string;
  championProducts: string[];
  confidence: number;
  isFraud: boolean;
}

async function getParticipatingStoreNames(): Promise<string[]> {
  const stores = await db.participatingStore.findMany({
    select: { name: true, region: true },
    orderBy: { name: 'asc' },
  });
  return stores.map(s => s.name);
}

function buildStoreListForPrompt(storeNames: string[]): string {
  if (storeNames.length === 0) return '';
  return storeNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entryId, imageBase64 } = body;

    if (!entryId || !imageBase64) {
      return NextResponse.json(
        { error: 'Entry ID and image data are required' },
        { status: 400 }
      );
    }

    const entry = await db.competitionEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }

    // Get participating stores for VLM validation
    const participatingStoreNames = await getParticipatingStoreNames();
    const storeList = buildStoreListForPrompt(participatingStoreNames);

    await db.competitionEntry.update({
      where: { id: entryId },
      data: { slipPhotoData: imageBase64 },
    });

    let validationResult = 'rejected';
    let validationReason = '';
    let storeName = '';
    let slipDate = '';
    let slipAmount = '';
    let championProducts = '';
    let confidenceScore = '0';

    try {
      const zai = await ZAI.create();
      const vlmResponse = await zai.chat.completions.createVision({
        model: 'glm-4v-plus',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are an AI receipt/till slip validator for a Champion Toffees competition in South Africa. Analyze this till slip/receipt image carefully and respond ONLY with a JSON object (no markdown, no explanation).

Check for:
1. Is this a valid South African store receipt/till slip?
2. Does the store name on the receipt match one of the PARTICIPATING STORES listed below? (Allow for minor variations like abbreviations, different spacing, or partial names)
3. Does it contain any Champion Toffees or Champion Sweets products?
4. Is this receipt authentic (not fabricated, edited, or a screenshot)?

PARTICIPATING STORES (only these stores are eligible):
${storeList}

Respond ONLY with a JSON object in this exact format:
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
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        storeName = parsed.matchedParticipatingStore || parsed.storeName || '';
        slipDate = parsed.date || '';
        slipAmount = parsed.totalAmount || '';
        championProducts = parsed.championProductNames || '';
        confidenceScore = String(parsed.confidence || 0);

        if (!parsed.isReceipt) {
          validationResult = 'rejected';
          validationReason = parsed.rejectionReason || 'Not a valid receipt';
        } else if (parsed.isFromParticipatingStore === false) {
          validationResult = 'rejected';
          validationReason = `The store "${parsed.storeName || 'unknown'}" is not a participating store in this competition. Only receipts from eligible stores qualify.`;
        } else if (!parsed.hasChampionProducts) {
          validationResult = 'rejected';
          validationReason = 'No Champion products found on the till slip';
        } else {
          validationResult = 'confirmed';
          validationReason = 'Champion products verified on till slip from participating store';
        }
      } else {
        validationResult = 'rejected';
        validationReason = 'Could not analyze the image properly';
      }
    } catch (vlmError) {
      console.error('VLM analysis error:', vlmError);
      validationResult = 'pending';
      validationReason = 'AI validation temporarily unavailable - entry will be manually reviewed';
    }

    if (validationResult === 'confirmed') {
      const duplicate = await db.competitionEntry.findFirst({
        where: {
          id: { not: entryId },
          consumerName: entry.consumerName,
          consumerPhone: entry.consumerPhone,
          storeName: storeName,
          slipDate: slipDate,
          slipAmount: slipAmount,
          validationResult: { not: 'rejected' },
        },
      });

      if (duplicate) {
        validationResult = 'duplicate';
        validationReason = 'This till slip has already been submitted';
      }
    }

    let isFraud = false;
    if (validationResult === 'confirmed') {
      const similarEntries = await db.competitionEntry.count({
        where: {
          consumerPhone: entry.consumerPhone,
          storeName: storeName,
          validationResult: 'confirmed',
        },
      });
      if (similarEntries > 5) {
        isFraud = true;
        validationReason = 'Multiple similar entries detected - flagged for review';
      }
    }

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

    return NextResponse.json({
      success: true,
      validation: {
        result: validationResult,
        reason: validationReason,
        storeName,
        slipDate,
        slipAmount,
        championProducts,
        confidence: confidenceScore,
        isFraud,
      },
    });
  } catch (error) {
    console.error('Error uploading/validating:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}
