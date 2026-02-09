// app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, createToken } from '@/lib/auth';
import { generateRecoveryKey, storeRecoveryKey } from '@/lib/recoveryKey';

export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, lastName } = await req.json();

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 409 }
      );
    }

    const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash = await hashPassword(password);

    console.log('About to create user...');
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        firstName,
        lastName,
        passwordHash,
        salt
      }
    });

    console.log('User created:', user.email);

    // Generate recovery key
    console.log('Generating recovery key...');
    const recoveryKey = generateRecoveryKey();
    console.log('Recovery key generated');

    // Store recovery key in database
    console.log('About to store recovery key...');
    await storeRecoveryKey(user.email, recoveryKey);
    console.log('Recovery key stored');

    const token = createToken(user.id, user.email);

    console.log('Signup complete for:', user.email);

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      salt: Array.from(salt),
      recoveryKey // Send to client so user can save it
    });

  } catch (error) {
    console.error('Signup error:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}