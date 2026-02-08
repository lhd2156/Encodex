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
      
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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
    
    // Fetch uploader names for files uploaded to shared folders
    // ownerName stores uploader's email when someone uploads to a shared folder
    // Only treat it as an email if it contains @ (otherwise it's owner's display name)
    const uploaderEmails = new Set<string>();
    files.forEach(file => {
      if (file.ownerName && file.ownerName.includes('@') && file.ownerName !== file.ownerEmail) {
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
      // Only treat ownerName as uploader email if it contains @ (otherwise it's owner's display name)
      const uploaderEmail = (file.ownerName && file.ownerName.includes('@')) ? file.ownerName : null;
      // Format as "FirstName (email)"
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
        uploaderName: uploaderName || undefined,  // Live display name of uploader
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString()
      };
    });

    return NextResponse.json({
      success: true,
      files: filesFormatted
    });

  } catch (error) {
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}