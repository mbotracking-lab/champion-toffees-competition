import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

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
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this till slip/receipt image carefully. Extract the following information and respond ONLY in this exact JSON format (no other text):

{
  "isReceipt": true/false,
  "storeName": "the name of the store/shop",
  "date": "the date on the receipt in YYYY-MM-DD format, or empty if not found",
  "totalAmount": "the total amount paid, as a number string",
  "hasChampionProducts": true/false,
  "championProductNames": "names of any Champion/Champion Toffees products found, or empty string",
  "confidence": "your confidence level as a percentage 0-100",
  "rejectionReason": "reason if rejected, or empty string if valid"
}

Rules:
- isReceipt should be true only if this is clearly a retail store receipt/till slip
- hasChampionProducts should be true if you can identify any product named "Champion" or "Champion Toffees" on the receipt
- confidence should reflect how certain you are about your analysis
- rejectionReason should explain why if the receipt is invalid (e.g. "Not a valid receipt", "No Champion products found", "Image is unclear")
- If Champion products are found, list their names in championProductNames`,
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

        storeName = parsed.storeName || '';
        slipDate = parsed.date || '';
        slipAmount = parsed.totalAmount || '';
        championProducts = parsed.championProductNames || '';
        confidenceScore = String(parsed.confidence || 0);

        if (!parsed.isReceipt) {
          validationResult = 'rejected';
          validationReason = parsed.rejectionReason || 'Not a valid receipt';
        } else if (!parsed.hasChampionProducts) {
          validationResult = 'rejected';
          validationReason = 'No Champion products found on the till slip';
        } else {
          validationResult = 'confirmed';
          validationReason = 'Champion products verified on till slip';
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
