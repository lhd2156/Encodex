import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { getUserEmailFromToken } from '@/lib/auth';

const createToken = (): string => crypto.randomBytes(24).toString('base64url');

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

    const fileId = req.nextUrl.searchParams.get('fileId');

    const links = await prisma.shareLink.findMany({
      where: {
        createdByEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
        ...(fileId ? { fileId } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        fileId: true,
        token: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: links,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { fileId, expiresAt: rawExpiresAt, sharedFileKey } = await req.json();
    if (!fileId || !rawExpiresAt) {
      return NextResponse.json(
        { error: 'fileId and expiresAt are required' },
        { status: 400 }
      );
    }

    const expiresAt = new Date(rawExpiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      return NextResponse.json(
        { error: 'expiresAt must be a valid future date' },
        { status: 400 }
      );
    }

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        isFolder: true,
      },
    });

    if (!file) {
      return NextResponse.json(
        { error: 'File not found or unauthorized' },
        { status: 404 }
      );
    }

    if (file.isFolder) {
      return NextResponse.json(
        { error: 'Temporary share links are supported for files only' },
        { status: 400 }
      );
    }

    let sharedFileKeyBuffer: Buffer | null = null;
    if (sharedFileKey !== undefined && sharedFileKey !== null) {
      if (!Array.isArray(sharedFileKey)) {
        return NextResponse.json(
          { error: 'sharedFileKey must be an array of bytes' },
          { status: 400 }
        );
      }
      try {
        sharedFileKeyBuffer = Buffer.from(sharedFileKey);
      } catch {
        return NextResponse.json(
          { error: 'Invalid sharedFileKey format' },
          { status: 400 }
        );
      }
    }

    let uniqueToken = createToken();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await prisma.shareLink.findUnique({
        where: { token: uniqueToken },
        select: { id: true },
      });
      if (!existing) break;
      uniqueToken = createToken();
    }

    const created = await prisma.shareLink.create({
      data: {
        fileId,
        token: uniqueToken,
        createdByEmail: userEmail.toLowerCase(),
        expiresAt,
        sharedFileKey: sharedFileKeyBuffer,
      },
      select: {
        id: true,
        fileId: true,
        token: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...created,
        shareUrl: `${req.nextUrl.origin}/share/${created.token}`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
