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
    console.error('❌ [PROFILE] Error fetching profile:', error);
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

    console.log(`👤 [PROFILE] Updating name for ${userEmail} to "${fullName}"`);

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
      console.error(`❌ [PROFILE] User not found for email: ${userEmail}`);
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

    console.log(`✅ [PROFILE] Updated user record for ${userEmail} (ID: ${existingUser.id})`);

    // 3. Update ownerName on all files owned by this user
    // This ensures shared files show the correct owner name to recipients
    const filesUpdated = await prisma.file.updateMany({
      where: {
        ownerEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
      },
      data: {
        ownerName: fullName,
      },
    });

    console.log(`✅ [PROFILE] Updated ownerName on ${filesUpdated.count} files`);

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
    console.error('❌ [PROFILE] Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
