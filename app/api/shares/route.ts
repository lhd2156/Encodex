// FILE LOCATION: app/api/shares/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserEmailFromToken } from '@/lib/auth';

/**
 * GET /api/shares
 * Get all shares for current user (both sent and received)
 * Replaces: sharedFilesManager.getAllShares()
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

    // Get all shares where user is either sender or receiver (case-insensitive)
    const shares = await prisma.share.findMany({
      where: {
        OR: [
          { recipientEmail: { equals: userEmail, mode: 'insensitive' } },
          { file: { ownerEmail: { equals: userEmail, mode: 'insensitive' } } },
        ],
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            size: true,
            type: true,
            createdAt: true,
            parentFolderId: true,
            ownerEmail: true,
            ownerName: true,  // ✅ Include uploader's email (set when someone uploads to shared folder)
            userId: true,
            // Join with User to get owner's name
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Transform shares to include ownerName from User relation and convert BigInt to string
    // Also need to look up uploader names for files uploaded to shared folders
    const uploaderEmails = new Set<string>();
    shares.forEach(share => {
      // file.ownerName stores uploader's email when someone uploads to a shared folder
      if (share.file.ownerName && share.file.ownerName !== share.file.ownerEmail) {
        uploaderEmails.add(share.file.ownerName.toLowerCase());
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

    const transformedShares = shares.map(share => {
      // ownerDisplayName = "FirstName (email)" format for display
      const ownerDisplayName = share.file.user 
        ? `${share.file.user.firstName} (${share.file.ownerEmail})`
        : share.file.ownerEmail || 'Unknown';
      
      // uploaderEmail = who uploaded the file (if different from owner)
      // This is stored in file.ownerName when someone uploads to a shared folder
      const uploaderEmail = share.file.ownerName || null;
      
      // ✅ FIX: Get uploader's live display name in "FirstName (email)" format
      const uploaderUserData = uploaderEmail 
        ? uploaderUsers.find(u => u.email.toLowerCase() === uploaderEmail.toLowerCase())
        : null;
      const uploaderName = uploaderUserData
        ? `${uploaderUserData.firstName} (${uploaderEmail})`
        : null;

      return {
        ...share,
        fileSize: share.fileSize?.toString() || '0', // Convert BigInt to string
        file: {
          id: share.file.id,
          name: share.file.name,
          size: share.file.size?.toString() || '0', // Convert BigInt to string
          type: share.file.type,
          createdAt: share.file.createdAt,
          parentFolderId: share.file.parentFolderId,
          ownerEmail: share.file.ownerEmail,
          ownerName: ownerDisplayName, // Owner's display name
          uploaderEmail, // Email of who uploaded (if different from owner)
          uploaderName, // ✅ NEW: Live display name of uploader
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: transformedShares,
    });
  } catch (error) {
    console.error('❌ [SHARES] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shares' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shares
 * Create a new share
 * Replaces: sharedFilesManager.shareFile()
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const {
      fileId,
      fileName,
      fileSize,
      fileType,
      recipientEmail: rawRecipientEmail,
      parentFolderId,
      fileData, // base64 encoded file data (optional)
    } = await req.json();

    // Validate required fields
    if (!fileId || !fileName || !rawRecipientEmail) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Normalize recipient email to lowercase for case-insensitive comparison
    const recipientEmail = rawRecipientEmail.toLowerCase();

    console.log(`📤 [SHARE] Attempting to share file ${fileId} (${fileName}) from ${userEmail} to ${recipientEmail}`);

    // Check if file exists and user owns it (case-insensitive email comparison)
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerEmail: {
          equals: userEmail,
          mode: 'insensitive',
        },
      },
    });

    if (!file) {
      // ✅ Debug: check if file exists at all
      const fileAny = await prisma.file.findUnique({
        where: { id: fileId },
        select: { id: true, name: true, ownerEmail: true }
      });
      
      if (fileAny) {
        console.error(`❌ [SHARE] File ${fileId} exists but owned by ${fileAny.ownerEmail}, not ${userEmail}`);
      } else {
        console.error(`❌ [SHARE] File ${fileId} does not exist in database`);
      }
      
      return NextResponse.json(
        { error: 'File not found or unauthorized' },
        { status: 404 }
      );
    }

    console.log(`✅ [SHARE] File found: ${file.name} (${file.id}), owner: ${file.ownerEmail}`);

    // Check if already shared with this recipient (case-insensitive)
    const existingShare = await prisma.share.findFirst({
      where: {
        fileId,
        recipientEmail: {
          equals: recipientEmail,
          mode: 'insensitive',
        },
      },
    });

    if (existingShare) {
      console.log(`⚠️ [SHARE] File ${fileId} already shared with ${recipientEmail}`);
      return NextResponse.json({
        success: false,
        message: 'File already shared with this user',
      });
    }

    // ✅ Check if recipient has this in their trash (prevent re-share before permanent delete)
    const recipientTrashed = await prisma.receiverTrashedShare.findFirst({
      where: {
        fileId,
        recipientEmail: {
          equals: recipientEmail,
          mode: 'insensitive',
        },
      },
    });

    if (recipientTrashed) {
      console.log(`🚫 [SHARE] Blocked - recipient has file in trash`);
      return NextResponse.json({
        success: false,
        message: 'Recipient has this file in trash. They must permanently delete it first.',
      }, { status: 400 });
    }

    // ✅ Clear recipient's metadata from separate tables before sharing (re-share cleanup)
    try {
      // Clear temp_deleted marker for this file (case-insensitive)
      const deletedTemp = await prisma.tempDeletedShare.deleteMany({
        where: {
          fileId,
          recipientEmail: {
            equals: recipientEmail,
            mode: 'insensitive',
          },
        },
      });

      // Clear hidden marker for this file (case-insensitive)
      const deletedHidden = await prisma.hiddenShare.deleteMany({
        where: {
          fileId,
          recipientEmail: {
            equals: recipientEmail,
            mode: 'insensitive',
          },
        },
      });

      // Clear receiver_trashed marker for this file (case-insensitive)
      const deletedTrashed = await prisma.receiverTrashedShare.deleteMany({
        where: {
          fileId,
          recipientEmail: {
            equals: recipientEmail,
            mode: 'insensitive',
          },
        },
      });

      const totalCleared = deletedTemp.count + deletedHidden.count + deletedTrashed.count;
      if (totalCleared > 0) {
        console.log(`🧹 [SHARE] Cleared ${totalCleared} metadata record(s) for re-share of file ${fileId}`);
      }
    } catch (error) {
      console.error('❌ [SHARE] Failed to clear recipient metadata:', error);
      // Continue anyway - this is cleanup, not critical
    }

    // ✅ FIX: Fetch recipient's actual name from User table for dynamic display
    let recipientDisplayName = recipientEmail;
    try {
      const recipientUser = await prisma.user.findFirst({
        where: {
          email: {
            equals: recipientEmail,
            mode: 'insensitive',
          },
        },
        select: {
          firstName: true,
          lastName: true,
        },
      });
      if (recipientUser) {
        recipientDisplayName = `${recipientUser.firstName} ${recipientUser.lastName}`.trim() || recipientEmail;
      }
    } catch (e) {
      console.warn('⚠️ [SHARE] Could not fetch recipient name:', e);
    }

    // Create the share
    // Note: Don't use both fileId AND file.connect - just use fileId (Prisma handles the relation)
    const share = await prisma.share.create({
      data: {
        fileId,
        fileName,
        fileSize: fileSize || file.size,
        fileType: fileType || file.type || 'file', // Default to 'file' if not provided
        recipientEmail,
        recipientName: recipientDisplayName, // ✅ Store the actual name
        parentFolderId,
        sharedAt: new Date(),
      },
    });

    console.log(`✅ [SHARE] Created share ${share.id} for file ${fileId} with ${recipientEmail}`);

    // ✅ FIX: If parent folder is in receiver's trash, auto-add this item to their trash too
    if (parentFolderId) {
      try {
        const parentInReceiverTrash = await prisma.receiverTrashedShare.findFirst({
          where: {
            fileId: parentFolderId,
            recipientEmail: {
              equals: recipientEmail,
              mode: 'insensitive',
            },
          },
        });
        
        if (parentInReceiverTrash) {
          // Parent is in receiver's trash, so add this new item to their trash too
          await prisma.receiverTrashedShare.upsert({
            where: {
              fileId_recipientEmail: {
                fileId,
                recipientEmail,
              },
            },
            update: {}, // No update needed
            create: {
              shareId: share.id,
              fileId,
              recipientEmail,
            },
          });
          console.log(`🗑️ [SHARE] Parent folder in receiver's trash - auto-adding new item to their trash`);
        }
      } catch (e) {
        console.error('❌ [SHARE] Failed to check/set receiver trash for new share:', e);
        // Continue anyway - this is not critical
      }
    }

    // Convert BigInt to string for JSON serialization
    return NextResponse.json({
      success: true,
      data: {
        ...share,
        fileSize: share.fileSize?.toString() || '0',
      },
    });
  } catch (error) {
    console.error('❌ [SHARE] Error creating share:', error);
    return NextResponse.json(
      { error: 'Failed to create share' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/shares
 * Update share (filename, parent folder, etc.)
 * Replaces: sharedFilesManager.updateSharedFileName() and updateSharedFileParent()
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

    const { fileId, fileName, parentFolderId } = await req.json();

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId required' },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: any = {};
    if (fileName !== undefined) updateData.fileName = fileName;
    if (parentFolderId !== undefined) updateData.parentFolderId = parentFolderId;

    // Update all shares for this file
    const result = await prisma.share.updateMany({
      where: {
        fileId,
      },
      data: updateData,
    });

    console.log(`✅ [SHARE] Updated ${result.count} shares for file ${fileId}`);

    return NextResponse.json({
      success: true,
      count: result.count,
    });
  } catch (error) {
    console.error('❌ [SHARE] Error updating shares:', error);
    return NextResponse.json(
      { error: 'Failed to update shares' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/shares
 * Delete specific share
 * Replaces: sharedFilesManager.unshareFile()
 */
