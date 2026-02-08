import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * GET /api/trash
 * GET /api/trash?owner=email@example.com
 * 
 * Returns all files in the current user's trash.
 * These are files the user has deleted but not permanently removed yet.
 * 
 * Response: { success: true, data: [{ id, name, size, type, deletedAt, ... }] }
 */
export async function GET(req: NextRequest) {
  try {
    // Check if querying specific user's trash
    const { searchParams } = new URL(req.url);
    const ownerEmail = searchParams.get('owner'); // Get specific user's trash
    
    // Extract and verify authentication token
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user email from token
    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // If owner param is provided, get that user's trash (for checking if sender trashed it)
    const trashOwner = ownerEmail || userEmail;

    // Fetch all deleted files owned by this user
    const deletedFiles = await prisma.file.findMany({
      where: {
        ownerEmail: trashOwner,
        isDeleted: true, // Only get trashed files
      },
      select: {
        id: true,
        name: true,
        size: true,
        type: true,
        parentFolderId: true,
        ownerEmail: true,
        deletedAt: true,
        createdAt: true,
        mimeType: true,
      },
      orderBy: {
        deletedAt: 'desc', // Most recently deleted first
      },
    });

    // Format response with consistent field names
    const formattedData = deletedFiles.map(file => ({
      id: file.id,
      name: file.name,
      size: file.size.toString(),
      type: file.type,
      parentFolderId: file.parentFolderId,
      owner: file.ownerEmail,
      ownerEmail: file.ownerEmail,
      deletedAt: file.deletedAt?.toISOString(),
      createdAt: file.createdAt.toISOString(),
      mimeType: file.mimeType,
    }));

    return NextResponse.json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to fetch trash' },
      { status: 500 }
    );
  }
}