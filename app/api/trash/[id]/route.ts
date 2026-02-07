import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * DELETE /api/trash/[id]
 * 
 * PERMANENTLY delete a file from trash. This cannot be undone.
 * Also deletes all shares and related records.
 * 
 * Response: { success: true, message: "File permanently deleted" }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Extract and verify authentication token
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user email from token
    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get file ID from URL params (Next.js 16+ requires await)
    const { id } = await params;

    console.log(`🔥 [PERMANENT_DELETE] Attempting to permanently delete file ${id} for ${userEmail}`);

    // Verify file exists, is in trash, and is owned by user (case-insensitive)
    const file = await prisma.file.findFirst({
      where: {
        id,
        ownerEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
        isDeleted: true, // Must be in trash to permanently delete
      },
    });

    if (!file) {
      return NextResponse.json(
        { error: 'File not found in trash or you do not own this file' },
        { status: 404 }
      );
    }

    // Delete all shares first (cascade delete)
    await prisma.share.deleteMany({
      where: { fileId: id },
    });
    console.log(`✅ [PERMANENT_DELETE] Deleted all shares for file ${id}`);

    // Delete all temp deleted records
    await prisma.tempDeletedShare.deleteMany({
      where: { fileId: id },
    });
    console.log(`✅ [PERMANENT_DELETE] Deleted all temp_deleted records for file ${id}`);

    // Delete all hidden share records
    await prisma.hiddenShare.deleteMany({
      where: { fileId: id },
    });
    console.log(`✅ [PERMANENT_DELETE] Deleted all hidden_share records for file ${id}`);

    // Delete all receiver trashed records
    await prisma.receiverTrashedShare.deleteMany({
      where: { fileId: id },
    });
    console.log(`✅ [PERMANENT_DELETE] Deleted all receiver_trashed records for file ${id}`);

    // Finally, delete the file itself permanently
    await prisma.file.delete({
      where: { id },
    });
    console.log(`✅ [PERMANENT_DELETE] File ${id} permanently deleted`);

    return NextResponse.json({
      success: true,
      message: 'File permanently deleted',
    });
  } catch (error) {
    console.error('❌ [PERMANENT_DELETE] Error permanently deleting file:', error);
    return NextResponse.json(
      { error: 'Failed to permanently delete file' },
      { status: 500 }
    );
  }
}