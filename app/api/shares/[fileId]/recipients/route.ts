import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * GET /api/shares/[fileId]/recipients
 * 
 * Returns all recipients (people the file is shared with) for a specific file.
 * Only the file owner can call this endpoint.
 * 
 * Response: { success: true, data: [{ email, name, sharedAt, permissions }] }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
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

    // Get fileId from URL params
    const { fileId } = params;

    // Verify user owns the file
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

    // Get all shares for this file, joining with User to get live recipient names
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

    // Create a map for quick lookup
    const userNameMap = new Map<string, string>();
    recipientUsers.forEach(user => {
      const fullName = `${user.firstName} ${user.lastName}`.trim();
      userNameMap.set(user.email.toLowerCase(), fullName);
    });

    // Format the response with live names in "FirstName (email)" format
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

    console.log(`✅ [RECIPIENTS] File ${fileId} has ${recipients.length} recipient(s)`);

    return NextResponse.json({
      success: true,
      data: recipients,
    });
  } catch (error) {
    console.error('❌ [RECIPIENTS] Error fetching recipients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recipients' },
      { status: 500 }
    );
  }
}