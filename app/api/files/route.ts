// FILE LOCATION: app/api/files/route.ts
// List all files endpoint (GET)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const user = await getUserFromRequest(req);
    if (!user) {
      console.error('❌ [FILES API] No user from request - unauthorized');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log(`📋 [FILES API] ==========================================`);
    console.log(`📋 [FILES API] User requesting files: ${user.email} (userId: ${user.userId})`);
    console.log(`📋 [FILES API] Query filter: { userId: "${user.userId}", isDeleted: false }`);

    // Get all files for user (excluding deleted ones by default)
    const files = await prisma.file.findMany({
      where: {
        userId: user.userId,
        isDeleted: false
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`📋 [FILES API] Found ${files.length} files for userId: ${user.userId}`);
    files.forEach((f, i) => {
      const ownerMatch = f.userId === user.userId ? '✓' : '❌ MISMATCH!';
      console.log(`   ${i + 1}. "${f.name}" | owner: ${f.ownerEmail} | userId: ${f.userId} ${ownerMatch}`);
    });
    console.log(`📋 [FILES API] ==========================================`);

    // ✅ FIX: Fetch uploader names for files uploaded to shared folders
    // ownerName stores uploader's email when someone uploads to a shared folder
    const uploaderEmails = new Set<string>();
    files.forEach(file => {
      if (file.ownerName && file.ownerName !== file.ownerEmail) {
        uploaderEmails.add(file.ownerName.toLowerCase());
      }
    });

    // Fetch uploader names from User table
    const uploaderUsers = uploaderEmails.size > 0 ? await prisma.user.findMany({
      where: {
        email: {
          in: Array.from(uploaderEmails),
          mode: 'insensitive',
        },
      },
      select: {
        email: true,
        firstName: true,
        lastName: true,
      },
    }) : [];

    // Convert BigInt to string and Buffers to arrays (for JSON serialization)
    const filesFormatted = files.map(file => {
      const uploaderEmail = file.ownerName || null;
      // ✅ FIX: Format as "FirstName (email)"
      const uploaderUserData = uploaderEmail
        ? uploaderUsers.find(u => u.email.toLowerCase() === uploaderEmail.toLowerCase())
        : null;
      const uploaderName = uploaderUserData
        ? `${uploaderUserData.firstName} (${uploaderEmail})`
        : null;
        
      return {
        id: file.id,
        name: file.name,
        size: file.size.toString(),
        type: file.type || (file.isFolder ? 'folder' : 'file'), // Include type field
        mimeType: file.mimeType,
        parentFolderId: file.parentFolderId,
        isFolder: file.isFolder,
        isFavorite: file.isFavorite,
        owner: file.ownerEmail,
        ownerEmail: file.ownerEmail,
        ownerName: file.ownerName || undefined,  // Who uploaded (for shared folder uploads) - EMAIL
        uploaderName: uploaderName || undefined,  // ✅ NEW: Live display name of uploader
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString()
      };
    });

    return NextResponse.json({
      success: true,
      files: filesFormatted
    });

  } catch (error) {
    console.error('List files error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}