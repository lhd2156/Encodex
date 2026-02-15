import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * GET /api/files/received
 * Returns all files shared TO the current user (received files)
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get all files shared WITH this user (where they are the recipient)
    const shares = await prisma.share.findMany({
      where: {
        recipientEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            size: true,
            type: true,
            createdAt: true,
            parentFolderId: true,
            ownerEmail: true,
            ownerName: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const receivedFiles = shares.map(share => {
      // Get sender's display name
      const senderName = share.file.user
        ? `${share.file.user.firstName} ${share.file.user.lastName}`.trim()
        : share.file.ownerEmail || 'Unknown';
      
      return {
        fileId: share.file.id,
        fileName: share.file.name,
        fileSize: share.file.size?.toString() || '0',
        fileType: share.file.type,
        originalCreatedAt: share.file.createdAt,
        parentFolderId: share.file.parentFolderId,
        senderEmail: share.file.ownerEmail,
        senderName: senderName,
        sharedAt: share.sharedAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: receivedFiles,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to fetch received files' },
      { status: 500 }
    );
  }
}