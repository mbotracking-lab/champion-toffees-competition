import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Delete a specific winner record
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const winner = await db.competitionWinner.findUnique({
      where: { id },
    });

    if (!winner) {
      return NextResponse.json(
        { error: 'Winner not found' },
        { status: 404 }
      );
    }

    await db.competitionWinner.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Winner record deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting winner:', error);
    return NextResponse.json(
      { error: 'Failed to delete winner' },
      { status: 500 }
    );
  }
}
