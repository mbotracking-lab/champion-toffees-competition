#!/usr/bin/env node
/**
 * Batch VLM Validation Script
 * 
 * This script processes pending CompetitionEntry records by calling the ZAI VLM API
 * from within the Z.ai platform (where internal-api.z.ai is reachable).
 * 
 * Run this script periodically from the Z.ai workspace to validate entries that
 * were submitted on the Vercel-deployed app but couldn't be validated in real-time
 * (because the VLM API is internal and not reachable from Vercel).
 * 
 * Usage: node scripts/validate-pending-entries.mjs [--limit N] [--dry-run]
 */

import ZAI from 'z-ai-web-dev-sdk';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ─── Config ───
function loadConfig() {
  const configPaths = [
    join(PROJECT_ROOT, '.z-ai-config'),
    join(process.cwd(), '.z-ai-config'),
  ];
  for (const p of configPaths) {
    try {
      const configStr = readFileSync(p, 'utf-8');
      const config = JSON.parse(configStr);
      if (config.baseUrl && config.apiKey) {
        console.log(`[config] Loaded from: ${p}`);
        return config;
      }
    } catch { /* try next */ }
  }
  throw new Error('No .z-ai-config found with baseUrl and apiKey');
}

// ─── Args parsing ───
const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50', 10);
const DRY_RUN = args.includes('--dry-run');

