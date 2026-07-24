import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { db } from '@/lib/db';

// Auto-ensure tables exist before creating an entry
async function ensureTablesExist(): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return false;

  try {
    // Quick check: try to count entries (if table exists, this works)
    await db.competitionEntry.count({ take: 1 });
    return true;
  } catch {
    // Table doesn't exist — run setup using neon client directly
    console.log('[entry] CompetitionEntry table not found, running auto-setup...');
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

      // Also ensure other required tables exist
      await sql`CREATE TABLE IF NOT EXISTS "ParticipatingStore" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "name" TEXT NOT NULL UNIQUE,
        "region" TEXT NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS "AdminUser" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "username" TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'admin',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )`;

      // Seed stores if empty
      const existingStores = await sql`SELECT COUNT(*) as count FROM "ParticipatingStore"`;
      if (existingStores[0].count === 0) {
        const storeInserts = [
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
          await sql`INSERT INTO "ParticipatingStore" (name, region) VALUES (${name}, ${region})`;
        }
      }

      // Seed admin if empty
      const existingAdmins = await sql`SELECT id FROM "AdminUser" WHERE username = 'admin'`;
      if (existingAdmins.length === 0) {
        await sql`INSERT INTO "AdminUser" (username, passwordHash, role) VALUES ('admin', 'champion2026', 'admin')`;
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

    // Ensure database tables exist before proceeding
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
        traderName: entry.traderName,
        storeAddress: entry.storeAddress,
        wholesaleStore: entry.wholesaleStore,
        consumerPhone: entry.consumerPhone,
        validationResult: entry.validationResult,
        createdAt: entry.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating entry:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to create entry: ${errorMsg}` },
      { status: 500 }
    );
  }
}
