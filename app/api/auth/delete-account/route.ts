import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'encodex-secret-key-change-in-production';

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.userId;
    const userEmail = payload.email;
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 });
    }

    // Delete all user data in order (respecting foreign key constraints)

    // 1. Delete share links created by this user
    await prisma.shareLink.deleteMany({
      where: { createdByEmail: userEmail },
    });

    // 2. Delete shares where user's files are shared (via file ownership cascade)
    // and shares received by this user
    await prisma.share.deleteMany({
      where: { recipientEmail: userEmail },
    });

    // 3. Delete metadata records
    await prisma.hiddenShare.deleteMany({
      where: { recipientEmail: userEmail },
    });
    await prisma.receiverTrashedShare.deleteMany({
      where: { recipientEmail: userEmail },
    });
    await prisma.tempDeletedShare.deleteMany({
      where: { recipientEmail: userEmail },
    });
    await prisma.userFavorite.deleteMany({
      where: { userEmail: userEmail },
    });

    // 4. Delete all files (cascades delete related shares/links via onDelete: Cascade)
    await prisma.file.deleteMany({ where: { userId } });

    // 5. Delete the user
    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
