// FILE LOCATION: app/api/metadata/temp-deleted/route.ts
// Manage temp_deleted_shares metadata (sender moves file to trash)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET temp deleted shares for current user
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's metadata
    const userData = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { tempDeletedShares: true }
    });

    const tempDeleted = userData?.tempDeletedShares || [];

    return NextResponse.json({
      success: true,
      fileIds: tempDeleted
    });

  } catch (error) {
    console.error('Get temp deleted error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add file IDs to temp deleted list
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
      select: { tempDeletedShares: true }
    });

    const currentList = userData?.tempDeletedShares || [];
    
    // Add new IDs (deduplicate)
    const updated = [...new Set([...currentList, ...fileIds])];

    // Update database
    await prisma.user.update({
      where: { id: user.userId },
      data: { tempDeletedShares: updated }
    });

    return NextResponse.json({
      success: true,
      fileIds: updated
    });

  } catch (error) {
    console.error('Add temp deleted error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove file IDs from temp deleted list
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
      select: { tempDeletedShares: true }
    });

    const currentList = userData?.tempDeletedShares || [];
    
    // Remove specified IDs
    const updated = currentList.filter(id => !fileIds.includes(id));

    // Update database
    await prisma.user.update({
      where: { id: user.userId },
      data: { tempDeletedShares: updated }
    });

    return NextResponse.json({
      success: true,
      fileIds: updated
    });

  } catch (error) {
    console.error('Remove temp deleted error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ADD batch update endpoint
export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userEmail = await getUserEmailFromToken(token);
  if (!userEmail) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { fileIds, updates } = await req.json();

  await prisma.file.updateMany({
    where: {
      id: { in: fileIds },
      ownerEmail: userEmail,
    },
    data: updates,
  });

  return NextResponse.json({ success: true });
}