import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * POST /api/trash/restore
 * 
 * Restore one or more files from trash back to their original location.
 * If files are shared, this will also remove them from recipients' temp_deleted lists.
 * 
 * Body: { fileIds: string[] }
 * Response: { success: true, message: "X file(s) restored", count: number }
 */
export async function POST(req: NextRequest) {
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
    const { fileIds } = await req.json();

    // Validate fileIds array
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'fileIds must be a non-empty array' },
        { status: 400 }
      );
    }

    // Restore files from trash
    const result = await prisma.file.updateMany({
      where: {
        id: {
          in: fileIds,
        },
        ownerEmail: userEmail, // Only allow restoring own files
        isDeleted: true, // Only restore files that are actually in trash
      },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
      },
    });

    // For each file, remove from ALL recipients' temp_deleted lists (if shared)
    for (const fileId of fileIds) {
      const deleteResult = await prisma.tempDeletedShare.deleteMany({
        where: {
          fileId,
        },
      });
      
      if (deleteResult.count > 0) {
        }
    }

    return NextResponse.json({
      success: true,
      message: `${result.count} file(s) restored`,
      count: result.count,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to restore from trash' },
      { status: 500 }
    );
  }
}