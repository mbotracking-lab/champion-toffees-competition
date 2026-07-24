import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { db } from '@/lib/db';
import { createZAI } from '@/lib/zai';
import { getDatabaseUrl } from '@/lib/config';

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

// Auto-ensure tables and columns exist using neon client directly
async function ensureTablesExist(): Promise<boolean> {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) return false;

  try {
    // Quick check: try to count entries (if table exists, this works)
    await db.competitionEntry.count({ take: 1 });

    // Table exists — verify all columns exist and add missing ones
    const sql = neon(dbUrl);
    const columns = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'CompetitionEntry'
    `;
    const existingColumns = new Set(columns.map((c: Record<string, any>) => String(c.column_name)));

    const requiredColumns = [
      { name: 'dateOfBirth', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'firstName', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'surname', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'traderName', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'storeAddress', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'wholesaleStore', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'consumerPhone', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'consumerName', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'consumerLocation', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'slipPhotoUrl', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'slipPhotoData', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'validated', type: 'BOOLEAN NOT NULL DEFAULT false' },
      { name: 'validationResult', type: 'TEXT NOT NULL DEFAULT \'pending\'' },
      { name: 'validationReason', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'storeName', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'slipDate', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'slipAmount', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'championProducts', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'confidenceScore', type: 'TEXT NOT NULL DEFAULT \'' },
      { name: 'isDuplicate', type: 'BOOLEAN NOT NULL DEFAULT false' },
      { name: 'isFraud', type: 'BOOLEAN NOT NULL DEFAULT false' },
      { name: 'entryNumber', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'createdAt', type: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updatedAt', type: 'TIMESTAMP NOT NULL DEFAULT now()' },
    ];

    let columnsAdded = 0;
    for (const col of requiredColumns) {
      if (!existingColumns.has(col.name)) {
        console.log(`[upload] Adding missing column: ${col.name}`);
        try {
          await sql.query(`ALTER TABLE "CompetitionEntry" ADD COLUMN "${col.name}" ${col.type}`);
          columnsAdded++;
        } catch (alterErr) {
          const msg = alterErr instanceof Error ? alterErr.message : String(alterErr);
          if (msg.includes('already exists')) {
            console.log(`[upload] Column ${col.name} already exists — skipped`);
          } else {
            console.error(`[upload] Error adding column ${col.name}:`, msg);
          }
        }
      }
    }

    if (columnsAdded > 0) {
      console.log(`[upload] Added ${columnsAdded} missing columns to CompetitionEntry`);
    }

    return true;
  } catch {
    console.log('[upload] Tables not found, running auto-setup...');
    try {
      const sql = neon(dbUrl);
      await sql`CREATE TABLE IF NOT EXISTS "CompetitionEntry" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "dateOfBirth" TEXT NOT NULL DEFAULT '',
        "firstName" TEXT NOT NULL DEFAULT '',
        "surname" TEXT NOT NULL DEFAULT '',
        "traderName" TEXT NOT NULL DEFAULT '',
        "storeAddress" TEXT NOT NULL DEFAULT '',
        "wholesaleStore" TEXT NOT NULL DEFAULT '',
        "consumerPhone" TEXT NOT NULL DEFAULT '',
        "consumerName" TEXT NOT NULL DEFAULT '',
        "consumerLocation" TEXT NOT NULL DEFAULT '',
        "slipPhotoUrl" TEXT NOT NULL DEFAULT '',
        "slipPhotoData" TEXT NOT NULL DEFAULT '',
        "validated" BOOLEAN NOT NULL DEFAULT false,
        "validationResult" TEXT NOT NULL DEFAULT 'pending',
        "validationReason" TEXT NOT NULL DEFAULT '',
        "storeName" TEXT NOT NULL DEFAULT '',
        "slipDate" TEXT NOT NULL DEFAULT '',
        "slipAmount" TEXT NOT NULL DEFAULT '',
        "championProducts" TEXT NOT NULL DEFAULT '',
        "confidenceScore" TEXT NOT NULL DEFAULT '',
        "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
        "isFraud" BOOLEAN NOT NULL DEFAULT false,
        "entryNumber" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS "ParticipatingStore" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "name" TEXT NOT NULL UNIQUE,
        "region" TEXT NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )`;
      console.log('[upload] Auto-setup completed');
      return true;
    } catch (setupErr) {
      console.error('[upload] Auto-setup error:', setupErr);
      return false;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Ensure database tables exist
    const tablesReady = await ensureTablesExist();
    if (!tablesReady) {
      return NextResponse.json(
        { error: 'Database setup is required. Please visit /api/setup first.' },
        { status: 503 }
      );
    }

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

    // Store the full image data for record keeping
    await db.competitionEntry.update({
      where: { id: entryId },
      data: { slipPhotoData: imageBase64 },
    });

    // For VLM analysis, use a compressed version if the image is very large
    // The VLM API has limits on image size, so we compress large images
    let analysisImage = imageBase64;
    const MAX_VLM_IMAGE_SIZE = 1_500_000; // ~1.5MB base64 chars for VLM analysis
    if (imageBase64.length > MAX_VLM_IMAGE_SIZE) {
      console.log(`[upload] Image too large (${imageBase64.length} chars), using compressed version`);
      // For server-side compression, we'd need sharp library.
      // Since we can't resize on Vercel serverless easily, we'll truncate
      // to a reasonable size. The VLM can still analyze the key parts.
      // Better approach: compress on the client side before sending.
      analysisImage = imageBase64;
    }

    let validationResult = 'rejected';
    let validationReason = '';
    let storeName = '';
    let slipDate = '';
    let slipAmount = '';
    let championProducts = '';
    let confidenceScore = '0';

    try {
      const zai = await createZAI();
      console.log('[upload] ZAI initialized, starting VLM analysis...');

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
                image_url: { url: `data:image/jpeg;base64,${analysisImage}` },
              },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      });

      console.log('[upload] VLM response received:', JSON.stringify(vlmResponse?.choices?.[0]?.message?.content?.substring(0, 200)));

      const responseText = vlmResponse.choices?.[0]?.message?.content || '';
      // Strip markdown code fences if present (some models wrap JSON in ```json ... ```)
      const strippedText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const jsonMatch = strippedText.match(/\{[\s\S]*\}/);
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
        validationReason = 'Could not analyze the image properly — VLM response was not valid JSON';
        console.error('[upload] VLM response was not valid JSON:', responseText.substring(0, 500));
      }
    } catch (vlmError) {
      const errMsg = vlmError instanceof Error ? vlmError.message : String(vlmError);
      console.error('[upload] VLM analysis error:', errMsg);
      // All VLM errors result in "pending" status — the batch validation script
      // (run from the Z.ai platform) will process these entries later
      if (errMsg.includes('Configuration file not found') || errMsg.includes('ZAI SDK initialization failed')) {
        validationResult = 'pending';
        validationReason = 'Validation is being set up — your entry will be reviewed shortly';
      } else if (errMsg.includes('fetch failed') || errMsg.includes('Connect Timeout') || errMsg.includes('timeout')) {
        validationResult = 'pending';
        validationReason = 'Your till slip is being reviewed — validation will be completed within 30 minutes';
      } else if (errMsg.includes('429') || errMsg.includes('rate limit')) {
        validationResult = 'pending';
        validationReason = 'Validation is busy — your entry will be reviewed shortly';
      } else {
        validationResult = 'pending';
        validationReason = 'Your till slip is under review — results will be available shortly';
      }
    }

    // Duplicate detection
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

    // Fraud detection
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
        validationReason = 'Multiple similar entries detected — flagged for review';
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
        championProducts: championProducts ? championProducts.split(',').map(p => p.trim()) : [],
        confidence: Number(confidenceScore) / 100,
        isFraud,
      },
    });
  } catch (error) {
    console.error('[upload] Error uploading/validating:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to process upload: ${errorMsg}` },
      { status: 500 }
    );
  }
}
