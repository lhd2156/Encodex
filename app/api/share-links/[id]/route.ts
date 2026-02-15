import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserEmailFromToken } from '@/lib/auth';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { id } = await context.params;

    const link = await prisma.shareLink.findFirst({
      where: {
        id,
        createdByEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        revokedAt: true,
      },
    });

    if (!link) {
      return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
    }

    if (link.revokedAt) {
      return NextResponse.json({ success: true });
    }

    await prisma.shareLink.update({
      where: { id },
      data: {
        revokedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
