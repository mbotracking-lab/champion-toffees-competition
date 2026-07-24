import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Auto-ensure tables exist before creating an entry
async function ensureTablesExist(): Promise<boolean> {
  try {
    // Quick check: try to count entries (if table exists, this works)
    await db.competitionEntry.count({ take: 1 });
    return true;
  } catch {
    // Table doesn't exist — run setup
    console.log('[entry] CompetitionEntry table not found, running auto-setup...');
    try {
      const setupResponse = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/setup`);
      if (!setupResponse.ok) {
        console.error('[entry] Auto-setup failed:', setupResponse.status);
        return false;
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
        { error: 'Database setup is required. Please visit /api/setup first, then try again.' },
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
        consumerName: `${firstName} ${surname}`,  // computed for backward compat
        consumerLocation: storeAddress || '',  // mapped for backward compat
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
    // Return a more helpful error message so the chat bot can guide the user
    return NextResponse.json(
      { error: `Failed to create entry: ${errorMsg}. Please visit /api/setup to initialize the database, then try again.` },
      { status: 500 }
    );
  }
}
