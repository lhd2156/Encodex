import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * GET /api/shares/trashed
 * 
 * Returns all shares that the RECEIVER has moved to their trash.
 * These are different from temp-deleted (which is when SENDER trashes).
 * The share still exists, but the receiver has chosen to trash it.
 * 
 * Response: { success: true, data: [{ shareId, fileId, trashedAt }] }
 */
export async function GET(req: NextRequest) {
  try {
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

    // Fetch all shares the receiver has trashed (but not permanently deleted)
    const trashedShares = await prisma.receiverTrashedShare.findMany({
      where: {
        recipientEmail: userEmail,
        isDeleted: false, // Not permanently deleted yet
      },
      select: {
        shareId: true,
        fileId: true,
        trashedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: trashedShares,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to fetch trashed shares' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shares/trashed
 * 
 * Move a received share to the receiver's trash.
 * Body: { shareId: string, fileId: string }
 * 
 * Response: { success: true, data: trashedShare }
 */
export async function POST(req: NextRequest) {
  try {
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

    // Parse request body
    const { shareId, fileId } = await req.json();

    // Validate required fields
    if (!shareId && !fileId) {
      return NextResponse.json(
        { error: 'shareId or fileId required' },
        { status: 400 }
      );
    }

    // Add to receiver's trash (upsert to handle duplicates)
    const trashedShare = await prisma.receiverTrashedShare.upsert({
      where: {
        fileId_recipientEmail: {
          fileId: fileId,
          recipientEmail: userEmail,
        },
      },
      update: {
        trashedAt: new Date(),
        isDeleted: false,
      },
      create: {
        shareId: shareId || fileId,
        fileId: fileId,
        recipientEmail: userEmail,
        trashedAt: new Date(),
        isDeleted: false,
      },
    });

    return NextResponse.json({
      success: true,
      data: trashedShare,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to trash share' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/shares/trashed
 * 
 * Restore a share from the receiver's trash.
 * Body: { shareId: string, fileId: string }
 * 
 * Response: { success: true, message: "Share restored" }
 */
export async function DELETE(req: NextRequest) {
  try {
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

    // Parse request body
    const { shareId, fileId } = await req.json();

    // Validate required fields
    if (!shareId && !fileId) {
      return NextResponse.json(
        { error: 'shareId or fileId required' },
        { status: 400 }
      );
    }

    // Remove from receiver's trash
    await prisma.receiverTrashedShare.deleteMany({
      where: {
        fileId: fileId,
        recipientEmail: userEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Share restored from trash',
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to restore share' },
      { status: 500 }
    );
  }
}