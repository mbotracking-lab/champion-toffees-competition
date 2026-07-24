import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/setup — one-time database seeder.
// Visit this URL once after deploying to seed stores and admin.
// Safe to visit multiple times — it won't duplicate anything.

export async function GET() {
  try {
    // ─── 1. Create admin user (if doesn't exist) ───
    const existingAdmin = await db.adminUser.findUnique({ where: { username: 'admin' } });
    if (!existingAdmin) {
      await db.adminUser.create({
        data: {
          username: 'admin',
          passwordHash: 'champion2026',
          role: 'admin',
        },
      });
    }

    // ─── 2. Seed participating stores (if they don't exist) ───
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
    }

    // ─── 3. Return success ───
    return NextResponse.json({
      ok: true,
      message: 'Database seeded successfully!',
      adminCreated: !existingAdmin,
      storesCreated: existingStores === 0 ? 22 : 0,
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Make sure DATABASE_URL is set to a Neon PostgreSQL connection string in Vercel Environment Variables.',
      },
      { status: 500 }
    );
  }
}
