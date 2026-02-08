// Manage temp-deleted metadata (files sender trashed, temporarily hidden from receivers)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET temp-deleted files for current user
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tempDeleted = await prisma.tempDeletedShare.findMany({
      where: { recipientEmail: user.email },
      select: { fileId: true }
    });

    const fileIds = tempDeleted.map(t => t.fileId);

    return NextResponse.json({
      success: true,
      fileIds
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - mark a file as temp-deleted
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileId } = await req.json();

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    // Check if already exists
    const existing = await prisma.tempDeletedShare.findFirst({
      where: { fileId, recipientEmail: user.email }
    });

    if (!existing) {
      await prisma.tempDeletedShare.create({
        data: { fileId, recipientEmail: user.email }
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - remove file from temp-deleted
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileId } = await req.json();

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    await prisma.tempDeletedShare.deleteMany({
      where: { fileId, recipientEmail: user.email }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - toggle temp-deleted status
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileId, tempDeleted } = await req.json();

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    if (tempDeleted) {
      // Mark as temp-deleted
      const existing = await prisma.tempDeletedShare.findFirst({
        where: { fileId, recipientEmail: user.email }
      });

      if (!existing) {
        await prisma.tempDeletedShare.create({
          data: { fileId, recipientEmail: user.email }
        });
      }
    } else {
      // Remove from temp-deleted
      await prisma.tempDeletedShare.deleteMany({
        where: { fileId, recipientEmail: user.email }
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
