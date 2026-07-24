import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/stores — list all participating stores
export async function GET() {
  try {
    const stores = await db.participatingStore.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ stores });
  } catch (error) {
    console.error('Error fetching stores:', error);
    return NextResponse.json({ error: 'Failed to fetch stores' }, { status: 500 });
  }
}

// POST /api/stores — add a new participating store
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, region } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Store name is required' }, { status: 400 });
    }

    const store = await db.participatingStore.upsert({
      where: { name },
      update: { region: region || '' },
      create: { name, region: region || '' },
    });

    return NextResponse.json({ store });
  } catch (error) {
    console.error('Error adding store:', error);
    return NextResponse.json({ error: 'Failed to add store' }, { status: 500 });
  }
}

// DELETE /api/stores — remove a participating store by name
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Store name is required' }, { status: 400 });
    }

    const store = await db.participatingStore.delete({
      where: { name },
    });

    return NextResponse.json({ deleted: store });
  } catch (error) {
    console.error('Error deleting store:', error);
    return NextResponse.json({ error: 'Store not found or delete failed' }, { status: 500 });
  }
}
