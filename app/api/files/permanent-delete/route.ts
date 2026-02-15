import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * DELETE /api/files/permanent-delete
 * 
 * Permanently delete multiple files from trash (bulk delete).
 * This cannot be undone. Also deletes all shares and related records.
 * 
 * Body: { fileIds: string[] }
 * Response: { success: true, message: "X files permanently deleted", deletedCount: number }
 */
export async function DELETE(req: NextRequest) {
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

    // Parse request body
    const body = await req.json();
    const { fileIds } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'fileIds array is required' },
        { status: 400 }
      );
    }

    // Helper function to recursively get all descendant file IDs
    const getAllDescendantIds = async (folderIds: string[]): Promise<string[]> => {
      if (folderIds.length === 0) return [];
      
      const children = await prisma.file.findMany({
        where: { parentFolderId: { in: folderIds } },
        select: { id: true, isFolder: true }
      });
      
      if (children.length === 0) return [];
      
      const childIds = children.map(c => c.id);
      const folderChildren = children.filter(c => c.isFolder).map(c => c.id);
      
      // Recursively get grandchildren
      const grandchildIds = await getAllDescendantIds(folderChildren);
      
      return [...childIds, ...grandchildIds];
    };

    // Helper function to check if any ancestor folder is deleted
    const isAncestorDeleted = async (parentFolderId: string | null): Promise<boolean> => {
      if (!parentFolderId) return false;
      
      const parent = await prisma.file.findUnique({
        where: { id: parentFolderId },
        select: { isDeleted: true, parentFolderId: true }
      });
      
      if (!parent) return false;
      if (parent.isDeleted) return true;
      return isAncestorDeleted(parent.parentFolderId);
    };

    // Verify all files exist and are owned by user (case-insensitive email)
    // First get all files by ID and owner (not filtering by isDeleted yet)
    const allOwnedFiles = await prisma.file.findMany({
      where: {
        id: { in: fileIds },
        ownerEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
      },
      select: { id: true, name: true, ownerEmail: true, isDeleted: true, parentFolderId: true },
    });

    // Filter to files that are either directly deleted OR have a deleted ancestor
    const filesWithAncestorCheck = await Promise.all(
      allOwnedFiles.map(async (file) => {
        const canDelete = file.isDeleted || await isAncestorDeleted(file.parentFolderId);
        return { ...file, canDelete };
      })
    );

    const files = filesWithAncestorCheck.filter(f => f.canDelete);

    // Also check if any of these files are shared files that the user (as recipient) has in trash
    // Recipient can only delete their share record, not the actual file
    const sharedFilesInTrash = await prisma.receiverTrashedShare.findMany({
      where: {
        fileId: { in: fileIds },
        recipientEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
      },
      select: { fileId: true },
    });

    if (sharedFilesInTrash.length > 0) {
      const sharedFileIds = sharedFilesInTrash.map(f => f.fileId);
      
      // Check if any of these are folders, and get ALL their children
      // This ensures the entire folder tree is unshared, not just the parent folder
      const foldersBeingDeleted = await prisma.file.findMany({
        where: { 
          id: { in: sharedFileIds },
          isFolder: true 
        },
        select: { id: true }
      });
      
      let allIdsToUnshare = [...sharedFileIds];
      
      if (foldersBeingDeleted.length > 0) {
        const folderIds = foldersBeingDeleted.map(f => f.id);
        const descendantIds = await getAllDescendantIds(folderIds);
        // Combine parent folders and all descendants
        allIdsToUnshare = [...new Set([...sharedFileIds, ...descendantIds])];
        }
      
      // 1. Delete the receiver trashed records (this removes them from recipient's trash)
      await prisma.receiverTrashedShare.deleteMany({
        where: {
          fileId: { in: allIdsToUnshare },
          recipientEmail: {
            equals: userEmail,
            mode: 'insensitive',
          },
        },
      });
      // 2. CRITICAL: Also delete the Share records - this UNSHARES the file 
      // This allows the sender to re-share if they wish
      const deletedShares = await prisma.share.deleteMany({
        where: {
          fileId: { in: allIdsToUnshare },
          recipientEmail: {
            equals: userEmail,
            mode: 'insensitive',
          },
        },
      });
      // 3. Also clean up any other metadata for this recipient
      await prisma.tempDeletedShare.deleteMany({
        where: {
          fileId: { in: allIdsToUnshare },
          recipientEmail: {
            equals: userEmail,
            mode: 'insensitive',
          },
        },
      });
      
      await prisma.hiddenShare.deleteMany({
        where: {
          fileId: { in: allIdsToUnshare },
          recipientEmail: {
            equals: userEmail,
            mode: 'insensitive',
          },
        },
      });
      }

    if (files.length === 0 && sharedFilesInTrash.length === 0) {
      // Debug: check if files exist at all
      const anyFiles = await prisma.file.findMany({
        where: { id: { in: fileIds } },
        select: { id: true, ownerEmail: true, isDeleted: true }
      });
      if (anyFiles.length > 0) {
        }
      return NextResponse.json(
        { error: 'No valid files found in trash that you own' },
        { status: 404 }
      );
    }

    const validFileIds = files.map(f => f.id);
    // Delete all related records for these files
    // 1. Delete shares
    await prisma.share.deleteMany({
      where: { fileId: { in: validFileIds } },
    });
    // 2. Delete temp deleted records
    await prisma.tempDeletedShare.deleteMany({
      where: { fileId: { in: validFileIds } },
    });
    // 3. Delete hidden share records
    await prisma.hiddenShare.deleteMany({
      where: { fileId: { in: validFileIds } },
    });
    // 4. Delete receiver trashed records
    await prisma.receiverTrashedShare.deleteMany({
      where: { fileId: { in: validFileIds } },
    });
    // 5. Finally, delete the files themselves
    const deleteResult = await prisma.file.deleteMany({
      where: { id: { in: validFileIds } },
    });
    return NextResponse.json({
      success: true,
      message: `${deleteResult.count} files permanently deleted`,
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to permanently delete files' },
      { status: 500 }
    );
  }
}
