// FILE LOCATION: app/api/shares/recipients/route.ts
// Get list of recipients for a specific file

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileId } = await req.json();

    if (!fileId) {
      return NextResponse.json({ error: 'fileId required' }, { status: 400 });
    }

    // Get all shares for this file
    const shares = await prisma.share.findMany({
      where: { fileId },
      select: { recipientEmail: true }
    });

    const recipients = shares.map(s => s.recipientEmail);

    return NextResponse.json({
      success: true,
      recipients
    });

  } catch (error) {
    console.error('Get recipients error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}