import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;

    const link = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            mimeType: true,
            isFolder: true,
            encryptedData: true,
            iv: true,
            wrappedKey: true,
          },
        },
      },
    });

    if (!link) {
      return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
    }

    if (link.revokedAt) {
      return NextResponse.json({ error: 'Share link was revoked' }, { status: 410 });
    }

    if (link.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Share link expired' }, { status: 410 });
    }

    if (link.file.isFolder) {
      return NextResponse.json(
        { error: 'Folder links are not supported' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      fileId: link.file.id,
      fileName: link.file.name,
      mimeType: link.file.mimeType,
      encryptedData: Array.from(link.file.encryptedData),
      iv: Array.from(link.file.iv),
      wrappedKey: Array.from(link.file.wrappedKey),
      sharedFileKey: link.sharedFileKey ? Array.from(link.sharedFileKey) : null,
      expiresAt: link.expiresAt,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
