import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { numberOfWinners, prize } = body;

    const winnerCount = numberOfWinners || 3;
    const prizeName = prize || 'Champion Toffees Grand Prize';

    const confirmedEntries = await db.competitionEntry.findMany({
      where: {
        validationResult: 'confirmed',
        isDuplicate: false,
        isFraud: false,
      },
    });

    if (confirmedEntries.length === 0) {
      return NextResponse.json(
        { error: 'No confirmed entries available for draw' },
        { status: 400 }
      );
    }

    if (confirmedEntries.length < winnerCount) {
      return NextResponse.json(
        { error: `Only ${confirmedEntries.length} confirmed entries available, need at least ${winnerCount}` },
        { status: 400 }
      );
    }

    const shuffled = confirmedEntries.sort(() => Math.random() - 0.5);
    const selectedEntries = shuffled.slice(0, winnerCount);

    const winners = await Promise.all(
      selectedEntries.map(async (entry) => {
        return db.competitionWinner.create({
          data: {
            entryId: entry.id,
            prize: prizeName,
          },
        });
      })
    );

    return NextResponse.json({
      success: true,
      winners: winners.map((w) => ({
        id: w.id,
        entryId: w.entryId,
        prize: w.prize,
        drawnAt: w.drawnAt,
      })),
      selectedEntries: selectedEntries.map((e) => ({
        id: e.id,
        entryNumber: e.entryNumber,
        consumerName: e.consumerName,
        consumerPhone: e.consumerPhone,
        consumerLocation: e.consumerLocation,
        storeName: e.storeName,
      })),
      totalPool: confirmedEntries.length,
    });
  } catch (error) {
    console.error('Error drawing winners:', error);
    return NextResponse.json(
      { error: 'Failed to draw winners' },
      { status: 500 }
    );
  }
}
