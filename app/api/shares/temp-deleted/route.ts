import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * GET /api/shares/temp-deleted
 * 
 * Returns all shares where the SENDER (owner) has moved the file to trash.
 * These shares are temporarily hidden from the receiver until the sender restores them.
 * 
 * This is different from receiver-trashed shares:
 * - temp-deleted = sender moved original file to trash
 * - receiver-trashed = receiver moved their copy to trash
 * 
 * Response: { success: true, data: [{ id, fileId, file }] }
 */
export async function GET(req: NextRequest) {
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

    // Fetch all shares where sender has trashed the file
    const tempDeletedShares = await prisma.tempDeletedShare.findMany({
      where: {
        recipientEmail: userEmail,
      },
      select: {
        id: true,
        fileId: true,
        deletedByOwnerAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: tempDeletedShares,
    });
  } catch (error) {
    console.error('❌ [TEMP_DELETED] Error fetching temp-deleted shares:', error);
    return NextResponse.json(
      { error: 'Failed to fetch temp-deleted shares' },
      { status: 500 }
    );
  }
}

// ADD this to your existing temp-deleted route
export async function POST(req: NextRequest) {
  // Batch update temp_deleted for multiple recipients
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userEmail = await getUserEmailFromToken(token);
  if (!userEmail) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { fileIds, recipientEmails, isTrashed } = await req.json();

  if (isTrashed) {
    // ✅ FIX: Validate that files are actually in owner's trash before creating TempDeletedShare
    // This prevents stale records from being created due to race conditions
    const filesInTrash = await prisma.file.findMany({
      where: {
        id: { in: fileIds },
        ownerEmail: { equals: userEmail, mode: 'insensitive' },
        isDeleted: true
      },
      select: { id: true }
    });
    
    const validFileIds = new Set(filesInTrash.map(f => f.id));
    const filteredFileIds = fileIds.filter((id: string) => validFileIds.has(id));
    
    if (filteredFileIds.length === 0) {
      console.log(`⚠️ [TEMP_DELETED] No files actually in trash, skipping TempDeletedShare creation`);
      return NextResponse.json({ success: true, skipped: true });
    }
    
    if (filteredFileIds.length !== fileIds.length) {
      console.log(`⚠️ [TEMP_DELETED] Only ${filteredFileIds.length}/${fileIds.length} files actually in trash`);
    }
    
    // Add to temp_deleted for all recipients (only for valid files)
    await prisma.tempDeletedShare.createMany({
      data: filteredFileIds.flatMap((fileId: string) =>
        recipientEmails.map((email: string) => ({
          fileId,
          recipientEmail: email,
          deletedByOwnerAt: new Date(),
        }))
      ),
      skipDuplicates: true,
    });
  } else {
    // Remove from temp_deleted
    await prisma.tempDeletedShare.deleteMany({
      where: {
        fileId: { in: fileIds },
        recipientEmail: { in: recipientEmails },
      },
    });
  }

  return NextResponse.json({ success: true });
}