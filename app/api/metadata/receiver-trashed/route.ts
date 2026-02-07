// FILE LOCATION: app/api/metadata/receiver-trashed/route.ts
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

    // Get user's metadata
    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { receiverTrashedShares: true }
    });

    const receiverTrashed = userData?.receiverTrashedShares || [];

    return NextResponse.json({
      success: true,
      fileIds: receiverTrashed
    });

  } catch (error) {
    console.error('Get receiver trashed error:', error);
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

    // Get current list
    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { receiverTrashedShares: true }
    });

    const currentList = userData?.receiverTrashedShares || [];
    
    // Add new IDs (deduplicate)
    const updated = [...new Set([...currentList, ...fileIds])];

    // Update database
    await prisma.user.update({
      where: { id: user.userId },
      data: { receiverTrashedShares: updated }
    });

    return NextResponse.json({
      success: true,
      fileIds: updated
    });

  } catch (error) {
    console.error('Add receiver trashed error:', error);
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

    // Get current list
    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { receiverTrashedShares: true }
    });

    const currentList = userData?.receiverTrashedShares || [];
    
    // Remove specified IDs
    const updated = currentList.filter(id => !fileIds.includes(id));

    // Update database
    await prisma.user.update({
      where: { id: user.userId },
      data: { receiverTrashedShares: updated }
    });

    return NextResponse.json({
      success: true,
      fileIds: updated
    });

  } catch (error) {
    console.error('Remove receiver trashed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}