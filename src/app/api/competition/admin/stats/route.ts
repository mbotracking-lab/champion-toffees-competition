import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const totalEntries = await db.competitionEntry.count();
    const confirmedEntries = await db.competitionEntry.count({
      where: { validationResult: 'confirmed' },
    });
    const rejectedEntries = await db.competitionEntry.count({
      where: { validationResult: 'rejected' },
    });
    const pendingEntries = await db.competitionEntry.count({
      where: { validationResult: 'pending' },
    });
    const duplicateEntries = await db.competitionEntry.count({
      where: { isDuplicate: true },
    });
    const fraudEntries = await db.competitionEntry.count({
      where: { isFraud: true },
    });

    const locationStats = await db.competitionEntry.groupBy({
      by: ['consumerLocation'],
      _count: { id: true },
      where: { consumerLocation: { not: '' } },
      orderBy: { _count: { id: 'desc' } },
    });

    const storeStats = await db.competitionEntry.groupBy({
      by: ['storeName'],
      _count: { id: true },
      where: {
        storeName: { not: '' },
        validationResult: 'confirmed',
      },
      orderBy: { _count: { id: 'desc' } },
    });

    const recentEntries = await db.competitionEntry.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        validationResult: true,
      },
    });

    const winnersCount = await db.competitionWinner.count();

    return NextResponse.json({
      success: true,
      stats: {
        totalEntries,
        confirmedEntries,
        rejectedEntries,
        pendingEntries,
        duplicateEntries,
        fraudEntries,
        winnersCount,
        locationBreakdown: locationStats.map((l) => ({
          location: l.consumerLocation,
          count: l._count.id,
        })),
        storeBreakdown: storeStats.map((s) => ({
          store: s.storeName,
          count: s._count.id,
        })),
        recentEntries: recentEntries.map((e) => ({
          date: e.createdAt,
          status: e.validationResult,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
