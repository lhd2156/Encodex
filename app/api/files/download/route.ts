// FILE LOCATION: app/api/files/download/[id]/route.ts
// NOTE: The folder name is literally [id] with square brackets
// Download encrypted file data endpoint (GET)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const file = await prisma.file.findFirst({
      where: {
        id: params.id,
        userId: user.userId
      }
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (file.isFolder) {
      return NextResponse.json({ error: 'Cannot download a folder' }, { status: 400 });
    }

    // Return encrypted data along with decryption info
    return NextResponse.json({
      success: true,
      encryptedData: Array.from(file.encryptedData),
      iv: Array.from(file.iv),
      wrappedKey: Array.from(file.wrappedKey),
      fileName: file.name,
      mimeType: file.mimeType
    });

  } catch (error) {
    console.error('Download file error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}