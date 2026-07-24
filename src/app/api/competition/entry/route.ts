import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { consumerName, consumerPhone, consumerLocation } = body;

    if (!consumerName || !consumerPhone) {
      return NextResponse.json(
        { error: 'Name and phone number are required' },
        { status: 400 }
      );
    }

    const maxEntry = await db.competitionEntry.findFirst({
      orderBy: { entryNumber: 'desc' },
      select: { entryNumber: true },
    });

    const entryNumber = (maxEntry?.entryNumber || 0) + 1;

    const entry = await db.competitionEntry.create({
      data: {
        consumerName,
        consumerPhone,
        consumerLocation: consumerLocation || '',
        entryNumber,
        validationResult: 'pending',
      },
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: entry.id,
        entryNumber: entry.entryNumber,
        consumerName: entry.consumerName,
        consumerPhone: entry.consumerPhone,
        consumerLocation: entry.consumerLocation,
        validationResult: entry.validationResult,
        createdAt: entry.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating entry:', error);
    return NextResponse.json(
      { error: 'Failed to create entry' },
      { status: 500 }
    );
  }
}
