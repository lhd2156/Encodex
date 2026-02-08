import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * DELETE /api/shares/all?fileId=xxx
 * Delete ALL shares for a file (from all recipients)
 * Replaces: sharedFilesManager.removeAllSharesForFile() and removeAllSharesForFileRecursive()
 */
export async function DELETE(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('fileId');
    const recursive = searchParams.get('recursive') === 'true';

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId required' },
        { status: 400 }
      );
    }

    // Verify user owns the file (include deleted files - we need to clean up shares even for trashed files)
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
        // Note: Intentionally NOT filtering by isDeleted - we need this to work for trash cleanup
      },
    });

    if (!file) {
      // File might not exist in DB yet (optimistic) or user doesn't own it
      // Still try to delete shares if any exist for this fileId
      }

    let fileIds = [fileId];

    // If recursive, get all descendants
    if (recursive) {
      fileIds = await getDescendantFileIds(fileId);
      }

    // Get affected recipients for cleanup
    const affectedShares = await prisma.share.findMany({
      where: {
        fileId: { in: fileIds },
      },
      select: {
        recipientEmail: true,
      },
      distinct: ['recipientEmail'],
    });

    const affectedRecipients = affectedShares.map(s => s.recipientEmail);

    // Delete all shares
    const result = await prisma.share.deleteMany({
      where: {
        fileId: { in: fileIds },
      },
    });

    // Clean up receiver_trashed_shares for all affected recipients
    await prisma.receiverTrashedShare.deleteMany({
      where: {
        fileId: { in: fileIds },
        recipientEmail: { in: affectedRecipients },
      },
    });

    // Clean up temp_deleted_shares
    await prisma.tempDeletedShare.deleteMany({
      where: {
        fileId: { in: fileIds },
        recipientEmail: { in: affectedRecipients },
      },
    });

    // Clean up hidden_shares
    await prisma.hiddenShare.deleteMany({
      where: {
        fileId: { in: fileIds },
        recipientEmail: { in: affectedRecipients },
      },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      affectedRecipients: affectedRecipients.length,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to delete all shares' },
      { status: 500 }
    );
  }
}

// Helper function to recursively get all descendant file IDs (includes deleted files)
async function getDescendantFileIds(fileId: string): Promise<string[]> {
  const result: string[] = [fileId];
  const queue: string[] = [fileId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // Include deleted files - we need to clean up shares for them too
    const children = await prisma.file.findMany({
      where: {
        parentFolderId: current,
        // Note: NOT filtering by isDeleted - need all files for share cleanup
      },
      select: {
        id: true,
      },
    });

    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }

  return result;
}