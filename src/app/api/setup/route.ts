import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { db } from '@/lib/db';

// GET /api/setup — one-time database setup.
// Visit this URL once after deploying to create tables and seed data.
// Safe to visit multiple times — it won't duplicate anything.

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json(
      { ok: false, error: 'DATABASE_URL is not set in environment variables.' },
      { status: 500 }
    );
  }

  try {
    // ─── Step 1: Create tables using Neon serverless client ───
    // The PrismaNeonHTTP adapter can't handle multi-statement SQL,
    // so we use the @neondatabase/serverless client directly for setup.
    const sql = neon(dbUrl);

    // Create each table individually to avoid multi-statement issues
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

    // ─── Step 2: Add new columns if table already existed from earlier deployment ───
    // Use individual ALTER statements with IF NOT EXISTS checks
    const columnChecks = [
      { column: 'dateOfBirth', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'firstName', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'surname', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'traderName', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'storeAddress', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'wholesaleStore', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'consumerPhone', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'consumerName', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'consumerLocation', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'slipPhotoUrl', type: 'TEXT NOT NULL DEFAULT \'\'' },
      { column: 'slipPhotoData', type: 'TEXT NOT NULL DEFAULT \'\'' },
    ];

    for (const check of columnChecks) {
      // Check if column exists
      const result = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'CompetitionEntry' AND column_name = ${check.column}
      `;
      if (result.length === 0) {
        // Column doesn't exist — add it
        await sql`ALTER TABLE "CompetitionEntry" ADD COLUMN ${sql.unsafe(check.column)} ${sql.unsafe(check.type)}`;
      }
    }

    // ─── Step 3: Create admin user (if doesn't exist) ───
    let adminCreated = false;
    try {
      const existingAdmin = await db.adminUser.findUnique({ where: { username: 'admin' } });
      if (!existingAdmin) {
        await db.adminUser.create({
          data: {
            username: 'admin',
            passwordHash: 'champion2026',
            role: 'admin',
          },
        });
        adminCreated = true;
      }
    } catch {
      // If Prisma can't find the table yet, use direct SQL
      const existingAdmins = await sql`SELECT id FROM "AdminUser" WHERE username = 'admin'`;
      if (existingAdmins.length === 0) {
        await sql`INSERT INTO "AdminUser" (username, passwordHash, role) VALUES ('admin', 'champion2026', 'admin')`;
        adminCreated = true;
      }
    }

    // ─── Step 4: Seed participating stores (if they don't exist) ───
    let storesCreated = 0;
    try {
      const existingStores = await db.participatingStore.count();
      if (existingStores === 0) {
        const stores = [
          { name: 'Phoenix PMB', region: 'KZN' },
          { name: 'Phoenix Prospecton', region: 'KZN' },
          { name: 'Phoenix Empangeni', region: 'KZN' },
          { name: 'Tradeport', region: 'KZN' },
          { name: 'North City', region: 'KZN' },
          { name: 'One up', region: 'WC' },
          { name: 'Best deal', region: 'WC' },
          { name: 'Sweet connection', region: 'EC' },
          { name: 'Trade Value', region: 'EC' },
          { name: 'J&E Cash & Carry', region: '' },
          { name: 'Kadams', region: '' },
          { name: 'Advance Cash & Carry', region: '' },
          { name: 'DB Cash & Carry', region: '' },
          { name: 'Adam Snacks', region: '' },
          { name: 'Devland Cash & Carry', region: '' },
          { name: 'Devland Welkom', region: '' },
          { name: 'Continental Cash & Carry', region: '' },
          { name: 'Three Star Cash & Carry', region: '' },
          { name: 'Overland Cash & Carry', region: '' },
          { name: 'Sammys Cash & Carry', region: '' },
          { name: 'Big Save Marble Hall', region: '' },
          { name: 'Big Save Hamanskraal', region: '' },
        ];
        await db.participatingStore.createMany({ data: stores });
        storesCreated = 22;
      }
    } catch {
      // If Prisma can't access the table, use direct SQL
      const existingStores = await sql`SELECT COUNT(*) as count FROM "ParticipatingStore"`;
      if (existingStores[0].count === 0) {
        const storeInserts = [
          ['Phoenix PMB', 'KZN'],
          ['Phoenix Prospecton', 'KZN'],
          ['Phoenix Empangeni', 'KZN'],
          ['Tradeport', 'KZN'],
          ['North City', 'KZN'],
          ['One up', 'WC'],
          ['Best deal', 'WC'],
          ['Sweet connection', 'EC'],
          ['Trade Value', 'EC'],
          ['J&E Cash & Carry', ''],
          ['Kadams', ''],
          ['Advance Cash & Carry', ''],
          ['DB Cash & Carry', ''],
          ['Adam Snacks', ''],
          ['Devland Cash & Carry', ''],
          ['Devland Welkom', ''],
          ['Continental Cash & Carry', ''],
          ['Three Star Cash & Carry', ''],
          ['Overland Cash & Carry', ''],
          ['Sammys Cash & Carry', ''],
          ['Big Save Marble Hall', ''],
          ['Big Save Hamanskraal', ''],
        ];
        for (const [name, region] of storeInserts) {
          await sql`INSERT INTO "ParticipatingStore" (name, region) VALUES (${name}, ${region})`;
        }
        storesCreated = 22;
      }
    }

    // ─── Return success ───
    return NextResponse.json({
      ok: true,
      message: 'Database setup complete! All tables created and data seeded.',
      tablesCreated: true,
      adminCreated,
      storesCreated,
    });
  } catch (error) {
    console.error('Setup error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
        hint: 'Make sure DATABASE_URL is set to a Neon PostgreSQL connection string in Vercel Environment Variables.',
      },
      { status: 500 }
    );
  }
}
