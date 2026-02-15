// FILE LOCATION: app/api/files/upload/route.ts
// Upload encrypted file endpoint (POST)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user exists in database and IDs match
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true }
    });
    
    if (!dbUser) {
      
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    if (dbUser.email.toLowerCase() !== user.email.toLowerCase()) {
      
      // Use the email from the database as the source of truth
      user.email = dbUser.email;
    }

    const body = await req.json();
    const {
      encryptedData,
      iv,
      wrappedKey,
      fileName,
      mimeType,
      size,
      parentFolderId,
      isFolder
    } = body;

    // Validation
    if (!fileName) {
      return NextResponse.json(
        { error: 'File name is required' },
        { status: 400 }
      );
    }

    // SAFETY: Ensure user email is valid
    if (!user.email) {
      
      return NextResponse.json(
        { error: 'Invalid user authentication' },
        { status: 401 }
      );
    }

    // FIX: Files/folders should ALWAYS belong to the UPLOADER
    // NO ownership transfer - each user owns what they create
    // Sharing is handled separately via Share records
    let effectiveOwnerEmail = user.email;
    let effectiveOwnerId = user.userId;
    let uploadedByEmail: string | null = null;

    // Log parent folder info for debugging but DON'T transfer ownership
    if (parentFolderId) {
      const parentFolder = await prisma.file.findUnique({
        where: { id: parentFolderId },
        select: { userId: true, ownerEmail: true, name: true }
      });

      // DO NOT TRANSFER OWNERSHIP - just log if it's a shared folder
      if (parentFolder && parentFolder.ownerEmail.toLowerCase() !== user.email.toLowerCase()) {
        uploadedByEmail = user.email; // Just track who uploaded, don't change owner
      }
    }

    // Allow empty encryption data for now (client may not be encrypting yet)
    // We'll store empty buffers and the client can update them later
    const isEncrypted = encryptedData && encryptedData.length > 0 && iv && iv.length > 0 && wrappedKey && wrappedKey.length > 0;
    
    if (!isFolder && !isEncrypted) {
      }

    // Auto-rename files if a duplicate exists (instead of returning 409)
    let finalFileName = fileName;
    
    // Helper function to generate unique name (uses effectiveOwnerId determined above)
    const makeUniqueFileName = async (baseName: string): Promise<string> => {
      // Check if file with this name already exists
      const existing = await prisma.file.findFirst({
        where: {
          userId: effectiveOwnerId,
          name: baseName,
          parentFolderId: parentFolderId || null,
          isDeleted: false
        }
      });
      
      if (!existing) return baseName;
      
      // Extract name and extension
      let nameWithoutExt = baseName;
      let extension = '';
      
      if (!isFolder) {
        const lastDotIndex = baseName.lastIndexOf('.');
        if (lastDotIndex > 0) {
          nameWithoutExt = baseName.substring(0, lastDotIndex);
          extension = baseName.substring(lastDotIndex);
        }
      }
      
      // Find a unique name by incrementing counter
      let counter = 1;
      let candidateName = `${nameWithoutExt} (${counter})${extension}`;
      
      while (true) {
        const existsCandidate = await prisma.file.findFirst({
          where: {
            userId: effectiveOwnerId,
            name: candidateName,
            parentFolderId: parentFolderId || null,
            isDeleted: false
          }
        });
        
        if (!existsCandidate) break;
        
        counter++;
        candidateName = `${nameWithoutExt} (${counter})${extension}`;
        
        // Safety limit to prevent infinite loop
        if (counter > 1000) {
          candidateName = `${nameWithoutExt}_${Date.now()}${extension}`;
          break;
        }
      }
      
      return candidateName;
    };
    
    finalFileName = await makeUniqueFileName(fileName);

    // Safely convert arrays to Buffers, handling empty/null cases
    let encryptedDataBuffer: Buffer;
    let ivBuffer: Buffer;
    let wrappedKeyBuffer: Buffer;

    try {
      // Handle encryptedData
      if (encryptedData && Array.isArray(encryptedData) && encryptedData.length > 0) {
        encryptedDataBuffer = Buffer.from(encryptedData);
      } else {
        encryptedDataBuffer = Buffer.alloc(0);
      }

      // Handle iv
      if (iv && Array.isArray(iv) && iv.length > 0) {
        ivBuffer = Buffer.from(iv);
      } else {
        ivBuffer = Buffer.alloc(0);
      }

      // Handle wrappedKey
      if (wrappedKey && Array.isArray(wrappedKey) && wrappedKey.length > 0) {
        wrappedKeyBuffer = Buffer.from(wrappedKey);
      } else {
        wrappedKeyBuffer = Buffer.alloc(0);
      }

      } catch (bufferError) {
      
      return NextResponse.json(
        { error: 'Failed to process encryption data' },
        { status: 400 }
      );
    }

    // Create file
    try {
      const file = await prisma.file.create({
        data: {
          userId: effectiveOwnerId,
          ownerEmail: effectiveOwnerEmail,
          ownerName: uploadedByEmail,  // Only set when receiver uploads to sender's folder (stores uploader's EMAIL)
          name: finalFileName,  // Use auto-renamed filename
          size: BigInt(size || 0),
          type: isFolder ? 'folder' : 'file',  // Store type field
          mimeType: mimeType || null,
          encryptedData: encryptedDataBuffer,
          iv: ivBuffer,
          wrappedKey: wrappedKeyBuffer,
          parentFolderId: parentFolderId || null,
          isFolder: isFolder || false,
          isFavorite: false,
          isDeleted: false
        }
      });

      // NO AUTO-SHARING HERE - sharing is handled by the client via handleCreateFolder/handleFilesSelected

      return NextResponse.json({
        success: true,
        file: {
          id: file.id,
          name: file.name,
          size: file.size.toString(),
          mimeType: file.mimeType,
          parentFolderId: file.parentFolderId,
          isFolder: file.isFolder,
          createdAt: file.createdAt.toISOString()
        }
      });
    } catch (dbError: any) {
      
      
      // Check for specific Prisma errors
      if (dbError.code === 'P2002') {
        return NextResponse.json(
          { error: 'A file with this name already exists in this location' },
          { status: 409 }
        );
      }
      
      throw dbError; // Re-throw for general error handler
    }

  } catch (error: any) {
    
    
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}