// ─── Main ───
async function main() {
  console.log('=== VLM Batch Validation Script ===');
  console.log(`Limit: ${LIMIT}, Dry run: ${DRY_RUN}`);
  console.log(`Time: ${new Date().toISOString()}`);

  const config = loadConfig();
  const dbUrl = config.databaseUrl;
  if (!dbUrl) {
    console.error('ERROR: No databaseUrl in config file');
    process.exit(1);
  }

  const sql = neon(dbUrl);
  
  // Initialize ZAI SDK
  const zai = new ZAI(config);
  console.log('[ZAI] SDK initialized successfully');

  // Get participating stores
  const stores = await sql`SELECT name, region FROM "ParticipatingStore" ORDER BY name ASC`;
  const storeNames = stores.map(s => s.name);
  console.log(`[stores] Found ${storeNames.length} participating stores`);

  if (storeNames.length === 0) {
    console.warn('[stores] WARNING: No participating stores found. VLM validation will be limited.');
  }

  const storeListForPrompt = storeNames.map((name, i) => `${i + 1}. ${name}`).join('\n');

  // Get pending entries
  const pendingEntries = await sql`
    SELECT id, "firstName", "surname", "traderName", "consumerPhone", "slipPhotoData", "createdAt"
    FROM "CompetitionEntry"
    WHERE "validationResult" = 'pending'
    ORDER BY "createdAt" ASC
    LIMIT ${LIMIT}
  `;

  console.log(`[entries] Found ${pendingEntries.length} pending entries to validate`);

  if (pendingEntries.length === 0) {
    console.log('[entries] No pending entries. Done.');
    return;
  }

  let validated = 0;
  let confirmed = 0;
  let rejected = 0;
  let duplicates = 0;
  let errors = 0;

  for (const entry of pendingEntries) {
    console.log(`\n--- Processing entry: ${entry.id} (${entry.firstName} ${entry.surname}) ---`);

    if (!entry.slipPhotoData) {
      console.log(`  [skip] No slip photo data for this entry`);
      await sql`
        UPDATE "CompetitionEntry" 
        SET "validationResult" = 'rejected', 
            "validationReason" = 'No till slip image provided',
            "updatedAt" = now()
        WHERE id = ${entry.id}
      `;
      rejected++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] Would validate this entry`);
      validated++;
      continue;
    }

    try {
      // Compress image if too large for VLM
      let analysisImage = entry.slipPhotoData;
      // Remove data:image prefix if present
      if (analysisImage.startsWith('data:image/')) {
        const base64Start = analysisImage.indexOf('base64,');
        if (base64Start !== -1) {
          analysisImage = analysisImage.substring(base64Start + 7);
        }
      }

      console.log(`  [VLM] Calling VLM API (image size: ${analysisImage.length} chars)...`);

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
${storeListForPrompt}

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

      const responseText = vlmResponse.choices?.[0]?.message?.content || '';
      console.log(`  [VLM] Response: ${responseText.substring(0, 200)}`);

      // Parse VLM response
      const strippedText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const jsonMatch = strippedText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        console.error(`  [error] VLM response not valid JSON`);
        await sql`
          UPDATE "CompetitionEntry"
          SET "validationResult" = 'rejected',
              "validationReason" = 'Could not analyze the image properly — VLM response was not valid JSON',
              "updatedAt" = now()
          WHERE id = ${entry.id}
        `;
        rejected++;
        errors++;
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`  [VLM] Parsed result: isReceipt=${parsed.isReceipt}, store=${parsed.storeName}, champion=${parsed.hasChampionProducts}`);

      let validationResult = 'pending';
      let validationReason = '';
      let storeName = parsed.matchedParticipatingStore || parsed.storeName || '';
      let slipDate = parsed.date || '';
      let slipAmount = parsed.totalAmount || '';
      let championProducts = parsed.championProductNames || '';
      let confidenceScore = String(parsed.confidence || 0);

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

      // Duplicate detection
      if (validationResult === 'confirmed') {
        const dupesFound = await sql`
          SELECT id FROM "CompetitionEntry"
          WHERE id != ${entry.id}
            AND "consumerPhone" = ${entry.consumerPhone || ''}
            AND "storeName" = ${storeName}
            AND "slipDate" = ${slipDate}
            AND "slipAmount" = ${slipAmount}
            AND "validationResult" != 'rejected'
        `;
        if (dupesFound.length > 0) {
          validationResult = 'duplicate';
          validationReason = 'This till slip has already been submitted';
          duplicates++;
        }
      }

      // Fraud detection
      let isFraud = false;
      if (validationResult === 'confirmed') {
        const similarCount = await sql`
          SELECT COUNT(*)::int as count FROM "CompetitionEntry"
          WHERE "consumerPhone" = ${entry.consumerPhone || ''}
            AND "storeName" = ${storeName}
            AND "validationResult" = 'confirmed'
        `;
        if (similarCount[0]?.count > 5) {
          isFraud = true;
          validationReason = 'Multiple similar entries detected — flagged for review';
        }
      }

      // Update database
      await sql`
        UPDATE "CompetitionEntry"
        SET 
          "validated" = ${validationResult === 'confirmed'},
          "validationResult" = ${validationResult},
          "validationReason" = ${validationReason},
          "storeName" = ${storeName},
          "slipDate" = ${slipDate},
          "slipAmount" = ${slipAmount},
          "championProducts" = ${championProducts},
          "confidenceScore" = ${confidenceScore},
          "isDuplicate" = ${validationResult === 'duplicate'},
          "isFraud" = ${isFraud},
          "updatedAt" = now()
        WHERE id = ${entry.id}
      `;

      console.log(`  [result] ${validationResult}: ${validationReason}`);
      
      if (validationResult === 'confirmed') confirmed++;
      else if (validationResult === 'rejected') rejected++;
      else if (validationResult === 'duplicate') duplicates++;
      
      validated++;

    } catch (vlmErr) {
      const errMsg = vlmErr instanceof Error ? vlmErr.message : String(vlmErr);
      console.error(`  [error] VLM call failed: ${errMsg}`);
      errors++;
      // Leave as pending — will retry next time
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Processed: ${validated}`);
  console.log(`Confirmed: ${confirmed}`);
  console.log(`Rejected: ${rejected}`);
  console.log(`Duplicates: ${duplicates}`);
  console.log(`Errors (left pending): ${errors}`);
  console.log(`Time: ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
