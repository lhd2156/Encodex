// Download encrypted file data endpoint

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let file = await prisma.file.findFirst({
      where: {
        id,
        userId: user.userId
      }
    });

    let shareAccess: { sharedFileKey: Buffer | null } | null = null;

    // If not owner, allow recipients who have an active share for this file
    if (!file) {
      const share = await prisma.share.findFirst({
        where: {
          fileId: id,
          recipientEmail: {
            equals: user.email,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          sharedFileKey: true,
        },
      });

      if (share) {
        shareAccess = {
          sharedFileKey: share.sharedFileKey,
        };
        file = await prisma.file.findFirst({
          where: { id },
        });
      }
    }

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (file.isFolder) {
      return NextResponse.json({ error: 'Cannot download a folder' }, { status: 400 });
    }

    // Return encrypted data along with decryption info
    return NextResponse.json({
      success: true,
      encryptedData: Array.from(file.encryptedData),
      iv: Array.from(file.iv),
      wrappedKey: Array.from(file.wrappedKey),
      sharedFileKey: shareAccess?.sharedFileKey ? Array.from(shareAccess.sharedFileKey) : null,
      fileName: file.name,
      mimeType: file.mimeType
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
