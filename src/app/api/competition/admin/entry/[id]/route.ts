import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { validationResult, validationReason, isFraud } = body;

    const entry = await db.competitionEntry.findUnique({
      where: { id },
    });

    if (!entry) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (validationResult) {
      updateData.validationResult = validationResult;
      updateData.validated = validationResult === 'confirmed';
    }

    if (validationReason) updateData.validationReason = validationReason;
    if (isFraud !== undefined) updateData.isFraud = isFraud;

    const updatedEntry = await db.competitionEntry.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: updatedEntry.id,
        entryNumber: updatedEntry.entryNumber,
        consumerName: updatedEntry.consumerName,
        consumerPhone: updatedEntry.consumerPhone,
        consumerLocation: updatedEntry.consumerLocation,
        validationResult: updatedEntry.validationResult,
        validationReason: updatedEntry.validationReason,
        storeName: updatedEntry.storeName,
        slipDate: updatedEntry.slipDate,
        slipAmount: updatedEntry.slipAmount,
        championProducts: updatedEntry.championProducts,
        validated: updatedEntry.validated,
        isDuplicate: updatedEntry.isDuplicate,
        isFraud: updatedEntry.isFraud,
        createdAt: updatedEntry.createdAt,
        updatedAt: updatedEntry.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating entry:', error);
    return NextResponse.json(
      { error: 'Failed to update entry' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // First delete any winner records linked to this entry
    await db.competitionWinner.deleteMany({
      where: { entryId: id },
    });

    // Then delete the entry itself
    await db.competitionEntry.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Entry #${entry.entryNumber} deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete entry' },
      { status: 500 }
    );
  }
}
