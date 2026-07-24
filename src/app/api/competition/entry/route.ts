import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { db } from '@/lib/db';

// Auto-ensure tables and columns exist before creating an entry
async function ensureTablesExist(): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return false;

  try {
    // Quick check: try to count entries (if table exists, this works)
    await db.competitionEntry.count({ take: 1 });

    // Table exists — but we need to verify all columns exist
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
        console.log(`[entry] Adding missing column: ${col.name}`);
        try {
          await sql.query(`ALTER TABLE "CompetitionEntry" ADD COLUMN "${col.name}" ${col.type}`);
          columnsAdded++;
        } catch (alterErr) {
          const msg = alterErr instanceof Error ? alterErr.message : String(alterErr);
          if (msg.includes('already exists')) {
            console.log(`[entry] Column ${col.name} already exists — skipped`);
          } else {
            console.error(`[entry] Error adding column ${col.name}:`, msg);
          }
        }
      }
    }

    if (columnsAdded > 0) {
      console.log(`[entry] Added ${columnsAdded} missing columns to CompetitionEntry`);
    }

    return true;
  } catch (countErr) {
    // Table doesn't exist — create it
    console.log('[entry] CompetitionEntry table not found, creating...');
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

      await sql`CREATE TABLE IF NOT EXISTS "CompetitionWinner" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "entryId" TEXT NOT NULL UNIQUE,
        "prize" TEXT NOT NULL,
        "drawnAt" TIMESTAMP NOT NULL DEFAULT now()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS "AdminUser" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "username" TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'admin',
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

      // Seed stores if empty
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
          const escapedName = name.replace(/'/g, "''");
          const escapedRegion = region.replace(/'/g, "''");
          await sql.query(
            `INSERT INTO "ParticipatingStore" (id, name, region, "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, '${escapedName}', '${escapedRegion}', now(), now())`
          );
        }
        console.log('[entry] Stores seeded');
      }

      // Seed admin if empty
      const existingAdmins = await sql`SELECT id FROM "AdminUser" WHERE username = 'admin'`;
      if (existingAdmins.length === 0) {
        await sql.query(
          `INSERT INTO "AdminUser" (id, username, passwordHash, role, "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, 'admin', 'champion2026', 'admin', now(), now())`
        );
        console.log('[entry] Admin user created');
      }

      console.log('[entry] Auto-setup completed successfully');
      return true;
    } catch (setupErr) {
      console.error('[entry] Auto-setup error:', setupErr);
      return false;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dateOfBirth, firstName, surname, traderName, storeAddress, wholesaleStore, consumerPhone } = body;

    if (!firstName || !surname) {
      return NextResponse.json(
        { error: 'First name and surname are required' },
        { status: 400 }
      );
    }

    if (!wholesaleStore) {
      return NextResponse.json(
        { error: 'Please select the wholesale store you purchased from' },
        { status: 400 }
      );
    }

    // Ensure database tables and columns exist before proceeding
    const tablesReady = await ensureTablesExist();
    if (!tablesReady) {
      return NextResponse.json(
        { error: 'Database setup failed. Please visit /api/setup to initialize manually.' },
        { status: 503 }
      );
    }

    const maxEntry = await db.competitionEntry.findFirst({
      orderBy: { entryNumber: 'desc' },
      select: { entryNumber: true },
    });

    const entryNumber = (maxEntry?.entryNumber || 0) + 1;

    const entry = await db.competitionEntry.create({
      data: {
        dateOfBirth: dateOfBirth || '',
        firstName,
        surname,
        traderName: traderName || '',
        storeAddress: storeAddress || '',
        wholesaleStore,
        consumerPhone: consumerPhone || '',
        consumerName: `${firstName} ${surname}`,
        consumerLocation: storeAddress || '',
        entryNumber,
        validationResult: 'pending',
      },
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: entry.id,
        entryNumber: entry.entryNumber,
        firstName: entry.firstName,
        surname: entry.surname,
        dateOfBirth: entry.dateOfBirth,
        traderName: entry.traderName,
        storeAddress: entry.storeAddress,
        wholesaleStore: entry.wholesaleStore,
        consumerPhone: entry.consumerPhone,
        consumerName: entry.consumerName,
        validationResult: entry.validationResult,
        createdAt: entry.createdAt,
      },
    });
  } catch (error) {
    console.error('[entry] Error creating entry:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create entry: ${errorMsg}` },
      { status: 500 }
    );
  }
}
