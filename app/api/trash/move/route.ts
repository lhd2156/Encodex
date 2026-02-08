import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * POST /api/trash/move
 * 
 * Move one or more files to trash.
 * If files are shared, this will also sync the trash status to all recipients.
 * 
 * Body: { fileIds: string[] }
 * Response: { success: true, message: "X file(s) moved to trash", count: number }
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

    // Move files to trash (update database records)
    const result = await prisma.file.updateMany({
      where: {
        id: {
          in: fileIds,
        },
        ownerEmail: userEmail, // Only allow moving own files
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userEmail,
      },
    });

    // For each file, sync trash status to all recipients (if shared)
    for (const fileId of fileIds) {
      // Get all shares for this file
      const shares = await prisma.share.findMany({
        where: { fileId },
        select: { recipientEmail: true },
      });

      // If file is shared, add to recipients' temp_deleted lists
      if (shares.length > 0) {
        await prisma.tempDeletedShare.createMany({
          data: shares.map(s => ({
            fileId,
            recipientEmail: s.recipientEmail,
            deletedByOwnerAt: new Date(),
          })),
          skipDuplicates: true, // Prevent duplicates
        });
        }
    }

    return NextResponse.json({
      success: true,
      message: `${result.count} file(s) moved to trash`,
      count: result.count,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to move to trash' },
      { status: 500 }
    );
  }
}