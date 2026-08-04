import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { neon } from '@neon-database/serverless';
import { getDatabaseUrl } from '@/lib/config';

export async function GET() {
  try {
    // Core counts
    const totalEntries = await db.competitionEntry.count();
    const confirmedEntries = await db.competitionEntry.count({ where: { validationResult: 'confirmed' } });
    const rejectedEntries = await db.competitionEntry.count({ where: { validationResult: 'rejected' } });
    const pendingEntries = await db.competitionEntry.count({ where: { validationResult: 'pending' } });
    const duplicateEntries = await db.competitionEntry.count({ where: { isDuplicate: true } });
    const fraudEntries = await db.competitionEntry.count({ where: { isFraud: true } });
    const winnersCount = await db.competitionWinner.count();

    // Store breakdown (confirmed entries per store)
    const storeStats = await db.competitionEntry.groupBy({
      by: ['storeName'],
      _count: { id: true },
      where: { storeName: { not: '' }, validationResult: 'confirmed' },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    });

    // Wholesale store breakdown (where purchased)
    const wholesaleStats = await db.competitionEntry.groupBy({
      by: ['wholesaleStore'],
      _count: { id: true },
      where: { wholesaleStore: { not: '' } },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    });

    // Location breakdown
    const locationStats = await db.competitionEntry.groupBy({
      by: ['consumerLocation'],
      _count: { id: true },
      where: { consumerLocation: { not: '' } },
      orderBy: { _count: { id: 'desc' } },
      take: 15,
    });

    // Daily entries trend (last 14 days)
    const dailyTrend: { date: string; total: number; confirmed: number }[] = [];
    const dbUrl = getDatabaseUrl();
    if (dbUrl) {
      try {
        const sql = neon(dbUrl);
        const rows = await sql`
          SELECT DATE("createdAt") as day,
                 COUNT(*)::int as total,
                 COUNT(*) FILTER (WHERE "validationResult" = 'confirmed')::int as confirmed
          FROM "CompetitionEntry"
          WHERE "createdAt" >= NOW() - INTERVAL '14 days'
          GROUP BY day
          ORDER BY day ASC
        `;
        for (const row of rows) {
          dailyTrend.push({
            date: String(row.day),
            total: Number(row.total),
            confirmed: Number(row.confirmed),
          });
        }
      } catch {
        // Raw SQL failed — skip daily trend
      }
    }

    // Top products found on slips
    const productEntries = await db.competitionEntry.findMany({
      where: { championProducts: { not: '' }, validationResult: 'confirmed' },
      select: { championProducts: true },
    });
    const productCounts: Record<string, number> = {};
    for (const entry of productEntries) {
      const products = entry.championProducts.split(',').map(p => p.trim()).filter(Boolean);
      for (const product of products) {
        productCounts[product] = (productCounts[product] || 0) + 1;
      }
    }
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ product: name, count }));

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
        confirmationRate: totalEntries > 0 ? Math.round((confirmedEntries / totalEntries) * 100) : 0,
        storeBreakdown: storeStats.map(s => ({ store: s.storeName, count: s._count.id })),
        wholesaleBreakdown: wholesaleStats.map(s => ({ store: s.wholesaleStore, count: s._count.id })),
        locationBreakdown: locationStats.map(l => ({ location: l.consumerLocation, count: l._count.id })),
        dailyTrend,
        topProducts,
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch statistics' }, { status: 500 });
  }
}
