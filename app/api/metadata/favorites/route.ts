// FILE LOCATION: app/api/metadata/favorites/route.ts
// User-specific favorites endpoint
// Favorites are PER-USER - if receiver favorites a shared file, only they see it as favorited

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET - Get all favorites for current user
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const favorites = await prisma.userFavorite.findMany({
      where: { userEmail: { equals: user.email, mode: 'insensitive' } },
      select: { fileId: true }
    });

    return NextResponse.json({
      success: true,
      data: favorites.map(f => f.fileId)
    });

  } catch (error) {
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add a favorite
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

    // Upsert to handle duplicates gracefully
    await prisma.userFavorite.upsert({
      where: {
        fileId_userEmail: {
          fileId,
          userEmail: user.email.toLowerCase()
        }
      },
      update: {}, // No update needed, just ensure it exists
      create: {
        fileId,
        userEmail: user.email.toLowerCase()
      }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove a favorite
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileId } = await req.json();

    if (!fileId) {
      return NextResponse.json({ error: 'fileId required' }, { status: 400 });
    }

    await prisma.userFavorite.deleteMany({
      where: {
        fileId,
        userEmail: { equals: user.email, mode: 'insensitive' }
      }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
