// FILE LOCATION: app/api/metadata/hidden/route.ts
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

    // Get user's metadata
    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { hiddenShares: true }
    });

    const hidden = userData?.hiddenShares || [];

    return NextResponse.json({
      success: true,
      fileIds: hidden
    });

  } catch (error) {
    console.error('Get hidden shares error:', error);
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

    // Get current list
    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { hiddenShares: true }
    });

    const currentList = userData?.hiddenShares || [];
    
    // Add new IDs (deduplicate)
    const updated = [...new Set([...currentList, ...fileIds])];

    // Update database
    await prisma.user.update({
      where: { id: user.userId },
      data: { hiddenShares: updated }
    });

    return NextResponse.json({
      success: true,
      fileIds: updated
    });

  } catch (error) {
    console.error('Add hidden shares error:', error);
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

    // Get current list
    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { hiddenShares: true }
    });

    const currentList = userData?.hiddenShares || [];
    
    // Remove specified IDs
    const updated = currentList.filter(id => !fileIds.includes(id));

    // Update database
    await prisma.user.update({
      where: { id: user.userId },
      data: { hiddenShares: updated }
    });

    return NextResponse.json({
      success: true,
      fileIds: updated
    });

  } catch (error) {
    console.error('Remove hidden shares error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}