import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const entry = await db.competitionEntry.findUnique({
      where: { id },
    });

    if (!entry) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      entry: {
        id: entry.id,
        entryNumber: entry.entryNumber,
        consumerName: entry.consumerName,
        consumerPhone: entry.consumerPhone,
        consumerLocation: entry.consumerLocation,
        validationResult: entry.validationResult,
        validationReason: entry.validationReason,
        storeName: entry.storeName,
        slipDate: entry.slipDate,
        slipAmount: entry.slipAmount,
        championProducts: entry.championProducts,
        confidenceScore: entry.confidenceScore,
        validated: entry.validated,
        isDuplicate: entry.isDuplicate,
        isFraud: entry.isFraud,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching entry status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch entry status' },
      { status: 500 }
    );
  }
}
