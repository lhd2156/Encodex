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

    // ✅ DEBUG: Verify user exists in database and IDs match
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true }
    });
    
    console.log('🔐 [UPLOAD-AUTH] User verification:', {
      tokenUserId: user.userId,
      tokenEmail: user.email,
      dbUserId: dbUser?.id,
      dbEmail: dbUser?.email,
      emailMatch: dbUser?.email?.toLowerCase() === user.email.toLowerCase(),
      idMatch: dbUser?.id === user.userId
    });

    if (!dbUser) {
      console.error('❌ [UPLOAD] User ID from token not found in database!');
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    if (dbUser.email.toLowerCase() !== user.email.toLowerCase()) {
      console.error('❌ [UPLOAD] Email mismatch! Token:', user.email, 'DB:', dbUser.email);
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

    console.log('📥 [UPLOAD] Request received:', {
      fileName,
      isFolder,
      size,
      parentFolderId: parentFolderId || 'NULL (root)',
      hasEncryptedData: !!encryptedData,
      encryptedDataLength: encryptedData?.length,
      userId: user.userId,
      userEmail: user.email  // ✅ Log email for debugging
    });

    // Validation
    if (!fileName) {
      return NextResponse.json(
        { error: 'File name is required' },
        { status: 400 }
      );
    }

    // ✅ SAFETY: Ensure user email is valid
    if (!user.email) {
      console.error('❌ [UPLOAD] User email is empty or undefined!');
      return NextResponse.json(
        { error: 'Invalid user authentication' },
        { status: 401 }
      );
    }

    // ✅ CRITICAL FIX: Files/folders should ALWAYS belong to the UPLOADER
    // NO ownership transfer - each user owns what they create
    // Sharing is handled separately via Share records
    let effectiveOwnerEmail = user.email;
    let effectiveOwnerId = user.userId;
    let uploadedByEmail: string | null = null;

    console.log(`📁 [UPLOAD] OWNER WILL BE: ${effectiveOwnerEmail} (ID: ${effectiveOwnerId})`);
    console.log(`📁 [UPLOAD] parentFolderId = ${parentFolderId || 'null (ROOT)'}`);

    // Log parent folder info for debugging but DON'T transfer ownership
    if (parentFolderId) {
      const parentFolder = await prisma.file.findUnique({
        where: { id: parentFolderId },
        select: { userId: true, ownerEmail: true, name: true }
      });

      console.log(`📁 [UPLOAD] Parent folder info (FOR DEBUGGING ONLY):`, {
        parentFolderId,
        found: !!parentFolder,
        parentName: parentFolder?.name,
        parentOwnerEmail: parentFolder?.ownerEmail,
        uploaderEmail: user.email,
        isSameOwner: parentFolder?.ownerEmail?.toLowerCase() === user.email.toLowerCase()
      });
      
      // ✅ DO NOT TRANSFER OWNERSHIP - just log if it's a shared folder
      if (parentFolder && parentFolder.ownerEmail.toLowerCase() !== user.email.toLowerCase()) {
        console.log(`📁 [UPLOAD] ⚠️ Uploading to someone else's folder - but KEEPING ownership with uploader ${user.email}`);
        uploadedByEmail = user.email; // Just track who uploaded, don't change owner
      }
    }

    // ✅ FIX: Allow empty encryption data for now (client may not be encrypting yet)
    // We'll store empty buffers and the client can update them later
    const isEncrypted = encryptedData && encryptedData.length > 0 && iv && iv.length > 0 && wrappedKey && wrappedKey.length > 0;
    
    if (!isFolder && !isEncrypted) {
      console.warn('⚠️ [UPLOAD] File uploaded without encryption data - storing empty buffers');
    }

    // ✅ FIX: Auto-rename files if a duplicate exists (instead of returning 409)
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
      
      console.log(`📝 [UPLOAD] Auto-renamed "${baseName}" → "${candidateName}"`);
      return candidateName;
    };
    
    finalFileName = await makeUniqueFileName(fileName);

    // ✅ FIX: Safely convert arrays to Buffers, handling empty/null cases
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

      console.log('📦 [UPLOAD] Buffer conversion successful:', {
        encryptedDataSize: encryptedDataBuffer.length,
        ivSize: ivBuffer.length,
        wrappedKeySize: wrappedKeyBuffer.length
      });
    } catch (bufferError) {
      console.error('❌ [UPLOAD] Buffer conversion failed:', bufferError);
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
          name: finalFileName,  // ✅ Use auto-renamed filename
          size: BigInt(size || 0),
          type: isFolder ? 'folder' : 'file',  // ✅ Store type field
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

      console.log('✅ [UPLOAD] File created successfully:', {
        id: file.id,
        name: file.name,
        isFolder: file.isFolder,
        ownerId: effectiveOwnerId,
        ownerEmail: effectiveOwnerEmail
      });

      // ✅ NO AUTO-SHARING HERE - sharing is handled by the client via handleCreateFolder/handleFilesSelected

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
      console.error('❌ [UPLOAD] Database error:', dbError);
      
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
    console.error('❌ [UPLOAD] Upload error:', error);
    console.error('Error stack:', error.stack);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}