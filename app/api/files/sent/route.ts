import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * GET /api/files/sent
 * Returns all files shared BY the current user
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

    // Get all files this user has shared
    const shares = await prisma.share.findMany({
      where: {
        file: {
          ownerEmail: userEmail,
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
          },
        },
      },
    });

    // Fetch live recipient names from User table
    const recipientEmails = shares.map(s => s.recipientEmail.toLowerCase());
    const recipientUsers = await prisma.user.findMany({
      where: {
        email: {
          in: recipientEmails,
          mode: 'insensitive',
        },
      },
      select: {
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    // Format with "FirstName (email)"
    const sentFiles = shares.map(share => {
      const userData = recipientUsers.find(u => u.email.toLowerCase() === share.recipientEmail.toLowerCase());
      const recipientDisplayName = userData
        ? `${userData.firstName} (${share.recipientEmail})`
        : share.recipientEmail;
      return {
        fileId: share.file.id,
        fileName: share.file.name,
        fileSize: share.file.size,
        fileType: share.file.type,
        originalCreatedAt: share.file.createdAt,
        parentFolderId: share.file.parentFolderId,
        recipientEmail: share.recipientEmail,
        recipientName: recipientDisplayName,
        sharedAt: share.sharedAt,
      };
    });

    console.log(`✅ [SENT_FILES] Fetched ${sentFiles.length} files shared by ${userEmail}`);

    return NextResponse.json({
      success: true,
      data: sentFiles,
    });
  } catch (error) {
    console.error('❌ [SENT_FILES] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sent files' },
      { status: 500 }
    );
  }
}