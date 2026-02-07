import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * GET /api/shares/hidden
 * 
 * Returns all permanently hidden shares for the current user.
 * These are shares the receiver has chosen to hide forever (not just trash).
 * 
 * Response: { success: true, data: [{ shareId, fileId, hiddenAt }] }
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

    // Fetch all hidden shares for this user from database
    const hiddenShares = await prisma.hiddenShare.findMany({
      where: {
        recipientEmail: userEmail,
      },
      select: {
        shareId: true,
        fileId: true,
        hiddenAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: hiddenShares,
    });
  } catch (error) {
    console.error('❌ [HIDDEN_SHARES] Error fetching hidden shares:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hidden shares' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shares/hidden
 * 
 * Permanently hide a share from the receiver's view.
 * Body: { shareId: string, fileId: string }
 * 
 * Response: { success: true, data: hiddenShare }
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

    // Validate required fields - fileId is required for the unique constraint
    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId is required' },
        { status: 400 }
      );
    }

    // Create or update hidden share record
    // Note: unique constraint is on [fileId, recipientEmail], not [shareId, recipientEmail]
    const hiddenShare = await prisma.hiddenShare.upsert({
      where: {
        fileId_recipientEmail: {
          fileId: fileId,
          recipientEmail: userEmail,
        },
      },
      update: {
        shareId: shareId || fileId,
        hiddenAt: new Date(),
      },
      create: {
        shareId: shareId || fileId,
        fileId: fileId,
        recipientEmail: userEmail,
        hiddenAt: new Date(),
      },
    });

    console.log(`✅ [HIDDEN_SHARES] Hidden share ${shareId || fileId} for ${userEmail}`);

    return NextResponse.json({
      success: true,
      data: hiddenShare,
    });
  } catch (error) {
    console.error('❌ [HIDDEN_SHARES] Error hiding share:', error);
    return NextResponse.json(
      { error: 'Failed to hide share' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/shares/hidden
 * 
 * Un-hide shares (remove from hidden list).
 * Body: { fileIds: string[] }
 * 
 * Response: { success: true, count: number }
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
    const { fileIds } = await req.json();

    if (!fileIds || !Array.isArray(fileIds)) {
      return NextResponse.json(
        { error: 'fileIds array is required' },
        { status: 400 }
      );
    }

    // Delete hidden share records
    const result = await prisma.hiddenShare.deleteMany({
      where: {
        recipientEmail: userEmail,
        fileId: {
          in: fileIds,
        },
      },
    });

    console.log(`✅ [HIDDEN_SHARES] Removed ${result.count} hidden shares for ${userEmail}`);

    return NextResponse.json({
      success: true,
      count: result.count,
    });
  } catch (error) {
    console.error('❌ [HIDDEN_SHARES] Error removing hidden shares:', error);
    return NextResponse.json(
      { error: 'Failed to remove hidden shares' },
      { status: 500 }
    );
  }
}