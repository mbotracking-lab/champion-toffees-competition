import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
    return NextResponse.json(
      { error: 'Failed to create entry' },
      { status: 500 }
    );
  }
}
