import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/setup — one-time database setup.
// Visit this URL once after deploying to create tables and seed data.
// Safe to visit multiple times — it won't duplicate anything.

export async function GET() {
  try {
    // ─── Step 1: Create database tables using raw SQL ───
    // This ensures the schema exists even if prisma db push didn't run during build

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS "CompetitionEntry" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "consumerName" TEXT NOT NULL,
        "consumerPhone" TEXT NOT NULL DEFAULT '',
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
      );

      CREATE TABLE IF NOT EXISTS "CompetitionStats" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "totalEntries" INTEGER NOT NULL DEFAULT 0,
        "confirmedEntries" INTEGER NOT NULL DEFAULT 0,
        "rejectedEntries" INTEGER NOT NULL DEFAULT 0,
        "duplicateEntries" INTEGER NOT NULL DEFAULT 0,
        "fraudEntries" INTEGER NOT NULL DEFAULT 0,
        "pendingEntries" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "CompetitionWinner" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "entryId" TEXT NOT NULL UNIQUE,
        "prize" TEXT NOT NULL,
        "drawnAt" TIMESTAMP NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "AdminUser" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "username" TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'admin',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "ParticipatingStore" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "name" TEXT NOT NULL UNIQUE,
        "region" TEXT NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `;

    await db.$executeRawUnsafe(createTableSQL);

    // ─── Step 2: Create admin user (if doesn't exist) ───
    let adminCreated = false;
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

    // ─── Step 3: Seed participating stores (if they don't exist) ───
    let storesCreated = 0;
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

    // ─── Return success ───
    return NextResponse.json({
      ok: true,
      message: 'Database setup complete! Tables created and data seeded.',
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
