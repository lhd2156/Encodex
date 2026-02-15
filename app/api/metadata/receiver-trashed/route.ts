// Manage receiver_trashed_shares metadata (receiver moves shared file to their trash)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET receiver trashed shares for current user
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const trashedShares = await prisma.receiverTrashedShare.findMany({
      where: { recipientEmail: user.email },
      select: { fileId: true }
    });

    return NextResponse.json({
      success: true,
      fileIds: trashedShares.map(t => t.fileId)
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add file IDs to receiver trashed list
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileIds } = await req.json();

    if (!Array.isArray(fileIds)) {
      return NextResponse.json({ error: 'fileIds must be an array' }, { status: 400 });
    }

    // Add each fileId (upsert to avoid duplicates)
    for (const fileId of fileIds) {
      await prisma.receiverTrashedShare.upsert({
        where: {
          fileId_recipientEmail: {
            fileId,
            recipientEmail: user.email
          }
        },
        create: {
          fileId,
          recipientEmail: user.email,
          shareId: fileId
        },
        update: {}
      });
    }

    const trashedShares = await prisma.receiverTrashedShare.findMany({
      where: { recipientEmail: user.email },
      select: { fileId: true }
    });

    return NextResponse.json({
      success: true,
      fileIds: trashedShares.map(t => t.fileId)
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove file IDs from receiver trashed list
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileIds } = await req.json();

    if (!Array.isArray(fileIds)) {
      return NextResponse.json({ error: 'fileIds must be an array' }, { status: 400 });
    }

    await prisma.receiverTrashedShare.deleteMany({
      where: {
        recipientEmail: user.email,
        fileId: { in: fileIds }
      }
    });

    const trashedShares = await prisma.receiverTrashedShare.findMany({
      where: { recipientEmail: user.email },
      select: { fileId: true }
    });

    return NextResponse.json({
      success: true,
      fileIds: trashedShares.map(t => t.fileId)
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
