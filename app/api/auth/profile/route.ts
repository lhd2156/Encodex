// FILE LOCATION: app/api/auth/profile/route.ts
// Get and update user profile (name) - also updates ownerName on all their files

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * GET /api/auth/profile
 * Get current user's profile from database
 * Uses auth token (sessionStorage, tab-specific) to identify user
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Find user with case-insensitive email match
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: userEmail,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/auth/profile
 * Update user's name (firstName, lastName)
 * Also updates ownerName on all files owned by this user
 */
export async function PATCH(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { firstName, lastName } = await req.json();

    if (!firstName || !firstName.trim()) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 });
    }

    const fullName = lastName ? `${firstName} ${lastName}` : firstName;

    // 1. Find user with case-insensitive email match
    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: userEmail,
          mode: 'insensitive',
        },
      },
    });

    if (!existingUser) {
      
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 2. Update user record by ID (guaranteed unique)
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        firstName: firstName.trim(),
        lastName: (lastName || '').trim(),
      },
    });

    // 3. Update ownerName on files owned by this user ONLY where ownerName is null or is a display name
    // DON'T overwrite ownerName if it contains @ (it stores uploader's email for shared folder uploads)
    const filesUpdated = await prisma.file.updateMany({
      where: {
        ownerEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
        OR: [
          { ownerName: null },
          { ownerName: { not: { contains: '@' } } }
        ]
      },
      data: {
        ownerName: fullName,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
      },
      filesUpdated: filesUpdated.count,
    });
  } catch (error) {
    
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