export async function DELETE(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = await getUserEmailFromToken(token);
    if (!userEmail) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let fileId = searchParams.get('fileId');
    let recipientEmail = searchParams.get('recipientEmail');
    
    // Also support body params (for receivers deleting)
    if (!fileId || !recipientEmail) {
      try {
        const body = await req.json();
        fileId = fileId || body.fileId;
        recipientEmail = recipientEmail || body.recipientEmail;
      } catch {
        // Ignore JSON parse errors
      }
    }

    if (!fileId || !recipientEmail) {
      return NextResponse.json(
        { error: 'fileId and recipientEmail required' },
        { status: 400 }
      );
    }

    // Check if user is the owner OR the recipient (case-insensitive)
    const file = await prisma.file.findFirst({
      where: { id: fileId },
    });

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const isOwner = file.ownerEmail.toLowerCase() === userEmail.toLowerCase();
    const isRecipient = recipientEmail.toLowerCase() === userEmail.toLowerCase();
    
    // ✅ Allow: Owner can unshare anyone, Recipient can unshare themselves
    if (!isOwner && !isRecipient) {
      return NextResponse.json(
        { error: 'Unauthorized - only owner or recipient can remove share' },
        { status: 403 }
      );
    }

    // Get all descendant files (for folders)
    const allFileIds = await getDescendantFileIds(fileId);

    // Delete shares for file and all descendants
    const result = await prisma.share.deleteMany({
      where: {
        fileId: { in: allFileIds },
        recipientEmail,
      },
    });

    // Clean up receiver_trashed_shares
    await prisma.receiverTrashedShare.deleteMany({
      where: {
        fileId: { in: allFileIds },
        recipientEmail,
      },
    });

    console.log(`✅ [UNSHARE] Deleted ${result.count} shares from ${recipientEmail}`);

    return NextResponse.json({
      success: true,
      count: result.count,
    });
  } catch (error) {
    console.error('❌ [UNSHARE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete shares' },
      { status: 500 }
    );
  }
}

// Helper function to get all descendant file IDs (for folders)
async function getDescendantFileIds(fileId: string): Promise<string[]> {
  const result: string[] = [fileId];
  const queue: string[] = [fileId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    
    const children = await prisma.file.findMany({
      where: {
        parentFolderId: current,
      },
      select: {
        id: true,
      },
    });

    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }

  return result;
}