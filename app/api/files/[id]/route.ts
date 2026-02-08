// FILE LOCATION: app/api/files/[id]/route.ts
// NOTE: The folder name is literally [id] with square brackets
// Get/Update/Delete specific file endpoint (GET/PATCH/DELETE)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET single file
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Await params in Next.js 16+
    
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const file = await prisma.file.findFirst({
      where: {
        id,
        userId: user.userId
      }
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        size: file.size.toString(),
        mimeType: file.mimeType,
        encryptedData: Array.from(file.encryptedData),
        iv: Array.from(file.iv),
        wrappedKey: Array.from(file.wrappedKey),
        parentFolderId: file.parentFolderId,
        isFolder: file.isFolder,
        isFavorite: file.isFavorite,
        createdAt: file.createdAt.toISOString()
      }
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE file (move to trash)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Await params in Next.js 16+
    
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const file = await prisma.file.findFirst({
      where: {
        id,
        userId: user.userId
      }
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Soft delete (move to trash)
    await prisma.file.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'File moved to trash'
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH file (update metadata like favorite, rename, move, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Await params in Next.js 16+
    
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, isFavorite, parentFolderId } = await req.json();

    const file = await prisma.file.findFirst({
      where: {
        id,
        userId: user.userId
      }
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (isFavorite !== undefined) updateData.isFavorite = isFavorite;
    if (parentFolderId !== undefined) updateData.parentFolderId = parentFolderId;

    // Update file
    const updated = await prisma.file.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      file: {
        id: updated.id,
        name: updated.name,
        isFavorite: updated.isFavorite,
        parentFolderId: updated.parentFolderId
      }
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}