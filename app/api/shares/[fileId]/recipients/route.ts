import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

// GET /api/shares/[fileId]/recipients - Returns all share recipients for a file
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await context.params;
    
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerEmail: userEmail,
      },
    });

    if (!file) {
      return NextResponse.json(
        { error: 'File not found or you do not own this file' },
        { status: 404 }
      );
    }

    const shares = await prisma.share.findMany({
      where: {
        fileId: fileId,
      },
      select: {
        id: true,
        recipientEmail: true,
        recipientName: true,
        sharedAt: true,
        permissions: true,
      },
    });

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

    const userNameMap = new Map<string, string>();
    recipientUsers.forEach(user => {
      const fullName = `${user.firstName} ${user.lastName}`.trim();
      userNameMap.set(user.email.toLowerCase(), fullName);
    });

    const recipients = shares.map(share => {
      const userData = recipientUsers.find(u => u.email.toLowerCase() === share.recipientEmail.toLowerCase());
      const displayName = userData
        ? `${userData.firstName} (${share.recipientEmail})`
        : share.recipientEmail;
      return {
        email: share.recipientEmail,
        name: displayName,
        sharedAt: share.sharedAt,
        permissions: share.permissions || 'view', // Default to view if not set
      };
    });

    return NextResponse.json({
      success: true,
      data: recipients,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to fetch recipients' },
      { status: 500 }
    );
  }
}