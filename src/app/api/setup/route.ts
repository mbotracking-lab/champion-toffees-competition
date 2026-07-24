import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { db } from '@/lib/db';
import { getDatabaseUrl } from '@/lib/config';

// GET /api/setup — one-time database setup.
// Visit this URL once after deploying to create tables and seed data.
// Safe to visit multiple times — it won't duplicate anything.

export async function GET() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    return NextResponse.json(
      { ok: false, error: 'DATABASE_URL is not set in environment variables.' },
      { status: 500 }
    );
  }

  try {
    const sql = neon(dbUrl);
    const log: string[] = [];

    // ─── Step 1: Create each table individually ───
    // Using neon tagged-template literals, one statement per call.
    // CREATE TABLE IF NOT EXISTS won't modify existing tables,
    // so column migrations are handled separately in Step 2.

    try {
      await sql`CREATE TABLE IF NOT EXISTS "CompetitionEntry" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "consumerName" TEXT NOT NULL DEFAULT '',
        "consumerLocation" TEXT NOT NULL DEFAULT '',
        "consumerPhone" TEXT NOT NULL DEFAULT '',
        "dateOfBirth" TEXT NOT NULL DEFAULT '',
        "firstName" TEXT NOT NULL DEFAULT '',
        "surname" TEXT NOT NULL DEFAULT '',
        "traderName" TEXT NOT NULL DEFAULT '',
        "storeAddress" TEXT NOT NULL DEFAULT '',
        "wholesaleStore" TEXT NOT NULL DEFAULT '',
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
      log.push('CompetitionEntry table OK');
    } catch (e) {
      log.push(`CompetitionEntry table: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      await sql`CREATE TABLE IF NOT EXISTS "CompetitionStats" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "totalEntries" INTEGER NOT NULL DEFAULT 0,
        "confirmedEntries" INTEGER NOT NULL DEFAULT 0,
        "rejectedEntries" INTEGER NOT NULL DEFAULT 0,
        "duplicateEntries" INTEGER NOT NULL DEFAULT 0,
        "fraudEntries" INTEGER NOT NULL DEFAULT 0,
        "pendingEntries" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )`;
      log.push('CompetitionStats table OK');
    } catch (e) {
      log.push(`CompetitionStats: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      await sql`CREATE TABLE IF NOT EXISTS "CompetitionWinner" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "entryId" TEXT NOT NULL UNIQUE,
        "prize" TEXT NOT NULL,
        "drawnAt" TIMESTAMP NOT NULL DEFAULT now()
      )`;
      log.push('CompetitionWinner table OK');
    } catch (e) {
      log.push(`CompetitionWinner: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      await sql`CREATE TABLE IF NOT EXISTS "AdminUser" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "username" TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'admin',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )`;
      log.push('AdminUser table OK');
    } catch (e) {
      log.push(`AdminUser: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      await sql`CREATE TABLE IF NOT EXISTS "ParticipatingStore" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "name" TEXT NOT NULL UNIQUE,
        "region" TEXT NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )`;
      log.push('ParticipatingStore table OK');
    } catch (e) {
      log.push(`ParticipatingStore: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ─── Step 2: Add missing columns to CompetitionEntry ───
    // If the table already existed from a prior deployment with fewer columns,
    // we need to ALTER TABLE ADD COLUMN for each missing one.
    // We try each one and catch "already exists" errors gracefully.

    const columnsToAdd = [
      { name: 'dateOfBirth', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'firstName', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'surname', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'traderName', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'storeAddress', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'wholesaleStore', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'consumerPhone', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'consumerName', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'consumerLocation', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'slipPhotoUrl', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'slipPhotoData', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'validated', type: 'BOOLEAN NOT NULL DEFAULT false' },
      { name: 'validationResult', type: 'TEXT NOT NULL DEFAULT \'pending\'' },
      { name: 'validationReason', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'storeName', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'slipDate', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'slipAmount', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'championProducts', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'confidenceScore', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { name: 'isDuplicate', type: 'BOOLEAN NOT NULL DEFAULT false' },
      { name: 'isFraud', type: 'BOOLEAN NOT NULL DEFAULT false' },
      { name: 'entryNumber', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'createdAt', type: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updatedAt', type: 'TIMESTAMP NOT NULL DEFAULT now()' },
    ];

    let columnsAdded = 0;
    for (const col of columnsToAdd) {
      try {
        // Check if column exists first
        const check = await sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'CompetitionEntry' AND column_name = ${col.name}
        `;
        if (check.length === 0) {
          // Column missing — add it
          // Use sql.query() for raw SQL strings (column names can't be parameterized)
          const alterQuery = `ALTER TABLE "CompetitionEntry" ADD COLUMN "${col.name}" ${col.type}`;
          await sql.query(alterQuery);
          columnsAdded++;
          log.push(`Added column: ${col.name}`);
        }
      } catch (alterErr) {
        const msg = alterErr instanceof Error ? alterErr.message : String(alterErr);
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          log.push(`Column ${col.name} already exists — skipped`);
        } else {
          log.push(`Column ${col.name} error: ${msg}`);
        }
      }
    }

    if (columnsAdded > 0) {
      log.push(`Total columns added: ${columnsAdded}`);
    }

    // ─── Step 3: Create admin user ───
    let adminCreated = false;
    try {
      const existingAdmins = await sql`SELECT id FROM "AdminUser" WHERE username = 'admin'`;
      if (existingAdmins.length === 0) {
        // Use gen_random_uuid() explicitly since neon HTTP may not honor DEFAULT
        await sql.query(
          `INSERT INTO "AdminUser" (id, username, "passwordHash", role) VALUES (gen_random_uuid()::text, 'admin', 'champion2026', 'admin')`
        );
        adminCreated = true;
        log.push('Admin user created');
      } else {
        log.push('Admin user already exists');
      }
    } catch (e) {
      log.push(`Admin: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ─── Step 4: Seed participating stores ───
    let storesCreated = 0;
    try {
      const existingStores = await sql`SELECT COUNT(*)::int as count FROM "ParticipatingStore"`;
      if (existingStores[0].count === 0) {
        const storeInserts: [string, string][] = [
          ['Phoenix PMB', 'KZN'], ['Phoenix Prospecton', 'KZN'], ['Phoenix Empangeni', 'KZN'],
          ['Tradeport', 'KZN'], ['North City', 'KZN'], ['One up', 'WC'],
          ['Best deal', 'WC'], ['Sweet connection', 'EC'], ['Trade Value', 'EC'],
          ['J&E Cash & Carry', ''], ['Kadams', ''], ['Advance Cash & Carry', ''],
          ['DB Cash & Carry', ''], ['Adam Snacks', ''], ['Devland Cash & Carry', ''],
          ['Devland Welkom', ''], ['Continental Cash & Carry', ''],
          ['Three Star Cash & Carry', ''], ['Overland Cash & Carry', ''],
          ['Sammys Cash & Carry', ''], ['Big Save Marble Hall', ''],
          ['Big Save Hamanskraal', ''],
        ];
        for (const [name, region] of storeInserts) {
          // Neon HTTP adapter doesn't honor DEFAULT values,
          // so we must provide ALL columns explicitly
          const escapedName = name.replace(/'/g, "''");
          const escapedRegion = region.replace(/'/g, "''");
          await sql.query(
            `INSERT INTO "ParticipatingStore" (id, name, region, "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, '${escapedName}', '${escapedRegion}', now(), now())`
          );
        }
        storesCreated = 22;
        log.push('Stores seeded (22)');
      } else {
        log.push(`Stores already exist (${existingStores[0].count})`);
      }
    } catch (e) {
      log.push(`Stores: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ─── Return success ───
    return NextResponse.json({
      ok: true,
      message: 'Database setup complete!',
      log,
      columnsAdded,
      adminCreated,
      storesCreated,
    });
  } catch (error) {
    console.error('Setup error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: 500 }
    );
  }
}
