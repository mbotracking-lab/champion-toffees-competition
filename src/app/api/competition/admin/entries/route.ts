import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || '';
    const location = searchParams.get('location') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const search = searchParams.get('search') || '';

    const where: Record<string, unknown> = {};

    if (status) where.validationResult = status;
    if (location) where.consumerLocation = location;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(startDate);
      if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { consumerName: { contains: search } },
        { consumerPhone: { contains: search } },
        { storeName: { contains: search } },
      ];
    }

    const total = await db.competitionEntry.count({ where });

    const entries = await db.competitionEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        entryNumber: true,
        firstName: true,
        surname: true,
        dateOfBirth: true,
        traderName: true,
        storeAddress: true,
        wholesaleStore: true,
        consumerName: true,
        consumerPhone: true,
        consumerLocation: true,
        validationResult: true,
        validationReason: true,
        storeName: true,
        slipDate: true,
        slipAmount: true,
        championProducts: true,
        confidenceScore: true,
        validated: true,
        isDuplicate: true,
        isFraud: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch entries' },
      { status: 500 }
    );
  }
}
