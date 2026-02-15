// Get list of recipients for file(s)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    
    // Support both single fileId and batch fileIds
    const fileIds = body.fileIds || (body.fileId ? [body.fileId] : []);

    if (fileIds.length === 0) {
      return NextResponse.json({ error: 'fileId or fileIds required' }, { status: 400 });
    }

    // Batch fetch all shares for all requested files
    const shares = await prisma.share.findMany({
      where: { fileId: { in: fileIds } },
      select: { fileId: true, recipientEmail: true }
    });

    // Group by fileId for batch response
    const recipientsByFile: Record<string, string[]> = {};
    for (const fileId of fileIds) {
      recipientsByFile[fileId] = [];
    }
    for (const share of shares) {
      if (!recipientsByFile[share.fileId]) {
        recipientsByFile[share.fileId] = [];
      }
      recipientsByFile[share.fileId].push(share.recipientEmail);
    }

    // Return single-file format for backwards compatibility, or batch format
    if (body.fileId && !body.fileIds) {
      return NextResponse.json({
        success: true,
        recipients: recipientsByFile[body.fileId] || []
      });
    }

    return NextResponse.json({
      success: true,
      recipientsByFile
    });

  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}