// app/api/auth/recovery-key/route.ts
// Get recovery key for authenticated user

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    // Get auth token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Decode JWT to get email
    const payload = JSON.parse(atob(token.split('.')[1]));
    const email = payload.email;

    if (!email) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Get user's recovery key
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { recoveryKey: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      recoveryKey: user.recoveryKey
    });

  } catch (error) {
    console.error('Recovery key fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}