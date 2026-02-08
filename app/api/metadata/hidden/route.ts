// Manage hidden_shares metadata (permanently hidden shared files)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET hidden shares for current user
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hiddenShares = await prisma.hiddenShare.findMany({
      where: { recipientEmail: user.email },
      select: { fileId: true }
    });

    const hidden = hiddenShares.map(h => h.fileId);

    return NextResponse.json({
      success: true,
      fileIds: hidden
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add file IDs to hidden list
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
      await prisma.hiddenShare.upsert({
        where: {
          fileId_recipientEmail: {
            fileId,
            recipientEmail: user.email
          }
        },
        create: {
          fileId,
          recipientEmail: user.email,
          shareId: fileId // Using fileId as shareId for now
        },
        update: {}
      });
    }

    // Get updated list
    const hiddenShares = await prisma.hiddenShare.findMany({
      where: { recipientEmail: user.email },
      select: { fileId: true }
    });

    return NextResponse.json({
      success: true,
      fileIds: hiddenShares.map(h => h.fileId)
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove file IDs from hidden list
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

    // Delete the hidden records
    await prisma.hiddenShare.deleteMany({
      where: {
        recipientEmail: user.email,
        fileId: { in: fileIds }
      }
    });

    // Get updated list
    const hiddenShares = await prisma.hiddenShare.findMany({
      where: { recipientEmail: user.email },
      select: { fileId: true }
    });

    return NextResponse.json({
      success: true,
      fileIds: hiddenShares.map(h => h.fileId)
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}