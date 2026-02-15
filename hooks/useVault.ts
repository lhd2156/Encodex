'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fileStorage } from '@/components/pdf/fileStorage';
import { sharedFilesManager, SHARED_FILES_EVENT, SHARED_FILES_SYNC_TRIGGER, SHARED_FILES_KEY } from '@/lib/sharedFilesManager';
import { decryptFileData, importFileKey, unwrapFileKey, encryptFile, wrapFileKey } from '@/lib/crypto';

const getAuthToken = () => typeof window !== 'undefined' ? sessionStorage.getItem('auth_token') : null;
const apiCall = async (endpoint: string, options: RequestInit = {}): Promise<any> => {
  const token = getAuthToken();
  if (!token) {
    // Return null instead of throwing - caller should handle gracefully
    return null;
  }
  
  try {
    const response = await fetch(endpoint, {
      ...options,
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${token}`, 
        ...options.headers 
      },
    });
    
    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const error = await response.json();
        errorMsg = error.error || error.message || errorMsg;
      } catch {
        // Response body is not JSON, use HTTP status
      }
      throw new Error(errorMsg);
    }
    
    try {
      return await response.json();
    } catch (parseError) {
      // error silenced for production
      return { success: false };
    }
  } catch (error) {
    throw error;
  }
};
const API = {
  fetchFiles: () => apiCall('/api/files'),
  uploadFile: (data: any) => apiCall('/api/files/upload', { method: 'POST', body: JSON.stringify(data) }),
  deleteFile: (id: string) => apiCall(`/api/files/${id}`, { method: 'DELETE' }),
  updateFile: (id: string, data: any) => apiCall(`/api/files/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  fetchShares: () => apiCall('/api/shares'),
  createShare: (data: any) => apiCall('/api/shares', { method: 'POST', body: JSON.stringify(data) }),
};
// ========== END API INTEGRATION ==========

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: 'file' | 'folder';
  createdAt: Date;
  parentFolderId?: string | null;
  originalParentId?: string | null;
  isFavorite?: boolean;
  sharedBy?: string;
  sharedByName?: string;
  owner?: string;
  ownerName?: string;
  uploaderName?: string; // NEW: Live display name of uploader (when different from owner)
  isSharedFile?: boolean;
  isReceivedShare?: boolean;
  insideSharedFolder?: boolean; 
  sharedWith?: string[]; // List of emails this file is shared with
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
}

export type TabType = 'vault' | 'shared' | 'favorites' | 'recent' | 'trash';
export type SharePermission = 'view' | 'edit';

// Helper for case-insensitive email comparison
const emailsMatch = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
};

export function useVault(userEmail: string, userName?: string, masterKey?: CryptoKey) {
  // Get auth token for API calls
  const authToken = getAuthToken();

  const [files, setFiles] = useState<FileItem[]>([]);
  const [deletedFiles, setDeletedFiles] = useState<FileItem[]>([]);
  const [storageUsed, setStorageUsed] = useState(0);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<TabType>('vault');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    type: 'All',
    modified: 'Any time',
  });
  const [sortBy, setSortBy] = useState<'name' | 'modified' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  const hasLoaded = useRef(false);
  const isSyncing = useRef(false); // CRITICAL FIX: Prevent concurrent syncs
  const syncDebounceTimer = useRef<NodeJS.Timeout | null>(null); // Debounce rapid sync calls
  const deletedFilesRef = useRef<FileItem[]>([]); // FIX: Ref to avoid dependency loop
  const pendingFavoritesRef = useRef<Set<string>>(new Set()); // FIX: Track files with pending favorite toggle
  const pendingRenamesRef = useRef<Map<string, string>>(new Map()); // FIX: Track pending renames (fileId -> newName)
  const pendingPermanentDeletesRef = useRef<Set<string>>(new Set()); // FIX: Track pending permanent deletes
  const [sharedFilesCount, setSharedFilesCount] = useState(0); // FIX: State-based count instead of async function


  const devLog = (...args: any[]) => {
    try {
      const stamp = `${new Date().toISOString()} @${(performance && performance.now ? performance.now() : Date.now()).toFixed(2)}`;
    } catch (e) {
    }
  };

// ─── HELPER: Check if a shared folder is in sender's trash ────────────────
  const isSenderFolderInTrash = useCallback(async (folderId: string, ownerEmail: string): Promise<boolean> => {
    try {
      // Call API to get sender's trash
      const response = await apiCall(`/api/trash?owner=${encodeURIComponent(ownerEmail)}`);
      
      if (!response || !response.success || !response.data) return false;
      
      const senderTrash = response.data;
      const isInTrash = senderTrash.some((item: any) => item.id === folderId);
      
      return isInTrash;
    } catch (e) {
      return false;
    }
  }, []);

  // ─── HELPER: Check if item should be visible based on folder parent trash status ─────
  const shouldShowSharedItem = useCallback(async (
    item: any, 
    tempDeletedList: string[], 
    ownerEmail: string,
    receiverTrashedList: string[] = []   // ← receiver's own trashed-share IDs
  ): Promise<boolean> => {

    // ── sender trashed it ──
    if (tempDeletedList.includes(item.fileId)) {
      return false;
    }

    // FIX: DON'T block receiver-trashed items here!
    // They need to pass through so they can be sorted into sharesToAddToTrash
    // and become proper tombstones in deletedFiles for the trash view.
    // The sorting happens later in the sync after visibility checks.
    if (receiverTrashedList.includes(item.fileId)) {
      return true; // Changed from return false - let it through!
    }

    // If item is at root level, parent checks below are N/A
    if (!item.parentFolderId) {
      return true;
    }

    // Check if parent folder is in sender's trash
    const parentInSenderTrash = await isSenderFolderInTrash(item.parentFolderId, ownerEmail);
    if (parentInSenderTrash) {
      return false;
    }

    // Check if parent folder is temp deleted
    if (tempDeletedList.includes(item.parentFolderId)) {
      return false;
    }

    return true;
  }, [isSenderFolderInTrash]);

  // TOP TWO DONE

  const syncSharedFiles = useCallback(async () => {
    // CRITICAL: Prevent concurrent syncs (fixes API spam)
    if (isSyncing.current) {
      return;
    }
    
    // FIX: Guard against missing token (e.g., fresh registration before token is set)
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('auth_token') : null;
    if (!token || !userEmail) {
      return;
    }
    
    isSyncing.current = true;
    
    try {
    
    // STEP 1: Fetch all data from API upfront
    const sharesResponse = await apiCall('/api/shares');
    const allShares = sharesResponse?.data || [];
    
    const sharedWithMe = allShares.filter((share: any) => 
      emailsMatch(share.recipientEmail, userEmail)
    );
    const sharedByMe = allShares.filter((share: any) => 
      emailsMatch(share.file.ownerEmail, userEmail)
    );
    

    const hiddenResponse = await apiCall('/api/shares/hidden');
    const hiddenList: string[] = (hiddenResponse?.data || []).map((h: any) => h.fileId);

    const tempDeletedResponse = await apiCall('/api/shares/temp-deleted');
    let tempDeletedList: string[] = (tempDeletedResponse?.data || []).map((t: any) => t.fileId);

    // FIX: Validate tempDeletedList - clean up stale TempDeletedShare records
    // These can become stale if the sender restored files but didn't sync
    if (tempDeletedList.length > 0 && sharedWithMe.length > 0) {
      const staleFileIds: string[] = [];
      
      // Group shared files by owner to minimize API calls
      const filesByOwner = new Map<string, string[]>();
      for (const share of sharedWithMe) {
        const ownerEmail = share.file.ownerEmail;
        if (tempDeletedList.includes(share.fileId)) {
          if (!filesByOwner.has(ownerEmail)) {
            filesByOwner.set(ownerEmail, []);
          }
          filesByOwner.get(ownerEmail)!.push(share.fileId);
        }
      }
      
      // Check each owner's trash to verify files are actually trashed
      for (const [ownerEmail, fileIds] of filesByOwner) {
        try {
          const ownerTrashResponse = await apiCall(`/api/trash?owner=${encodeURIComponent(ownerEmail)}`);
          const ownerTrashIds = new Set((ownerTrashResponse?.data || []).map((f: any) => f.id));
          
          for (const fileId of fileIds) {
            if (!ownerTrashIds.has(fileId)) {
              staleFileIds.push(fileId);
            }
          }
        } catch (e) {
        }
      }
      
      // Clean up stale records
      if (staleFileIds.length > 0) {
        try {
          await apiCall('/api/shares/temp-deleted', {
            method: 'POST',
            body: JSON.stringify({
              fileIds: staleFileIds,
              recipientEmails: [userEmail],
              isTrashed: false // Remove these stale records
            })
          });
          // Update the tempDeletedList to exclude cleaned up IDs
          tempDeletedList = tempDeletedList.filter(id => !staleFileIds.includes(id));
        } catch (e) {
        }
      }
    }

    const receiverTrashedResponse = await apiCall('/api/shares/trashed');
    const receiverTrashedList: string[] = (receiverTrashedResponse?.data || []).map((t: any) => t.fileId);

    // STEP 2.5: Fetch user's favorites (per-user, not shared between sender/receiver)
    let userFavoritesList: string[] = [];
    try {
      const favoritesResponse = await apiCall('/api/metadata/favorites');
      userFavoritesList = favoritesResponse?.data || [];
    } catch (e) {
    }

    // STEP 3: Fetch sender's trash status
    const senderTrashResponse = await apiCall('/api/trash');
    const senderTrash = senderTrashResponse?.data || [];
    
    // STEP 3: Pre-fetch all recipient lists for shared files
    const recipientsByFileId = new Map<string, string[]>();
    for (const share of sharedByMe) {
      try {
        const recipientsResponse = await apiCall('/api/shares/recipients', {
          method: 'POST',
          body: JSON.stringify({ fileId: share.fileId })
        });
        recipientsByFileId.set(share.fileId, recipientsResponse?.recipients || []);
      } catch (e) {
        // error silenced for production
        recipientsByFileId.set(share.fileId, []);
      }
    }

    // STEP 4: Now do synchronous state updates with the fetched data
    
    setDeletedFiles((prev) => {

      const filtered = prev.filter((deletedFile) => {
        if (!deletedFile.isSharedFile) return true;
        
        // CAREFUL: Only remove if tempDeletedList ACTUALLY contains this file
        // AND the share no longer exists in sharedWithMe (sender revoked or file gone)
        if (tempDeletedList.includes(deletedFile.id)) {
          // Double-check: is this share still valid?
          const shareStillExists = sharedWithMe.some((s: any) => s.fileId === deletedFile.id);
          if (!shareStillExists) {
            return false;
          } else {
            // Share still exists - sender might have restored. Keep the tombstone.
            return true;
          }
        }
        return true;
      });

      const existingIds = new Set(filtered.map(d => d.id));
      const toRestore: FileItem[] = [];
      
      sharedWithMe.forEach((share: any) => {
        if (receiverTrashedList.includes(share.fileId) && !tempDeletedList.includes(share.fileId)) {
          if (!existingIds.has(share.fileId)) {
            
            const tombstone: FileItem & { originalSharedId?: string; sharedMeta?: any } = {
              id: share.fileId,
              name: share.fileName,
              size: typeof share.fileSize === 'string' ? parseInt(share.fileSize, 10) || 0 : (share.fileSize || 0),
              type: share.fileType,
              createdAt: new Date(share.file.createdAt || Date.now()),
              parentFolderId: share.parentFolderId || null,
              owner: share.file.ownerEmail,
              isSharedFile: true,
            } as any;
            
            tombstone.originalSharedId = share.fileId;
            tombstone.sharedMeta = { ownerId: share.file.ownerEmail, ownerName: share.file.ownerName };
            
            toRestore.push(tombstone);
          }
        }
      });

      const updated = filtered.map((deletedFile) => {
        if (!deletedFile.isSharedFile) return deletedFile;
        const updatedShare = sharedWithMe.find((s: any) => s.fileId === deletedFile.id);
        if (updatedShare && updatedShare.fileName !== deletedFile.name) {
          return { ...deletedFile, name: updatedShare.fileName };
        }
        return deletedFile;
      });

      const final = [...updated, ...toRestore];
      return final;
    });

    sharedWithMe.forEach((share: any) => {
      const selfHeld  = receiverTrashedList.includes(share.fileId);
      const parentHeld = share.parentFolderId && receiverTrashedList.includes(share.parentFolderId);
      if (selfHeld || parentHeld) {
      }
    });

    const sharesHeld = sharedWithMe.filter((share: any) => {
      return receiverTrashedList.includes(share.fileId) || (share.parentFolderId && receiverTrashedList.includes(share.parentFolderId));
    });

    if (sharesHeld.length > 0) {
      setDeletedFiles((prev) => {
        const existingIds = new Set(prev.map(d => d.id));
        const existingOrig = new Set(prev.map(d => (d as any).originalSharedId).filter(Boolean));

        const toAdd: FileItem[] = [];
        sharesHeld.forEach((share: any) => {
          if (existingIds.has(share.fileId) || existingOrig.has(share.fileId)) {
            return;
          }

          const tombstone: FileItem & { originalSharedId?: string; sharedMeta?: any } = {
            id: share.fileId,
            name: share.fileName,
            size: typeof share.fileSize === 'string' ? parseInt(share.fileSize, 10) || 0 : (share.fileSize || 0),
            type: share.fileType,
            createdAt: new Date(share.file.createdAt || Date.now()),
            parentFolderId: share.parentFolderId || null,
            owner: share.file.ownerEmail,
            isSharedFile: true,
          } as any;

          tombstone.originalSharedId = share.fileId;
          tombstone.sharedMeta = { ownerId: share.file.ownerEmail, ownerName: share.file.ownerName };

          toAdd.push(tombstone);
        });

        if (toAdd.length > 0) {
          return [...prev, ...toAdd];
        }
        return prev;
      });
    }

    // STEP 5: Handle trash status sync for sender's shared files
    // Batch API calls for temp_deleted updates
    const filesInTrash = new Set(senderTrash.map((item: any) => item.id));
    
    for (const share of sharedByMe) {
      const allRecipients = recipientsByFileId.get(share.fileId) || [];
      const isInSenderTrash = filesInTrash.has(share.fileId);
      
      if (allRecipients.length > 0) {
        try {
          await apiCall('/api/shares/temp-deleted', {
            method: 'POST',
            body: JSON.stringify({
              fileIds: [share.fileId],
              recipientEmails: allRecipients,
              isTrashed: isInSenderTrash
            })
          });
        } catch (e) {
        }
      }
    }

    // FIX: Compute visibility results BEFORE setFiles (since setFiles callback must be synchronous)
    const visibilityResults = await Promise.all(
      sharedWithMe.map(async (share: any) => {
        // FIX: Skip files that are pending permanent delete (prevents phantom re-add)
        if (pendingPermanentDeletesRef.current.has(share.fileId)) {
          return { share, visible: false };
        }
        
        const isHidden = hiddenList.includes(share.fileId);
        if (isHidden) {
          return { share, visible: false };
        }
        
        const visible = await shouldShowSharedItem(share, tempDeletedList, share.file.ownerEmail, receiverTrashedList);
        return { share, visible };
      })
    );
    
    const precomputedActiveShares = visibilityResults
      .filter(result => result.visible)
      .map(result => result.share);

    // FIX: Fetch fresh owned files from API to catch files added by others (e.g., receiver uploads to shared folder)
    let freshOwnedFiles: FileItem[] = [];
    try {
      const filesResponse = await apiCall('/api/files');
      if (filesResponse?.files) {
        freshOwnedFiles = filesResponse.files.map((f: any) => ({
          ...f,
          createdAt: new Date(f.createdAt),
          size: typeof f.size === 'string' ? parseInt(f.size, 10) : f.size
        }));
      }
    } catch (e) {
    }

    setFiles((prev) => {
      const seenOwn = new Set<string>();
      const normalizedUserEmail = userEmail?.toLowerCase() || '';
      // FIX: Use fresh owned files from API if available, otherwise fall back to prev
      // Files from API are ALWAYS owned files (userId matches current user)
      const sourceFiles = freshOwnedFiles.length > 0 ? freshOwnedFiles : prev;
      let ownFiles = sourceFiles.filter((f) => {
        // NEVER include received shares in own files
        // isReceivedShare = file was shared WITH us by someone else
        if ((f as any).isReceivedShare) {
          return false;
        }
        
        // CRITICAL FIX: Only use owner check, NOT isSharedFile flag!
        // Files uploaded to shared folders have isSharedFile=true but are still OWNED by uploader
        // The isSharedFile flag indicates "inside shared folder" NOT "received from someone else"
        if (f.owner && normalizedUserEmail && f.owner.toLowerCase() !== normalizedUserEmail) {
          return false;
        }
        
        // If using fresh API data, owner field might not be set - check if it's NOT a received share
        // (API returns only files where userId = current user)
        if (!f.owner && freshOwnedFiles.length > 0) {
          // This is from fresh API call, so it's definitely our file
          // Don't exclude based on isSharedFile flag
        }
        
        if (seenOwn.has(f.id)) {
          return false;
        }
        seenOwn.add(f.id);
        return true;
      });
      
      // FIX: Preserve pending renames for ALL owned files (prevents flicker when sender renames)
      // This must happen BEFORE the sharedByMe loop and covers non-shared files too
      ownFiles = ownFiles.map(f => {
        const pendingName = pendingRenamesRef.current.get(f.id);
        if (pendingName) {
          return { ...f, name: pendingName };
        }
        return f;
      });
      
      sharedByMe.forEach((share: any) => {
        const ownFileIndex = ownFiles.findIndex(f => f.id === share.fileId);
        if (ownFileIndex !== -1) {
          const allRecipients = recipientsByFileId.get(share.fileId) || [];
          
          const isInSenderTrash = filesInTrash.has(share.fileId);
          
          const isInAnyRecipientTrash = tempDeletedList.includes(share.fileId);
          const activeRecipients = isInAnyRecipientTrash ? [] : allRecipients;
          
          const nameFromShare = share.fileName;
          let finalName = nameFromShare;
          
          const hasConflict = ownFiles.some((f, idx) => 
            idx !== ownFileIndex &&
            f.name === nameFromShare && 
            !f.parentFolderId && 
            f.type === share.fileType
          );
          
          if (hasConflict) {
            let nameWithoutExt = nameFromShare;
            let extension = '';
            
            if (share.fileType === 'file') {
              const lastDotIndex = nameFromShare.lastIndexOf('.');
              if (lastDotIndex > 0) {
                nameWithoutExt = nameFromShare.substring(0, lastDotIndex);
                extension = nameFromShare.substring(lastDotIndex);
              }
            }
            
            let counter = 1;
            let candidateName = `${nameWithoutExt} (${counter})${extension}`;
            while (ownFiles.some((f, idx) => idx !== ownFileIndex && f.name === candidateName && !f.parentFolderId && f.type === share.fileType)) {
              counter++;
              candidateName = `${nameWithoutExt} (${counter})${extension}`;
            }
            
            finalName = candidateName;
          }
          
          // FIX: Preserve existing sharedWith if API returned empty (prevents flicker from optimistic updates)
          const existingSharedWith = ownFiles[ownFileIndex].sharedWith;
          const newSharedWith = activeRecipients.length > 0 
            ? activeRecipients 
            : existingSharedWith; // Keep optimistic value if API hasn't caught up
          
          // FIX: Preserve pending rename (prevents flicker when sender renames)
          const pendingName = pendingRenamesRef.current.get(share.fileId);
          const resolvedName = pendingName || finalName;
          
          ownFiles[ownFileIndex] = {
            ...ownFiles[ownFileIndex],
            name: resolvedName,
            sharedWith: newSharedWith
          };
        }
      });

      // Use precomputed activeShares (computed before setFiles to handle async properly)
      const activeShares = precomputedActiveShares;
      
      activeShares.forEach((s: any, i: number) => {
      });
      
      const sharesToAddToTrash: any[] = [];
      const sharesToAddToFiles: any[] = [];
      
      activeShares.forEach((share: any) => {

        
        const isInReceiverTrash = receiverTrashedList.includes(share.fileId);
        
        let parentInReceiverTrash = false;
        if (share.parentFolderId) {
          parentInReceiverTrash = receiverTrashedList.includes(share.parentFolderId);
          
          if (!parentInReceiverTrash) {
            const parentTombstone = deletedFilesRef.current.find(d => 
              d.id === share.parentFolderId || 
              (d as any).originalSharedId === share.parentFolderId
            );
            if (parentTombstone) {
              parentInReceiverTrash = true;
            }
          }
        }
        
        if (isInReceiverTrash || parentInReceiverTrash) {
          sharesToAddToTrash.push(share);
        } else {
          sharesToAddToFiles.push(share);
        }
      });
      
      const sharedItemIds = new Set(activeShares.map((s: any) => s.fileId));
      
      const getSharedParentId = (share: any): string | null => {
        const parentId = share.parentFolderId;
        if (!parentId) return null;
        if (sharedItemIds.has(parentId)) return parentId;
        if (ownFiles.some(f => f.id === parentId && f.type === 'folder')) return parentId;
        return null;
      };
      
      const sharedFileItems: FileItem[] = sharesToAddToFiles.map((share: any) => {
        let displayName = share.fileName;
        const parentFolderId = getSharedParentId(share);
        
        
        const hasConflict = ownFiles.some(f => 
          f.name === share.fileName && 
          f.parentFolderId === parentFolderId &&
          f.type === share.fileType
        );
        
        const existingSharedConflict = sharesToAddToFiles.filter((s: any) => {
          if (s.fileId === share.fileId) return false;
          if (s.fileName !== share.fileName) return false;
          if (s.fileType !== share.fileType) return false;
          const sParentId = getSharedParentId(s);
          return sParentId === parentFolderId;
        });
        
        
        if (hasConflict || existingSharedConflict.length > 0) {
          let nameWithoutExt = share.fileName;
          let extension = '';
          
          if (share.fileType === 'file') {
            const lastDotIndex = share.fileName.lastIndexOf('.');
            if (lastDotIndex > 0) {
              nameWithoutExt = share.fileName.substring(0, lastDotIndex);
              extension = share.fileName.substring(lastDotIndex);
            }
          }
          
          let counter = 1;
          let candidateName = `${nameWithoutExt} (${counter})${extension}`;
          
          while (
            ownFiles.some(f => f.name === candidateName && f.parentFolderId === parentFolderId && f.type === share.fileType) ||
            activeShares.some((s: any) => {
              if (s.fileId === share.fileId) return false;
              if (s.fileName !== candidateName) return false;
              if (s.fileType !== share.fileType) return false;
              const sParentId = getSharedParentId(s);
              return sParentId === parentFolderId;
            })
          ) {
            counter++;
            candidateName = `${nameWithoutExt} (${counter})${extension}`;
          }
          
          displayName = candidateName;
        }
        
        // FIX: Use API-based favorites (userFavoritesList from sync)
        const isFavorite = userFavoritesList.includes(share.fileId);
        
        return {
          id: share.fileId,
          name: displayName,
          size: typeof share.fileSize === 'string' ? parseInt(share.fileSize, 10) || 0 : (share.fileSize || 0),
          type: share.fileType,
          createdAt: share.file.createdAt,
          parentFolderId: parentFolderId,
          sharedBy: share.file.ownerEmail,
          sharedByName: share.file.ownerName, // Owner's display name (live from User table)
          owner: share.file.ownerEmail,
          // ownerName stores uploader's email (for VaultTable "who uploaded" display)
          ownerName: share.file.uploaderEmail || undefined,
          // NEW: uploaderName stores uploader's live display name
          uploaderName: share.file.uploaderName || undefined,
          isSharedFile: true,
          isReceivedShare: true as any,
          isFavorite, // Use loaded favorite state
        };
      });
      
      
      if (sharesToAddToTrash.length > 0) {
        setDeletedFiles((prev) => {
          // Build a map of share fileId -> share data for quick lookup
          const shareDataMap = new Map<string, any>();
          sharesToAddToTrash.forEach((share: any) => {
            shareDataMap.set(share.fileId, share);
          });
          
          // Update existing tombstones with fresh share data (e.g., renamed files)
          let updated = prev.map(d => {
            const fileId = (d as any).originalSharedId || d.id;
            const share = shareDataMap.get(fileId);
            if (share && d.name !== share.fileName) {
              shareDataMap.delete(fileId); // Mark as processed
              return { ...d, name: share.fileName };
            }
            if (share) {
              shareDataMap.delete(fileId); // Mark as processed (no change needed)
            }
            return d;
          });
          
          // Add new tombstones for items not already present
          const toAdd: FileItem[] = [];
          shareDataMap.forEach((share: any, fileId: string) => {
            const tombstone: FileItem & { originalSharedId?: string; sharedMeta?: any } = {
              id: fileId,
              name: share.fileName,
              size: typeof share.fileSize === 'string' ? parseInt(share.fileSize, 10) || 0 : (share.fileSize || 0),
              type: share.fileType,
              createdAt: new Date(share.file.createdAt || Date.now()),
              parentFolderId: share.parentFolderId || null,
              owner: share.file.ownerEmail,
              isSharedFile: true,
            } as any;
            
            tombstone.originalSharedId = share.fileId;
            tombstone.sharedMeta = { ownerId: share.file.ownerEmail, ownerName: share.file.ownerName };
            
            toAdd.push(tombstone);
          });
          
          if (toAdd.length > 0) {
            updated = [...updated, ...toAdd];
          }
          
          return updated;
        });
      } else {
      }
      
      const ownFileIds = new Set(ownFiles.map(f => f.id));
      const deletedIds = new Set<string>();
      deletedFilesRef.current.forEach(d => {
        deletedIds.add(d.id);
        const orig = (d as any).originalSharedId;
        if (orig) deletedIds.add(orig);
      });

      const uniqueSharedFiles = sharedFileItems.filter(sf => {
        if (ownFileIds.has(sf.id)) {
          return false;
        }

        if (deletedIds.has(sf.id) || receiverTrashedList.includes(sf.id)) {
          return false;
        }
        
        if (sf.parentFolderId && receiverTrashedList.includes(sf.parentFolderId)) {
          return false;
        }

        return true;
      });

      
      const combinedFiles = [...ownFiles, ...uniqueSharedFiles];

      try {
        const dedupMap = new Map<string, FileItem>();
        const dupIds: string[] = [];
        for (const f of combinedFiles) {
          if (dedupMap.has(f.id)) {
            dupIds.push(f.id);
            continue;
          }
          dedupMap.set(f.id, f);
        }
        const combinedDeduped = Array.from(dedupMap.values());

        const finalFiles = combinedDeduped.map(file => {
          // FIX: Apply user-specific favorites from API (not the old shared File.isFavorite)
          // BUT: If this file has a pending favorite toggle, preserve its current state!
          const existingFile = prev.find(f => f.id === file.id);
          const isPendingFavorite = pendingFavoritesRef.current.has(file.id);
          const isFavorite = isPendingFavorite 
            ? (existingFile?.isFavorite ?? false) // Preserve current state for pending toggles
            : userFavoritesList.includes(file.id); // Otherwise use API state
          
          if (file.isReceivedShare) {
            return {
              ...file,
              isFavorite
            };
          }
          const sharedWith = recipientsByFileId.get(file.id) || [];
          // FIX: Don't preserve old sharedWith - trust the API
          // If file is not in sharedByMe anymore, it has no active shares
          // This ensures paperclip disappears after unsharing
          return {
            ...file,
            isFavorite,
            sharedWith: sharedWith.length > 0 ? sharedWith : undefined
          };
        });

        // FIX: Count ALL files toward storage (owned + received shares)
        // This gives users a complete view of all storage they're using
        let totalStorage = 0;
        const storageBreakdown: { own: number; shared: number; folders: number } = {
          own: 0,
          shared: 0,
          folders: 0
        };
        
        finalFiles.forEach(file => {
          if (file.type === 'folder') {
            storageBreakdown.folders++;
            return;
          }
          
          // Count ALL files (owned + received shares)
          totalStorage += file.size;
          
          if (file.isReceivedShare) {
            storageBreakdown.shared += file.size;
          } else {
            storageBreakdown.own += file.size;
          }
        });
        
        setStorageUsed(totalStorage);

        // FIX: Calculate shared files count from the data we already have
        setSharedFilesCount(uniqueSharedFiles.length);


        return finalFiles;
      } catch (e) {
        const finalFiles = combinedFiles.map(file => {
          if (file.isReceivedShare) return file;
          const sharedWith = recipientsByFileId.get(file.id) || [];
          return {
            ...file,
            sharedWith: sharedWith.length > 0 ? sharedWith : undefined
          };
        });
        
        // FIX: Also calculate storage in catch block
        let totalStorage = 0;
        finalFiles.forEach(file => {
          if (file.type === 'folder') return;
          totalStorage += file.size || 0;
        });
        setStorageUsed(totalStorage);
        
        return finalFiles;
      }
    });    } finally {
      isSyncing.current = false;
    }
  }, [userEmail, shouldShowSharedItem, isSenderFolderInTrash]); // FIX: Removed deletedFiles to break infinite loop

  // PERFORMANCE: Debounced sync wrapper - prevents rapid consecutive syncs
  const debouncedSyncSharedFiles = useCallback(() => {
    if (syncDebounceTimer.current) {
      clearTimeout(syncDebounceTimer.current);
    }
    syncDebounceTimer.current = setTimeout(() => {
      syncSharedFiles();
    }, 300); // Wait 300ms before syncing to batch rapid calls
  }, [syncSharedFiles]);

  // FIX: Keep deletedFilesRef in sync with deletedFiles state
  useEffect(() => {
    deletedFilesRef.current = deletedFiles;
  }, [deletedFiles]);

  // FINISHED THIS PART ABOVE

 // 1) Initial load (own files + shared files)
  useEffect(() => {
    if (!userEmail) return;

    const loadInitialData = async () => {
      
      // Normalize user email for case-insensitive comparisons (used throughout)
      const normalizedUserEmail = userEmail.toLowerCase();
      
      // Fetch from API instead of localStorage.getItem()
      const filesResponse = await apiCall('/api/files');
      const trashResponse = await apiCall('/api/trash');
      
      // Get storage (we'll recalculate it, but fetch for logging)
      let savedStorageNum = 0;

      let loadedFiles: FileItem[] = [];
      if (filesResponse?.files) {
        const parsed = filesResponse.files;
        loadedFiles = parsed.map((f: any) => ({ 
          ...f, 
          createdAt: new Date(f.createdAt),
          size: typeof f.size === 'string' ? parseInt(f.size, 10) : f.size
        }));
        
        // SANITY: Prevent data leakage between accounts on the same browser.
        // Only keep entries that are either owned by this user OR are received shares.
        // Use case-insensitive email comparison for owner check
        try {
          const beforeCount = loadedFiles.length;
          loadedFiles = loadedFiles.filter((f: any) => {
            // Keep if explicitly owned by this user (case-insensitive)
            if (f.owner && f.owner.toLowerCase() === normalizedUserEmail) return true;
            // Keep if marked as a received shared item
            if (f.isReceivedShare) return true;
            // Otherwise drop it as potential contamination
            return false;
          });
          if (loadedFiles.length !== beforeCount) {
          }
          // Deduplicate by id to avoid duplicate entries making it through (safety)
          try {
            const map = new Map<string, any>();
            for (const f of loadedFiles) map.set(f.id, f);
            const deduped = Array.from(map.values());
            if (deduped.length !== loadedFiles.length) {
              loadedFiles = deduped;
              // Note: No localStorage.setItem here - API is source of truth
            }
          } catch (e) {
          }
        } catch (e) {
        }
      }

      setFiles(loadedFiles);

      if (trashResponse?.data) {
        const parsed = trashResponse.data;
        let deletedItems = parsed.map((f: any) => ({ ...f, createdAt: new Date(f.createdAt) }));
        // Ensure trash items either belong to this user or are proper tombstones (originalSharedId)
        // Use case-insensitive email comparison for owner check
        try {
          const beforeTrash = deletedItems.length;
          deletedItems = deletedItems.filter((d: any) => {
            if (d.owner && d.owner.toLowerCase() === normalizedUserEmail) return true;
            if (d.originalSharedId) return true; // tombstone for received share
            return false;
          });
          if (deletedItems.length !== beforeTrash) {
          }
          // Deduplicate trash by id to avoid duplicate tombstones
          try {
            const tmap = new Map<string, any>();
            for (const t of deletedItems) tmap.set(t.id, t);
            const td = Array.from(tmap.values());
            if (td.length !== deletedItems.length) {
              deletedItems = td;
              // Note: No localStorage.setItem here - API is source of truth
            }
          } catch (e) {
          }
        } catch (e) {
        }
        setDeletedFiles(deletedItems);
      }
      
      // FIX 3: Recalculate storage from loaded files (don't trust saved value)
      // Count ALL files (owned + received shares) for complete storage view
      let calculatedStorage = 0;
      loadedFiles.forEach(file => {
        if (file.type === 'folder') return;
        
        // Count ALL files (owned + received shares)
        calculatedStorage += file.size;
      });
      
      if (calculatedStorage !== savedStorageNum) {
      }
      setStorageUsed(calculatedStorage);

      hasLoaded.current = true;
      syncSharedFiles();
    };

    loadInitialData();
  }, [userEmail, syncSharedFiles]);

  // 2) Listen for the custom same-tab event
  useEffect(() => {
    const handler = () => {
      debouncedSyncSharedFiles();
    };
    window.addEventListener(SHARED_FILES_EVENT, handler);
    return () => window.removeEventListener(SHARED_FILES_EVENT, handler);
  }, [debouncedSyncSharedFiles]);

  // 3) Listen for the native cross-tab `storage` event
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'shared_files_global' || e.key === SHARED_FILES_SYNC_TRIGGER) {
        debouncedSyncSharedFiles();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [debouncedSyncSharedFiles]);

  // 4) Polling for real-time shared file updates (every 30 seconds, only when tab is visible)
  useEffect(() => {
    if (!userEmail) return;
    
    let pollInterval: NodeJS.Timeout | null = null;
    
    const startPolling = () => {
      if (pollInterval) return; // Already polling
      pollInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          syncSharedFiles();
        }
      }, 10000); // Poll every 10 seconds for faster sync
    };
    
    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Sync immediately when tab becomes visible, then start polling
        syncSharedFiles();
        startPolling();
      } else {
        stopPolling();
      }
    };
    
    // Start polling if tab is already visible
    if (document.visibilityState === 'visible') {
      startPolling();
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userEmail, syncSharedFiles]);

  // ─── persist own files (GUARDED) ────────────────────────────────────
  // NOTE: These persistence hooks are REMOVED because API is now the source of truth
  // Individual handler functions (handleCreateFolder, handleFilesSelected, etc.) 
  // will call the API directly to persist changes

  // FIX: Periodic storage recalculation to catch and fix any inconsistencies
  // Storage = files I OWN + files shared WITH me (received shares)
  useEffect(() => {
    if (!hasLoaded.current || !userEmail) return;
    
    const recalculateStorage = () => {
      let correctTotal = 0;
      
      files.forEach(file => {
        if (file.type === 'folder') return;
        // Count ALL non-folder files (owned + received shares)
        correctTotal += file.size || 0;
      });
      
      // Only update if there's an actual difference to avoid infinite loops
      if (Math.abs(correctTotal - storageUsed) > 1) {
        setStorageUsed(correctTotal);
      }
    };
    
    // Run after a delay to let other effects settle
    const timeoutId = setTimeout(recalculateStorage, 500);
    return () => clearTimeout(timeoutId);
  }, [files, userEmail, storageUsed]);

  // ─── helpers ────────────────────────────────────────────────────────
  const ensureUser = (opName?: string) => {
    if (!userEmail) {
      return false;
    }
    return true;
  };

  const makeUniqueName = (
    baseName: string,
    parentId: string | null,
    isFolder: boolean,
    checkInTrash: boolean = false,
    excludeShared: boolean = true
  ) => {
    const rawSiblings = checkInTrash ? deletedFiles : files;
    const siblings = excludeShared ? rawSiblings.filter((f) => !f.isSharedFile) : rawSiblings;

    const exists = (name: string) =>
      siblings.some(
        (f) =>
          f.parentFolderId === parentId &&
          f.name === name &&
          f.type === (isFolder ? 'folder' : 'file')
      );

    if (!exists(baseName)) return baseName;

    let nameWithoutExt = baseName;
    let extension = '';

    if (!isFolder) {
      const lastDotIndex = baseName.lastIndexOf('.');
      if (lastDotIndex > 0) {
        nameWithoutExt = baseName.substring(0, lastDotIndex);
        extension = baseName.substring(lastDotIndex);
      }
    }

    let counter = 1;
    let candidateName = `${nameWithoutExt} (${counter})${extension}`;
    while (exists(candidateName)) {
      counter++;
      candidateName = `${nameWithoutExt} (${counter})${extension}`;
    }

    return candidateName;
  };

// ─── upload ─────────────────────────────────────────────────────────
  const handleFilesSelected = async (
    fileList: FileList | File[],
    parentId: string | null = currentFolderId
  ) => {
    if (!userEmail) {
      // error silenced for production
      return;
    }
    
    // DEBUG: Log upload context for debugging ownership issues
    
    // FIX: Check if uploading to a shared folder and prepare auto-share
    let targetParentId = parentId;
    let shareOwner: string | null = null;
    let shareOwnerName: string | null = null;
    let shareRecipients: string[] = [];
    let sharedParentFolderId: string | null = null;
    let isUploadingToOthersFolder = false;
    
    // SAFETY CHECK: Verify targetParentId belongs to user OR is a shared folder they have access to
    if (targetParentId) {
      const parentFolder = files.find(f => f.id === targetParentId);
      
      if (!parentFolder) {
        targetParentId = null;
      } else {
      }
    }
    
    // Check if we're uploading to a shared folder
    if (targetParentId) {
      const parentFolder = files.find(f => f.id === targetParentId);
      
      // IMPROVED: Check if this is a RECEIVED shared folder (owned by someone else)
      // Use multiple checks for robustness: isSharedFile, isReceivedShare, or owner mismatch
      const isReceivedFolder = parentFolder && (
        (parentFolder as any).isReceivedShare ||
        (parentFolder.isSharedFile && parentFolder.owner && !emailsMatch(parentFolder.owner, userEmail)) ||
        (parentFolder.owner && !emailsMatch(parentFolder.owner, userEmail))
      );
      
      if (isReceivedFolder && parentFolder.owner) {
        // FIX: Uploading to someone else's shared folder
        // File stays owned by uploader, but share WITH folder owner so they can see it
        isUploadingToOthersFolder = true;
        sharedParentFolderId = targetParentId;
        shareRecipients = [parentFolder.owner]; // Share with folder owner
        shareOwner = userEmail;
        shareOwnerName = userName || userEmail;
      }
      
      // Check if we're uploading to OUR OWN shared folder
      if (parentFolder && emailsMatch(parentFolder.owner, userEmail)) {
        try {
          const recipientsResponse = await apiCall('/api/shares/recipients', {
            method: 'POST',
            body: JSON.stringify({ fileId: targetParentId })
          });
          shareRecipients = recipientsResponse.recipients || [];
          if (shareRecipients.length > 0) {
            shareOwner = userEmail;
            shareOwnerName = userName || userEmail;
            sharedParentFolderId = targetParentId;
          }
        } catch (e) {
          // error silenced for production
          shareRecipients = [];
        }
      }
    }
    
    const filesArray = Array.from(fileList);
    const newProgress: UploadProgress[] = [];
    const folderMap = new Map<string, string>();
    const newFiles: FileItem[] = [];

    for (const file of filesArray) {
      const webkitPath = (file as any).webkitRelativePath || '';
      const parts = webkitPath ? webkitPath.split('/') : [file.name];
      let currentParent = targetParentId;

      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        const pathKey = parts.slice(0, i + 1).join('/');

        if (!folderMap.has(pathKey)) {
          const uniqueFolderName = makeUniqueName(folderName, currentParent, true, false);
          const folderId = Math.random().toString(36).substring(2, 11);
          folderMap.set(pathKey, folderId);

          newFiles.push({
            id: folderId,
            name: uniqueFolderName,
            size: 0,
            type: 'folder',
            createdAt: new Date(),
            parentFolderId: currentParent,
            // FIX: Owner is ALWAYS the uploader (matches API behavior)
            owner: userEmail,
            // FIX: ownerName stores uploader's email for display when inside others' folders
            ownerName: isUploadingToOthersFolder ? userEmail : undefined,
            // FIX: Mark as "inside shared folder" but NOT as received share (uploader owns it)
            isSharedFile: isUploadingToOthersFolder ? true : undefined,
            insideSharedFolder: isUploadingToOthersFolder ? true : undefined, // NEW: Track that it's inside a shared folder
            // FIX: If uploading to shared folder, show paper clip immediately
            sharedWith: shareRecipients.length > 0 ? shareRecipients : undefined,
          });

          currentParent = folderId;
        } else {
          currentParent = folderMap.get(pathKey)!;
        }
      }

      const fileName = parts[parts.length - 1];
      const uniqueFileName = makeUniqueName(fileName, currentParent, false, false);
      const fileId = Math.random().toString(36).substring(2, 11);
      const fileItem: FileItem = {
        id: fileId,
        name: uniqueFileName,
        size: file.size,
        type: 'file',
        createdAt: new Date(),
        parentFolderId: currentParent,
        // FIX: Owner is ALWAYS the uploader (matches API behavior)
        owner: userEmail,
        // FIX: ownerName stores uploader's email for display when inside others' folders
        ownerName: isUploadingToOthersFolder ? userEmail : undefined,
        // FIX: Mark as "inside shared folder" but NOT as received share (uploader owns it)
        isSharedFile: isUploadingToOthersFolder ? true : undefined,
        insideSharedFolder: isUploadingToOthersFolder ? true : undefined, // NEW: Track that it's inside a shared folder
        // FIX: If uploading to shared folder, show paper clip immediately
        sharedWith: shareRecipients.length > 0 ? shareRecipients : undefined,
      };

      newFiles.push(fileItem);
      newProgress.push({ fileId: fileItem.id, fileName: uniqueFileName, progress: 0 });
    }

    setFiles((prev) => {
      // Dedup: if any newFile ID already exists in prev (shouldn't happen, but guard it)
      const existingIds = new Set(prev.map(f => f.id));
      const toAdd = newFiles.filter(f => !existingIds.has(f.id));
      if (toAdd.length < newFiles.length) {
      }
      return [...prev, ...toAdd];
    });
    
    // FIX: Only add to storage if uploading to OWN folder
    // When uploading to someone else's shared folder, files belong to them (not us)
    if (!isUploadingToOthersFolder) {
      setStorageUsed((prev) => prev + filesArray.reduce((acc, f) => acc + f.size, 0));
    } else {
    }
    
    setUploadProgress(newProgress);

    // NEW: Upload folders to API first (before files, so parentFolderId references exist)
    const foldersToUpload = newFiles.filter(f => f.type === 'folder');
    for (const folder of foldersToUpload) {
      try {
        const uploadResponse = await apiCall('/api/files/upload', {
          method: 'POST',
          body: JSON.stringify({
            encryptedData: [],
            iv: [],
            wrappedKey: [],
            fileName: folder.name,
            mimeType: null,
            size: 0,
            parentFolderId: folder.parentFolderId,
            isFolder: true
          })
        });

        if (uploadResponse.file) {
          const serverFolder = uploadResponse.file;
          const oldId = folder.id;

          // Update local state with server ID
          if (oldId !== serverFolder.id) {
            // Update the folder reference
            folder.id = serverFolder.id;
            folder.name = serverFolder.name;

            // Update any files that have this folder as parent
            newFiles.forEach(f => {
              if (f.parentFolderId === oldId) {
                f.parentFolderId = serverFolder.id;
              }
            });

            // Update files state with new folder ID
            setFiles(prev => prev.map(f => {
              if (f.id === oldId) {
                return { ...f, id: serverFolder.id, name: serverFolder.name };
              }
              if (f.parentFolderId === oldId) {
                return { ...f, parentFolderId: serverFolder.id };
              }
              return f;
            }));

          }
        }
      } catch (e) {
      }
    }

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      const fileName = (file as any).webkitRelativePath
        ? (file as any).webkitRelativePath.split('/').pop() || file.name
        : file.name;
      const fileItem = newFiles.find((f) => f.type === 'file' && f.name.startsWith(fileName.split('.')[0]));

      if (fileItem) {
        try {
          // Save original file locally for viewing
          await fileStorage.saveFile(fileItem.id, file);
          try {
            window.dispatchEvent(new CustomEvent('file-stored', { detail: { fileId: fileItem.id } }));
          } catch (e) {
          }
          
          // Persist file to API (with encryption if vault is unlocked)
          try {
            let uploadBody: {
              encryptedData: number[];
              iv: number[];
              wrappedKey: number[];
              fileName: string;
              mimeType: string;
              size: number;
              parentFolderId?: string | null;
              isFolder: boolean;
            };
            
            if (!masterKey) {
              // Vault must be unlocked to upload - this shouldn't happen with the modal
              throw new Error('Vault is locked - please unlock to upload files');
            }
            
            // Encrypt the file with E2E encryption
            const { encryptedData, fileKey, iv } = await encryptFile(file);
            const wrappedKey = await wrapFileKey(fileKey, masterKey);
            
            uploadBody = {
              encryptedData: Array.from(new Uint8Array(encryptedData)),
              iv: Array.from(iv),
              wrappedKey: Array.from(new Uint8Array(wrappedKey)),
              fileName: fileItem.name,
              mimeType: file.type,
              size: file.size,
              parentFolderId: fileItem.parentFolderId,
              isFolder: false
            };
            
            const uploadResponse = await apiCall('/api/files/upload', {
              method: 'POST',
              body: JSON.stringify(uploadBody)
            });
            
            // FIX: Update local state with the actual filename/ID from API
            // The API may have auto-renamed the file if a duplicate existed
            if (uploadResponse.file) {
              const serverFile = uploadResponse.file;
              const oldId = fileItem.id;
              const oldName = fileItem.name;
              
              // CRITICAL: Also update fileStorage with the new server ID
              // The file is stored under oldId, we need it under the new server ID
              if (oldId !== serverFile.id) {
                try {
                  // Copy the file data from old ID to new ID in fileStorage
                  const existingFile = await fileStorage.getFileURL(oldId);
                  if (existingFile) {
                    // Re-save under the new ID
                    await fileStorage.saveFile(serverFile.id, file);
                    // Optionally delete the old entry (but keep it for safety)
                  }
                } catch (storageError) {
                }
              }
              
              // Update file ID and name in local state to match server
              setFiles((prev) => prev.map((f) => {
                if (f.id === oldId) {
                  const updated = {
                    ...f,
                    id: serverFile.id,
                    name: serverFile.name,
                  };
                  if (oldName !== serverFile.name) {
                  }
                  return updated;
                }
                return f;
              }));
              
              // Also update the fileItem reference for auto-sharing later
              fileItem.id = serverFile.id;
              fileItem.name = serverFile.name;
            }
            
          } catch (apiError) {
            // error silenced for production
            // Remove the failed file from local state
            setFiles((prev) => prev.filter((f) => f.id !== fileItem.id));
            setStorageUsed((prev) => Math.max(0, prev - file.size));
          }
        } catch (error) {
          // error silenced for production
        }
      } else {
      }

      for (let p = 0; p <= 100; p += 10) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        setUploadProgress((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, progress: p } : item))
        );
      }
    }

    // FIX: Auto-share uploaded files if parent is shared
    if (shareRecipients.length > 0 && shareOwner && shareOwnerName) {

      // DEBUG: check if any recipient has the target folder in their trash
      for (const email of shareRecipients) {
        try {
          const rtResponse = await apiCall(`/api/shares/trashed?recipientEmail=${encodeURIComponent(email)}`);
          const rtList: string[] = (rtResponse?.data || []).map((t: any) => t.fileId);
        } catch (e) {
        }
      }
      
      for (const newFile of newFiles) {
        for (const recipient of shareRecipients) {
          try {
            let fileData: Blob | undefined = undefined;
            
            // Get actual file data for files (not folders)
            if (newFile.type === 'file') {
              const rawFile = filesArray.find(f => {
                const fName = (f as any).webkitRelativePath
                  ? (f as any).webkitRelativePath.split('/').pop() || f.name
                  : f.name;
                return newFile.name.startsWith(fName.split('.')[0]);
              });
              if (rawFile) {
                fileData = rawFile;
              }
            }
            
            // CRITICAL FIX: Use sharedParentFolderId instead of newFile.parentFolderId
            const parentIdForShare = sharedParentFolderId;
            
            
            // Share via API
            await apiCall('/api/shares', {
              method: 'POST',
              body: JSON.stringify({
                fileId: newFile.id,
                fileName: newFile.name,
                fileSize: newFile.size,
                fileType: newFile.type,
                recipientEmail: recipient,
                parentFolderId: parentIdForShare,
                fileData: fileData ? await fileData.text() : undefined // Convert Blob if needed
              })
            });
            
          } catch (error) {
          }
        }
      }
      
      // Trigger sync
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
      // Note: sharedFilesManager.triggerSync() removed - using API now
    }

    setTimeout(() => setUploadProgress([]), 500);
  };

  // ─── folder ─────────────────────────────────────────────────────────
  const handleCreateFolder = async (folderName: string) => {
    if (!ensureUser('handleCreateFolder')) return;
    const uniqueName = makeUniqueName(folderName, currentFolderId, true, false);
    const tempId = Math.random().toString(36).substring(2, 11);
    const newFolder: FileItem = {
      id: tempId,
      name: uniqueName,
      size: 0,
      type: 'folder',
      createdAt: new Date(),
      parentFolderId: currentFolderId,
      owner: userEmail,
    };
    setFiles((prev) => {
      if (prev.some(f => f.id === newFolder.id)) return prev; // already there
      return [...prev, newFolder];
    });

    // NEW: Persist folder to API and update with server-generated ID
    let serverId: string | null = null;
    try {
      const response = await apiCall('/api/files/upload', {
        method: 'POST',
        body: JSON.stringify({
          encryptedData: [],
          iv: [],
          wrappedKey: [],
          fileName: newFolder.name,
          mimeType: null,
          size: 0,
          parentFolderId: newFolder.parentFolderId,
          isFolder: true
        })
      });
      
      // FIX: Update the folder ID with server-generated one
      if (response.file?.id) {
        serverId = response.file.id;
        newFolder.id = serverId ?? newFolder.id; // Keep temp ID if serverId is somehow null
        setFiles((prev) => prev.map(f => f.id === tempId ? { ...f, id: serverId ?? tempId } : f));
      } else {
      }
    } catch (apiError) {
      // error silenced for production
      return; // Don't proceed with sharing if folder creation failed
    }

    // FIX: Auto-share the new folder if parent is shared
    // When inside someone else's shared folder: share WITH the folder owner
    // When inside our own shared folder: share with existing recipients
    let shareRecipients: string[] = [];
    let shareOwner: string | undefined;
    let shareOwnerName: string | undefined;
    let sharedParentFolderId: string | null = null;

    if (currentFolderId) {
      const parentFolder = files.find(f => f.id === currentFolderId && f.type === 'folder');
      
      if (parentFolder) {
        // IMPROVED: Check if this is a RECEIVED shared folder (owned by someone else)
        // Use multiple checks for robustness
        const isReceivedFolder = (
          (parentFolder as any).isReceivedShare ||
          (parentFolder.isSharedFile && parentFolder.owner && parentFolder.owner.toLowerCase() !== userEmail?.toLowerCase()) ||
          (parentFolder.owner && parentFolder.owner.toLowerCase() !== userEmail?.toLowerCase())
        );
        
        if (isReceivedFolder && parentFolder.owner) {
          // Share the new folder WITH the folder owner so they can see it
          shareRecipients = [parentFolder.owner];
          shareOwner = userEmail;
          shareOwnerName = userName;
          sharedParentFolderId = currentFolderId;
          
        } else {
          // Check if parent is owned by us and shared with others
          try {
            const recipientsResponse = await apiCall('/api/shares/recipients', {
              method: 'POST',
              body: JSON.stringify({ fileId: currentFolderId })
            });
            const recipients = recipientsResponse.recipients || [];
            if (recipients.length > 0) {
              shareRecipients = recipients;
              shareOwner = userEmail;
              shareOwnerName = userName;
              sharedParentFolderId = currentFolderId;
              
            }
          } catch (e) {
            // error silenced for production
          }
        }
      }
    }

    // Auto-share the new folder if needed
    if (shareRecipients.length > 0 && shareOwner && shareOwnerName) {
      
      for (const recipient of shareRecipients) {
        try {
          await apiCall('/api/shares', {
            method: 'POST',
            body: JSON.stringify({
              fileId: newFolder.id,
              fileName: newFolder.name,
              fileSize: newFolder.size,
              fileType: newFolder.type,
              recipientEmail: recipient,
              parentFolderId: sharedParentFolderId
            })
          });
          
        } catch (error) {
        }
      }
      
      // Trigger sync
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
    }
  };

  // ─── rename ─────────────────────────────────────────────────────────
  const handleRenameFile = async (id: string, newName: string) => {
    const isInTrash = deletedFiles.some(f => f.id === id);

    const trashFile = deletedFiles.find((f) => f.id === id);
    const activeFile = files.find((f) => f.id === id);
    
    const file = trashFile || activeFile;
    if (!file) {
      // error silenced for production
      return;
    }
    if (!ensureUser('handleRenameFile')) return;

    const isReceivedShare = file.isSharedFile && !emailsMatch(file.owner, userEmail);

    // FIX: Only block renaming OWNER's files in trash - receivers CAN rename shared files in their trash
    if (isInTrash && !isReceivedShare) {
      return;
    }

    // Fetch share recipients from API (with fallback to local state)
    let shareRecipients: string[] = [];
    try {
      const recipientsResponse = await apiCall('/api/shares/recipients', {
        method: 'POST',
        body: JSON.stringify({ fileId: id })
      });
      shareRecipients = recipientsResponse.recipients || [];
    } catch (e) {
      // error silenced for production
    }
    
    // FIX: Fallback to local sharedWith if API failed
    if (shareRecipients.length === 0 && file.sharedWith && file.sharedWith.length > 0) {
      shareRecipients = file.sharedWith;
    }
    
    const isShared = shareRecipients.length > 0;
    const isOwner = emailsMatch(file.owner, userEmail);

    // CASE 1: This is a RECEIVED shared file (receiver is renaming)
    if (isReceivedShare) {
      
      try {
        await apiCall('/api/shares', {
          method: 'PATCH',
          body: JSON.stringify({ fileId: id, fileName: newName })
        });
        
        
        // Update the file in the appropriate state
        if (isInTrash) {
          setDeletedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name: newName } : f)));
        } else {
        }
        
        setTimeout(() => {
          syncSharedFiles();
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        }, 100);
      } catch (e) {
        // error silenced for production
      }
      return;
    }

    // CASE 2: This is a file OWNED BY sender (sender is renaming)

    if (isOwner) {
      const uniqueName = makeUniqueName(
        newName,
        file.parentFolderId ?? null,
        file.type === 'folder',
        false,
        true
      );

      // FIX: Track pending rename to prevent sync from overwriting optimistic update
      pendingRenamesRef.current.set(id, uniqueName);

      // Update the file in the appropriate state (trash or active files)
      if (isInTrash) {
        setDeletedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name: uniqueName } : f)));
      } else {
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name: uniqueName } : f)));
        
        // Update via API
        try {
          await apiCall(`/api/files/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: uniqueName })
          });
        } catch (apiError) {
          // error silenced for production
        }
        
        // ONLY propagate rename if file is NOT in trash
        if (isShared) {
          try {
            await apiCall('/api/shares', {
              method: 'PATCH',
              body: JSON.stringify({ fileId: id, fileName: uniqueName })
            });
            
            // FIX: Clear pending rename after API confirms (with slight delay for propagation)
            setTimeout(() => {
              pendingRenamesRef.current.delete(id);
            }, 500);
            
            // Trigger sync so receivers see the change
            setTimeout(() => {
              window.dispatchEvent(new Event(SHARED_FILES_EVENT));
            }, 100);
          } catch (e) {
            // error silenced for production
            pendingRenamesRef.current.delete(id); // Clear on error too
          }
        } else {
          // Non-shared file, clear pending rename after API
          setTimeout(() => {
            pendingRenamesRef.current.delete(id);
          }, 500);
        }
      }

      return;
    }

  };

  // ─── delete ─────────────────────────────────────────────────────────
  const handleDeleteFile = async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;
    
    
    // If this is a received shared file/folder, allow the recipient to delete it locally
    if (file.isSharedFile && file.owner && file.owner !== userEmail) {
      if (!ensureUser('handleDeleteFile')) return;

      // FIX 5: Decrease storage for received shares when deleted
      if (file.isReceivedShare && file.type !== 'folder') {
        setStorageUsed((prev) => Math.max(0, prev - file.size));
      }

      
      // Helper to get all descendants for folders
      const getAllDescendants = (folderId: string): FileItem[] => {
        const children = files.filter((f) => f.parentFolderId === folderId);
        let result = [...children];
        for (const child of children) {
          if (child.type === 'folder') {
            result = result.concat(getAllDescendants(child.id));
          }
        }
        return result;
      };
      
      // Collect all items to delete (including folder contents)
      let itemsToDelete: FileItem[] = [file];
      if (file.type === 'folder') {
        const descendants = getAllDescendants(file.id);
        itemsToDelete = itemsToDelete.concat(descendants);
      }
      
      // OPTIMISTIC UI: Build tombstones and update UI IMMEDIATELY
      const tombstones = itemsToDelete.map(item => ({
        id: item.id,
        name: item.name,
        size: item.size,
        type: item.type,
        createdAt: new Date(),
        parentFolderId: item.parentFolderId,
        originalParentId: item.parentFolderId,
        originalSharedId: item.id,
        sharedMeta: {
          ownerId: item.owner,
          ownerName: (item as any).ownerName || undefined,
          fileSize: item.size,
          fileType: item.type,
          originalCreatedAt: item.createdAt,
        } as any,
      } as any));

      // Calculate total size
      const totalSize = itemsToDelete.reduce((sum, item) => {
        return sum + (item.type === 'file' ? item.size : 0);
      }, 0);

      // OPTIMISTIC: Update UI first (instant feedback)
      setFiles((prev) => prev.filter((f) => !itemsToDelete.some(d => d.id === f.id)));
      setDeletedFiles((prev) => {
        const merged = [...prev, ...tombstones];
        const map = new Map<string, any>();
        for (const t of merged) map.set(t.id, t);
        return Array.from(map.values());
      });
      setStorageUsed((prev) => Math.max(0, prev - totalSize));

      // BACKGROUND: Run API calls without blocking UI
      (async () => {
        try {
          for (const item of itemsToDelete) {
            await apiCall('/api/shares/trashed', {
              method: 'POST',
              body: JSON.stringify({ shareId: item.id, fileId: item.id })
            });
          }
        } catch (e) {
        }
      })();

      return;
    }
    
    if (!ensureUser('handleDeleteFile')) return;

    const getAllDescendants = (folderId: string): FileItem[] => {
      const children = files.filter((f) => f.parentFolderId === folderId);
      let result = [...children];
      for (const child of children) {
        if (child.type === 'folder') {
          result = result.concat(getAllDescendants(child.id));
        }
      }
      return result;
    };

    let toDelete = [file];
    if (file.type === 'folder') {
      toDelete = toDelete.concat(getAllDescendants(file.id));
    }

    // OPTIMISTIC UI: Build deleted items and update UI IMMEDIATELY
    const deletedItems = toDelete.map((item) => {
      const parentInTrash = item.parentFolderId && toDelete.some(d => d.id === item.parentFolderId)
        ? item.parentFolderId
        : null;

      const uniqueName = makeUniqueName(
        item.name,
        parentInTrash,
        item.type === 'folder',
        true
      );

      const { originalParentId: _removed, ...cleanItem } = item;

      return {
        ...cleanItem,
        name: uniqueName,
        parentFolderId: parentInTrash,
        originalParentId: item.parentFolderId,
      };
    });

    // OPTIMISTIC: Update UI first (instant feedback)
    setDeletedFiles((prev) => [...prev, ...deletedItems]);
    setFiles((prev) => prev.filter((f) => !toDelete.some(d => d.id === f.id)));
    setSelectedFiles(new Set());

    // BACKGROUND: Run API calls without blocking UI
    (async () => {
      try {
        for (const item of toDelete) {
          // Move to trash via API FIRST (so temp-deleted validation passes)
          try {
            await apiCall('/api/trash/move', {
              method: 'POST',
              body: JSON.stringify({ fileIds: [item.id] })
            });
          } catch (apiError) {
            // error silenced for production
          }
          
          // Fetch recipients from API
          let recipients: string[] = [];
          try {
            const recipientsResponse = await apiCall('/api/shares/recipients', {
              method: 'POST',
              body: JSON.stringify({ fileId: item.id })
            });
            recipients = recipientsResponse.recipients || [];
          } catch (e) {
            // error silenced for production
          }
          
          const isShared = recipients.length > 0;
          
          if (isShared && emailsMatch(item.owner, userEmail)) {
            try {
              // Mark as temp deleted via API (after file is in trash)
              await apiCall('/api/shares/temp-deleted', {
                method: 'POST',
                body: JSON.stringify({
                  fileIds: [item.id],
                  recipientEmails: recipients,
                  isTrashed: true
                })
              });
            } catch (e) {
            }
          }
        }

        // Trigger sync for receivers
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
      } catch (e) {
      }
    })();
  };

// ─── restore ────────────────────────────────────────────────────────
  const handleRestoreFile = async (id: string) => {
    const file = deletedFiles.find((f) => f.id === id);
    if (!file) return;
    if (!ensureUser('handleRestoreFile')) return;


    const getAllDescendants = (folderId: string): FileItem[] => {
      const children = deletedFiles.filter((f) => f.parentFolderId === folderId);
      let result = [...children];
      for (const child of children) {
        if (child.type === 'folder') {
          result = result.concat(getAllDescendants(child.id));
        }
      }
      return result;
    };

    let toRestore = [file];
    if (file.type === 'folder') {
      toRestore = toRestore.concat(getAllDescendants(file.id));
    }

    // SCENARIO 1: If the sender is restoring their own shared file (moving out of trash),
    // clear any temporary-hidden markers so receivers see it again (auto re-share).
    try {
      if (emailsMatch(file.owner, userEmail)) {
        // Fetch recipients from API
        let recipients: string[] = [];
        try {
          const recipientsResponse = await apiCall('/api/shares/recipients', {
            method: 'POST',
            body: JSON.stringify({ fileId: id })
          });
          recipients = recipientsResponse.recipients || [];
        } catch (e) {
          // error silenced for production
        }
        
        
        if (recipients.length > 0) {
          
          // CRITICAL FIX: Remove ALL items (parent + descendants) from temp_deleted via API
          const idsToRemove = toRestore.map(item => item.id);
          
          try {
            await apiCall('/api/shares/temp-deleted', {
              method: 'POST',
              body: JSON.stringify({
                fileIds: idsToRemove,
                recipientEmails: recipients,
                isTrashed: false
              })
            });
          } catch (e) {
          }

          // Notify other tabs/components
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        }
      }
    } catch (e) {
    }

    // If any of the toRestore items are tombstones for a previously-received
    // shared file (deleted by the recipient), we must first clean receiver_trashed_shares
    // so that recreating the share entry is not blocked by the re-share guard.
    try {
      const idsBeingRestored = toRestore.map(i => (i as any).originalSharedId || i.id);
      
      // Clean receiver_trashed_shares via API
      for (const itemId of idsBeingRestored) {
        try {
          await apiCall('/api/shares/trashed', {
            method: 'DELETE',
            body: JSON.stringify({ fileId: itemId })
          });
        } catch (e) {
          // error silenced for production
        }
      }

      // NOTE: Receiver does NOT need to recreate share entries
      // The share still exists in the database - we just removed the "trashed" marker
      // Triggering sync will re-fetch the share from the API
      for (const item of toRestore) {
        if ((item as any).sharedMeta && (item as any).sharedMeta.ownerId) {
          // Just trigger sync - the share entry still exists on the server (sender owns it)
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
          break; // Only need to trigger once
        }
      }
    } catch (e) {
    }

    // ── RECEIVER restoring a shared folder: unlock pending items ────────────
    try {
      const isReceiverRestoringShared = toRestore.some(item =>
        (item as any).sharedMeta || (item as any).originalSharedId ||
        (item.isSharedFile && item.owner && item.owner !== userEmail)
      );

      if (isReceiverRestoringShared) {
        const idsBeingRestored = toRestore.map(i => (i as any).originalSharedId || i.id);

        // Clean via API
        for (const itemId of idsBeingRestored) {
          try {
            await apiCall('/api/shares/trashed', {
              method: 'DELETE',
              body: JSON.stringify({ fileId: itemId })
            });
          } catch (e) {
            // error silenced for production
          }
        }


        // Kick sync so pending shared items flow into files
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
      }
    } catch (e) {
    }

    // NOTE: Storage update moved to single location in setFiles to avoid spike

    const restoredItems = toRestore.map((item) => {
      let targetParent = item.originalParentId || null;
      const parentInVault = toRestore.some(r => r.id === targetParent);
      const parentFolder = files.find((f) => f.id === targetParent && f.type === 'folder');
      if (!parentInVault && !parentFolder) {
        targetParent = null;
      }

      const uniqueName = makeUniqueName(
        item.name,
        targetParent,
        item.type === 'folder',
        false
      );

      const { originalParentId: _removed, ...cleanItem } = item;

      return {
        ...cleanItem,
        name: uniqueName,
        parentFolderId: targetParent,
      };
    });

    // OPTIMISTIC UI: Update state immediately
    setFiles((prev) => {
      const existingIds = new Set(prev.map(f => f.id));
      const toAdd = restoredItems.filter(f => !existingIds.has(f.id));
      
      const restoredSize = toAdd.reduce((acc, f) => {
        const isReceivedShare = (f as any).isReceivedShare || (f as any).sharedMeta || (f as any).originalSharedId;
        if (f.type === 'file' && !isReceivedShare) {
          return acc + (f.size || 0);
        }
        return acc;
      }, 0);
      
      if (restoredSize > 0) {
        setStorageUsed((prev) => prev + restoredSize);
      }
      return [...prev, ...toAdd];
    });
    setDeletedFiles((prev) => prev.filter((f) => !toRestore.some(r => r.id === f.id)));
    setSelectedFiles(new Set());

    // BACKGROUND: Run API calls without blocking UI (only for files we OWN)
    (async () => {
      try {
        // FIX: Only restore files that user OWNS (not shared tombstones)
        const ownedFilesToRestore = toRestore.filter(f => {
          const isReceiverTombstone = (f as any).sharedMeta || (f as any).originalSharedId || 
            (f.isSharedFile && f.owner && !emailsMatch(f.owner, userEmail));
          if (isReceiverTombstone) {
            return false;
          }
          return true;
        });
        
        if (ownedFilesToRestore.length > 0) {
          await apiCall('/api/trash/restore', {
            method: 'POST',
            body: JSON.stringify({ fileIds: ownedFilesToRestore.map(f => f.id) })
          });
        }
      } catch (e) {
      }
    })();
  };

  const handleRestoreFiles = (ids: string[]) => {
    ids.forEach(id => handleRestoreFile(id));
  };

  // ─── permanent delete ───────────────────────────────────────────────
  const handlePermanentDelete = async (id: string) => {
    const file = deletedFiles.find((f) => f.id === id);
    if (!file) return;
    if (!ensureUser('handlePermanentDelete')) return;


    const getAllDescendants = (folderId: string): FileItem[] => {
      const children = deletedFiles.filter((f) => f.parentFolderId === folderId);
      let result = [...children];
      for (const child of children) {
        if (child.type === 'folder') {
          result = result.concat(getAllDescendants(child.id));
        }
      }
      return result;
    };

    let toDelete = [file];
    if (file.type === 'folder') {
      toDelete = toDelete.concat(getAllDescendants(file.id));
    }

    // FIX 2: Improved check for receiver-deleted shared files
    const isReceiverDeletingSharedFile = 
      !!(file as any).sharedMeta ||
      !!(file as any).originalSharedId ||
      (file.isSharedFile && file.owner && file.owner !== userEmail);

    // FIX: Track pending permanent deletes to prevent sync from re-adding items
    const idsToDelete = toDelete.map(item => (item as any).originalSharedId || item.id);
    idsToDelete.forEach(itemId => pendingPermanentDeletesRef.current.add(itemId));

    // OPTIMISTIC UI: Update UI first (instant feedback)
    const storageToFree = toDelete.reduce((acc, item) => acc + (item.size || 0), 0);
    setDeletedFiles((prev) => prev.filter((f) => !toDelete.some(d => d.id === f.id)));
    if (!isReceiverDeletingSharedFile) {
      setStorageUsed((prev) => Math.max(0, prev - storageToFree));
    }
    setSelectedFiles(new Set());

    // BACKGROUND: Run API calls without blocking UI
    (async () => {
      try {
        // SCENARIO 1: Receiver permanently deleting a shared item
        if (isReceiverDeletingSharedFile) {
          const itemsToHide = toDelete.map(item => ({
            itemId: (item as any).originalSharedId || item.id,
            itemName: item.name
          }));
          
          for (const { itemId } of itemsToHide) {
            try {
              await apiCall('/api/shares/hidden', {
                method: 'POST',
                body: JSON.stringify({ shareId: itemId, fileId: itemId })
              });
            } catch (e) {
              // error silenced for production
            }
          }
          
          // Remove share entries
          for (const item of toDelete) {
            const shareId = (item as any).originalSharedId || item.id;
            try {
              await apiCall('/api/shares', {
                method: 'DELETE',
                body: JSON.stringify({ fileId: shareId, recipientEmail: userEmail })
              });
            } catch (e) {
              // error silenced for production
            }
          }

          // Clean receiver_trashed_shares
          for (const item of toDelete) {
            const itemId = (item as any).originalSharedId || item.id;
            try {
              await apiCall('/api/shares/trashed', {
                method: 'DELETE',
                body: JSON.stringify({ fileId: itemId })
              });
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          
          // FIX: Clear pending permanent deletes after API calls complete (with delay for propagation)
          setTimeout(() => {
            idsToDelete.forEach(itemId => pendingPermanentDeletesRef.current.delete(itemId));
          }, 1000);
          
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
          return;
        }

        // SCENARIO 2: Owner permanently deleting
        if (emailsMatch(file.owner, userEmail)) {
          let recipients: string[] = [];
          try {
            const recipientsResponse = await apiCall('/api/shares/recipients', {
              method: 'POST',
              body: JSON.stringify({ fileId: id })
            });
            recipients = recipientsResponse.recipients || [];
          } catch (e) {
            // Ignore
          }
          
          if (recipients.length > 0) {
            for (const item of toDelete) {
              try {
                await apiCall(`/api/shares/all?fileId=${item.id}&recursive=true`, { method: 'DELETE' });
              } catch (e) {
                // Ignore
              }
            }
            window.dispatchEvent(new Event(SHARED_FILES_EVENT));
          }
        }

        // Delete file data from storage
        for (const item of toDelete) {
          if (item.type === 'file') {
            try {
              await fileStorage.deleteFile(item.id);
            } catch (e) {
              // Ignore storage errors
            }
          }
        }

        // FIX: Use bulk delete API which properly handles folder hierarchies
        // The bulk API checks if ancestors are deleted, allowing children of deleted folders to be removed
        const allIdsToDelete = toDelete.map(item => item.id);
        try {
          await apiCall('/api/files/permanent-delete', {
            method: 'DELETE',
            body: JSON.stringify({ fileIds: allIdsToDelete })
          });
        } catch (e) {
          // Fallback to individual deletes
          for (const item of toDelete) {
            try {
              await apiCall(`/api/trash/${item.id}`, { method: 'DELETE' });
            } catch (e2) {
            }
          }
        }
        
        // FIX: Clear pending permanent deletes after owner delete completes
        setTimeout(() => {
          idsToDelete.forEach(itemId => pendingPermanentDeletesRef.current.delete(itemId));
        }, 1000);
      } catch (e) {
        // Clear pending on error too
        idsToDelete.forEach(itemId => pendingPermanentDeletesRef.current.delete(itemId));
      }
    })();
  };

  // TOP IS DONE???????



// ─── move ───────────────────────────────────────────────────────────
  const handleMoveToFolder = async (fileId: string, targetFolderId: string | null) => {
    if (!ensureUser('handleMoveToFolder')) return;
    
    const file = files.find(f => f.id === fileId);
    const targetFolder = targetFolderId ? files.find(f => f.id === targetFolderId) : null;
    
    if (!file) {
      return;
    }
    
    // Fetch recipients from API
    let fileRecipients: string[] = [];
    let targetRecipients: string[] = [];
    
    try {
      const fileRecipientsResponse = await apiCall('/api/shares/recipients', {
        method: 'POST',
        body: JSON.stringify({ fileId })
      });
      fileRecipients = fileRecipientsResponse.recipients || [];
    } catch (e) {
      // error silenced for production
    }
    
    if (targetFolderId) {
      try {
        const targetRecipientsResponse = await apiCall('/api/shares/recipients', {
          method: 'POST',
          body: JSON.stringify({ fileId: targetFolderId })
        });
        targetRecipients = targetRecipientsResponse.recipients || [];
      } catch (e) {
        // error silenced for production
      }
    }
    
    // GUARD: Prevent shared files from going into unshared folders
    const isFileShared = fileRecipients.length > 0;
    const targetIsShared = targetFolderId ? targetRecipients.length > 0 : false;
    const targetFolderOwner = targetFolder?.owner || userEmail;
    const targetIsReceivedShare = targetFolder?.isReceivedShare || (targetFolder?.owner && targetFolder.owner !== userEmail);
    
    if (isFileShared && targetFolderId && !targetIsShared && !targetIsReceivedShare) {
      alert(`Cannot move shared file "${file.name}" into an unshared folder. Share the folder first, or move to a different location.`);
      return;
    }
    
    // GUARD: Prevent moving folder into itself or its descendants
    if (file.type === 'folder' && targetFolderId) {
      const isDescendant = (parentId: string, childId: string): boolean => {
        if (parentId === childId) return true;
        const parent = files.find(f => f.id === parentId);
        if (!parent || !parent.parentFolderId) return false;
        return isDescendant(parent.parentFolderId, childId);
      };
      
      if (isDescendant(targetFolderId, fileId)) {
        return;
      }
    }
    
    
    if (targetFolder) {
    }
    
    // FIX: Check for duplicate names and add (1), (2), etc. suffix
    const makeUniqueNameInFolder = (name: string, parentId: string | null): string => {
      const siblingsInTarget = files.filter(f => 
        f.id !== fileId && // Exclude the file being moved
        f.parentFolderId === parentId
      );
      
      
      const baseName = name.replace(/\s*\(\d+\)(\.[^.]+)?$/, '$1'); // Remove existing (N) suffix
      const extension = baseName.includes('.') ? baseName.slice(baseName.lastIndexOf('.')) : '';
      const nameWithoutExt = extension ? baseName.slice(0, -extension.length) : baseName;
      
      let finalName = name;
      let counter = 1;
      
      while (siblingsInTarget.some(f => f.name.toLowerCase() === finalName.toLowerCase())) {
        finalName = `${nameWithoutExt} (${counter})${extension}`;
        counter++;
      }
      
      if (finalName !== name) {
      }
      
      return finalName;
    };
    
    const newName = makeUniqueNameInFolder(file.name, targetFolderId);
    
    
    // Update local files state with new name and location
    setFiles(files.map((f) => {
      if (f.id === fileId) {
        return { ...f, name: newName, parentFolderId: targetFolderId };
      }
      return f;
    }));
    
    
    // Update file in API
    try {
      await apiCall(`/api/files/${fileId}`, {
        method: 'PATCH',
        body: JSON.stringify({ 
          name: newName,
          parentFolderId: targetFolderId 
        })
      });
    } catch (apiError) {
    }
    
    // CRITICAL FIX: Handle moves into shared folders (bi-directional sharing)
    if (targetFolderId && targetFolder) {
      // Check if target folder is shared (could be received or owned)
      const folderOwner = targetFolder.owner || userEmail;
      const isReceivedFolder = targetFolder.isReceivedShare || (targetFolder.owner && targetFolder.owner !== userEmail);
      
      
      // Get all people this folder is shared with (including owner if it's a received share)
      let peopleToShareWith: string[] = [];
      
      if (isReceivedFolder && folderOwner !== userEmail) {
        // If moving into a received shared folder, share back with the owner
        peopleToShareWith.push(folderOwner);
      }
      
      // Also share with any other recipients of this folder
      peopleToShareWith = [...new Set([...peopleToShareWith, ...targetRecipients])];
      
      // Remove current user from the list
      peopleToShareWith = peopleToShareWith.filter(email => email !== userEmail);
      
      if (peopleToShareWith.length > 0) {
        
        // DEBUG: dump the receiver_trashed_shares for each target
        for (const email of peopleToShareWith) {
          try {
            const rtResponse = await apiCall(`/api/shares/trashed?recipientEmail=${encodeURIComponent(email)}`);
            const rtList: string[] = (rtResponse?.data || []).map((t: any) => t.fileId);
          } catch (e) {
          }
        }

        // Share the file with each person
        for (const recipientEmail of peopleToShareWith) {
          try {
            // Get file data if it's a file (not folder)
            let fileData: Blob | undefined = undefined;
            if (file.type === 'file') {
              try {
                fileData = (await fileStorage.getFile(file.id)) ?? undefined;
              } catch (error) {
              }
            }
            
            await apiCall('/api/shares', {
              method: 'POST',
              body: JSON.stringify({
                fileId: file.id,
                fileName: newName,  // Use the new name
                fileSize: file.size,
                fileType: file.type,
                recipientEmail: recipientEmail,
                parentFolderId: targetFolderId,  // Set parent to the shared folder
                fileData: fileData ? await fileData.text() : undefined
              })
            });
            
          } catch (error) {
          }
        }
        
        // Trigger sync after auto-sharing
      }
    }

    // If this file was already being shared, update the shared file entries too
    const sharedWith = fileRecipients;
    if (sharedWith.length > 0) {
      
      try {
        // Update share entries via API
        await apiCall('/api/shares', {
          method: 'PATCH',
          body: JSON.stringify({
            fileId: fileId,
            fileName: newName,
            parentFolderId: targetFolderId
          })
        });
      } catch (error) {
      }
    }
    
    // If this is a folder, recursively update all children
    if (file.type === 'folder') {
      const updateChildrenRecursive = async (parentId: string) => {
        const children = files.filter(f => f.parentFolderId === parentId);
        
        for (const child of children) {
          // Fetch child recipients
          let childSharedWith: string[] = [];
          try {
            const childRecipientsResponse = await apiCall('/api/shares/recipients', {
              method: 'POST',
              body: JSON.stringify({ fileId: child.id })
            });
            childSharedWith = childRecipientsResponse.recipients || [];
          } catch (e) {
            // error silenced for production
          }
          
          if (childSharedWith.length > 0) {
            try {
              await apiCall('/api/shares', {
                method: 'PATCH',
                body: JSON.stringify({
                  fileId: child.id,
                  parentFolderId: child.parentFolderId
                })
              });
            } catch (error) {
            }
          }
          
          if (child.type === 'folder') {
            await updateChildrenRecursive(child.id);
          }
        }
      };
      
      await updateChildrenRecursive(fileId);
    }
    
    // Trigger sync
    window.dispatchEvent(new Event(SHARED_FILES_EVENT));
    
  };

  // DONE

  
// ─── download ───────────────────────────────────────────────────────
  const handleDownloadFile = async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;

    if (file.type === 'folder') {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const addFolderToZip = async (folderId: string, zipFolder: ReturnType<typeof JSZip>) => {
        const children = files.filter((f) => f.parentFolderId === folderId);
        for (const child of children) {
          if (child.type === 'folder') {
            const subFolder = zipFolder.folder(child.name);
            if (subFolder) await addFolderToZip(child.id, subFolder);
          } else {
            try {
              // Download file data from API
              const response = await fetch(`/api/files/download/${child.id}`, {
                headers: {
                  'Authorization': `Bearer ${authToken}`,
                },
              });

              if (!response.ok) {
                continue;
              }

              const { encryptedData, iv, wrappedKey, sharedFileKey, mimeType } = await response.json();

              // Check if file is encrypted (has iv and wrappedKey)
              const isEncrypted = iv && iv.length > 0 && wrappedKey && wrappedKey.length > 0;
              
              let blob: Blob;
              if (isEncrypted) {
                let fileKey: CryptoKey;
                if (sharedFileKey && Array.isArray(sharedFileKey) && sharedFileKey.length > 0) {
                  fileKey = await importFileKey(new Uint8Array(sharedFileKey).buffer);
                } else {
                  if (!masterKey) {
                    // Can't decrypt without master key - skip this file
                    continue;
                  }
                  fileKey = await unwrapFileKey(
                    new Uint8Array(wrappedKey).buffer,
                    masterKey
                  );
                }
                blob = await decryptFileData(
                  new Uint8Array(encryptedData).buffer,
                  fileKey,
                  new Uint8Array(iv),
                  mimeType || 'application/octet-stream'
                );
              } else {
                // File is unencrypted - use raw data
                blob = new Blob([new Uint8Array(encryptedData)], { type: mimeType || 'application/octet-stream' });
              }

              if (blob) {
                zipFolder.file(child.name, blob);
              }
            } catch (error) {
              // Skip failed files
            }
          }
        }
      };

      await addFolderToZip(id, zip);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      try {
        // Download file data from API
        const response = await fetch(`/api/files/download/${id}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });

        if (!response.ok) {
          alert('File not found. It may not have been uploaded properly.');
          return;
        }

        const { encryptedData, iv, wrappedKey, sharedFileKey, mimeType } = await response.json();

        // Check if file is encrypted (has iv and wrappedKey)
        const isEncrypted = iv && iv.length > 0 && wrappedKey && wrappedKey.length > 0;
        
        let blob: Blob;
        if (isEncrypted) {
          let fileKey: CryptoKey;
          if (sharedFileKey && Array.isArray(sharedFileKey) && sharedFileKey.length > 0) {
            fileKey = await importFileKey(new Uint8Array(sharedFileKey).buffer);
          } else {
            if (!masterKey) {
              alert('File is encrypted. Please unlock your vault to download.');
              return;
            }
            fileKey = await unwrapFileKey(
              new Uint8Array(wrappedKey).buffer,
              masterKey
            );
          }
          blob = await decryptFileData(
            new Uint8Array(encryptedData).buffer,
            fileKey,
            new Uint8Array(iv),
            mimeType || 'application/octet-stream'
          );
        } else {
          // File is unencrypted - use raw data
          blob = new Blob([new Uint8Array(encryptedData)], { type: mimeType || 'application/octet-stream' });
        }

        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          alert('Failed to process file. Please try again.');
        }
      } catch (error) {
        alert('Failed to download file. Please try again.');
      }
    }
  };


  // below is handled in a func by fun manner
  
// ─── favorites ──────────────────────────────────────────────────────
  const handleToggleFavorite = async (id: string) => {
    if (!ensureUser('handleToggleFavorite')) return;
    
    const file = files.find((f) => f.id === id);
    if (!file) return;

    const newFavoriteState = !file.isFavorite;
    const originalFavoriteState = file.isFavorite;

    // FIX: Use functional update to avoid closure issues
    setFiles(prev => prev.map((f) => (f.id === id ? { ...f, isFavorite: newFavoriteState } : f)));

    // FIX: Use API-based favorites (per-user, works for both owned and received files)
    try {
      const response = await fetch('/api/metadata/favorites', {
        method: newFavoriteState ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ fileId: id }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // error silenced for production
        // FIX: Use functional update for revert too
        setFiles(prev => prev.map((f) => (f.id === id ? { ...f, isFavorite: originalFavoriteState } : f)));
      } else {
      }
    } catch (error) {
      // error silenced for production
      // FIX: Use functional update for revert
      setFiles(prev => prev.map((f) => (f.id === id ? { ...f, isFavorite: originalFavoriteState } : f)));
    }
  };

// ─── sharing ────────────────────────────────────────────────────────
  const handleShareFile = async (
    id: string,
    recipientEmail: string,
    senderName?: string,
    permissions: SharePermission = 'view'
  ): Promise<boolean> => {
    
    const file = files.find((f) => f.id === id);
    if (!file) {
      return false;
    }
    if (file.isSharedFile) {
      return false;
    }
    if (!ensureUser('handleShareFile')) {
      return false;
    }

    // Sanity check: warn if ID looks like temp ID
    if (id.length < 15 && !id.startsWith('c')) {
    }

    const normalizedPermission: SharePermission = permissions === 'edit' ? 'edit' : 'view';

    const getShareableFileKey = async (item: FileItem): Promise<number[] | undefined> => {
      if (item.type === 'folder') return undefined;
      if (!authToken || !masterKey) return undefined;

      try {
        const response = await fetch(`/api/files/download/${item.id}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });

        if (!response.ok) {
          return undefined;
        }

        const { wrappedKey } = await response.json();
        if (!wrappedKey || !Array.isArray(wrappedKey) || wrappedKey.length === 0) {
          return undefined;
        }

        const fileKey = await unwrapFileKey(
          new Uint8Array(wrappedKey).buffer,
          masterKey
        );
        const rawKey = await crypto.subtle.exportKey('raw', fileKey);
        return Array.from(new Uint8Array(rawKey));
      } catch {
        return undefined;
      }
    };


    // Helper function to recursively get all descendants of a folder
    const getAllDescendants = (folderId: string): FileItem[] => {
      const children = files.filter((f) => f.parentFolderId === folderId);
      let result = [...children];
      for (const child of children) {
        if (child.type === 'folder') {
          result = result.concat(getAllDescendants(child.id));
        }
      }
      return result;
    };

    // Collect all items to share
    let itemsToShare: FileItem[] = [file];
    if (file.type === 'folder') {
      const descendants = getAllDescendants(file.id);
      itemsToShare = itemsToShare.concat(descendants);
    }

    // OPTIMISTIC UI: Update sharedWith immediately for responsive feel
    const normalizedRecipient = recipientEmail.toLowerCase().trim();
    setFiles((prev) => prev.map((f) => {
      if (!itemsToShare.some(item => item.id === f.id)) return f;
      const currentSharedWith = (f as any).sharedWith || [];
      if (currentSharedWith.some((email: string) => email.toLowerCase() === normalizedRecipient)) {
        return f; // Already has this recipient
      }
      return { ...f, sharedWith: [...currentSharedWith, recipientEmail] };
    }));

    // HYBRID: Await ROOT item share, background for descendants
    // This gives accurate feedback while keeping it fast
    try {
      const rootSharedFileKey = await getShareableFileKey(file);

      // Share the ROOT item first and await it
      const rootResponse = await fetch('/api/shares', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          recipientEmail,
          permissions: normalizedPermission,
          sharedFileKey: rootSharedFileKey,
          parentFolderId: file.parentFolderId,
        }),
      });


      if (!rootResponse.ok) {
        const result = await rootResponse.json();
        
        // Revert optimistic update for ALL items
        setFiles((prev) => prev.map((f) => {
          if (!itemsToShare.some(i => i.id === f.id)) return f;
          const currentSharedWith = (f as any).sharedWith || [];
          return {
            ...f,
            sharedWith: currentSharedWith.filter((e: string) => e.toLowerCase() !== normalizedRecipient)
          };
        }));
        return false;
      }

      const rootResult = await rootResponse.json();

      if (!rootResult.success && !rootResult.message?.includes('already shared')) {
        // Root share failed - revert
        setFiles((prev) => prev.map((f) => {
          if (!itemsToShare.some(i => i.id === f.id)) return f;
          const currentSharedWith = (f as any).sharedWith || [];
          return {
            ...f,
            sharedWith: currentSharedWith.filter((e: string) => e.toLowerCase() !== normalizedRecipient)
          };
        }));
        return false;
      }


      // Share descendants in BACKGROUND (don't block)
      if (itemsToShare.length > 1) {
        const descendants = itemsToShare.slice(1); // Everything except root
        (async () => {
          
          const sharePromises = descendants.map(async (item) => {
            try {
              const sharedFileKey = await getShareableFileKey(item);
              const response = await fetch('/api/shares', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                  fileId: item.id,
                  fileName: item.name,
                  fileSize: item.size,
                  fileType: item.type,
                  recipientEmail,
                  permissions: normalizedPermission,
                  sharedFileKey,
                  parentFolderId: item.parentFolderId,
                }),
              });

              if (response.ok) {
                const result = await response.json();
                if (result.success || result.message?.includes('already shared')) {
                  return true;
                }
              }
              return false;
            } catch (error) {
              return false;
            }
          });

          const results = await Promise.all(sharePromises);
          const successCount = results.filter(r => r).length;
        })();
      }

      // Trigger cross-tab sync for RECEIVER (delay to avoid overwriting sender's optimistic update)
      setTimeout(() => {
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
      }, 500);
      return true;

    } catch (error) {
      // Revert optimistic update
      setFiles((prev) => prev.map((f) => {
        if (!itemsToShare.some(i => i.id === f.id)) return f;
        const currentSharedWith = (f as any).sharedWith || [];
        return {
          ...f,
          sharedWith: currentSharedWith.filter((e: string) => e.toLowerCase() !== normalizedRecipient)
        };
      }));
      return false;
    }
  };

  const handleUpdateSharePermission = async (
    id: string,
    recipientEmail: string,
    permissions: SharePermission
  ): Promise<boolean> => {
    if (!ensureUser('handleUpdateSharePermission')) return false;

    const file = files.find((f) => f.id === id);
    if (!file) return false;

    const normalizedRecipient = recipientEmail.toLowerCase().trim();
    if (!normalizedRecipient) return false;

    const normalizedPermission: SharePermission = permissions === 'edit' ? 'edit' : 'view';

    try {
      const response = await fetch('/api/shares', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          fileId: id,
          recipientEmail: normalizedRecipient,
          permissions: normalizedPermission,
          recursive: file.type === 'folder',
        }),
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      if (result.success) {
        debouncedSyncSharedFiles();
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  };

 const handleUnshareFile = async (id: string, recipientEmail: string): Promise<boolean> => {
    if (!ensureUser('handleUnshareFile')) return false;
    
    const file = files.find((f) => f.id === id);
    if (!file) return false;
    
    
    // FIX: Get all descendants for folders (to update their sharedWith too)
    const getAllDescendantIds = (folderId: string): string[] => {
      const children = files.filter((f) => f.parentFolderId === folderId);
      let result = children.map(c => c.id);
      for (const child of children) {
        if (child.type === 'folder') {
          result = result.concat(getAllDescendantIds(child.id));
        }
      }
      return result;
    };
    
    const idsToUpdate = file.type === 'folder' ? [id, ...getAllDescendantIds(id)] : [id];
    const idsSet = new Set(idsToUpdate);
    
    // OPTIMISTIC UI: Update sharedWith for parent AND all children
    const normalizedRecipient = recipientEmail.toLowerCase().trim();
    setFiles((prev) => prev.map((f) => {
      if (!idsSet.has(f.id)) return f;
      const currentShared = f.sharedWith || [];
      const updatedShared = currentShared.filter(
        (email) => email.toLowerCase() !== normalizedRecipient
      );
      return {
        ...f,
        sharedWith: updatedShared.length > 0 ? updatedShared : undefined
      };
    }));
    
    // BACKGROUND: Run API call
    try {
      const response = await fetch(`/api/shares?fileId=${id}&recipientEmail=${encodeURIComponent(recipientEmail)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        const result = await response.json();
        // Revert on failure - trigger sync to restore correct state
        debouncedSyncSharedFiles();
        return false;
      }

      const result = await response.json();
      
      if (result.success) {
        // FIX: Trigger full sync to ensure state is correct (paperclip removed)
        debouncedSyncSharedFiles();
        // Trigger event for receiver to see changes
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        return true;
      } else {
        return false;
      }

    } catch (error) {
      return false;
    }
  };

  // TODO START HERE.

const handleUnshareAll = async (id: string): Promise<boolean> => {
    if (!ensureUser('handleUnshareAll')) return false;
    
    const file = files.find((f) => f.id === id);
    if (!file) return false;
    
    
    try {
      const recursive = file.type === 'folder';
      const response = await fetch(`/api/shares/all?fileId=${id}&recursive=${recursive}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        const result = await response.json();
        return false;
      }

      const result = await response.json();
      
      if (result.success) {
        return true;
      } else {
        return false;
      }

    } catch (error) {
      return false;
    }
  };

  // ─── bulk operations ────────────────────────────────────────────────
const handleBulkDelete = async () => {
    if (!ensureUser('handleBulkDelete')) return;
    
    // Guard: Don't proceed with empty selection
    if (selectedFiles.size === 0) {
      return;
    }
    
    const getAllDescendants = (folderId: string, fileList: FileItem[]): FileItem[] => {
      const children = fileList.filter((f) => f.parentFolderId === folderId);
      let result = [...children];
      for (const child of children) {
        if (child.type === 'folder') {
          result = result.concat(getAllDescendants(child.id, fileList));
        }
      }
      return result;
    };

    // Collect ALL files to delete first (including descendants)
    const filesToDelete: FileItem[] = [];
    selectedFiles.forEach((id) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      
      let toDelete = [file];
      if (file.type === 'folder') {
        toDelete = toDelete.concat(getAllDescendants(file.id, files));
      }
      filesToDelete.push(...toDelete);
    });

    // Remove duplicates
    const uniqueFilesToDelete = Array.from(
      new Map(filesToDelete.map((f) => [f.id, f])).values()
    );


    // Create deleted items with unique names for local state
    const deletedItems = uniqueFilesToDelete.map((item) => {
      const parentInTrash = item.parentFolderId && uniqueFilesToDelete.some(d => d.id === item.parentFolderId)
        ? item.parentFolderId
        : null;

      const uniqueName = makeUniqueName(
        item.name,
        parentInTrash,
        item.type === 'folder',
        true
      );

      const { originalParentId: _removed, ...cleanItem } = item;

      return {
        ...cleanItem,
        name: uniqueName,
        parentFolderId: parentInTrash,
        originalParentId: item.parentFolderId,
      };
    });

    // OPTIMISTIC: Update UI first (instant feedback)
    setDeletedFiles([...deletedFiles, ...deletedItems]);
    setFiles(files.filter((f) => !uniqueFilesToDelete.some(d => d.id === f.id)));
    setSelectedFiles(new Set());

    // BACKGROUND: Run API call without blocking UI
    (async () => {
      try {
        const fileIds = uniqueFilesToDelete.map(f => f.id);
        
        const response = await fetch('/api/trash/move', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ fileIds }),
        });

        if (!response.ok) {
          const result = await response.json();
          // Note: We don't revert on failure - user can manually restore if needed
        } else {
          const result = await response.json();
        }
      } catch (error) {
      }
    })();
  };

const handleBulkRestore = async () => {
    const idsArray = Array.from(selectedFiles);
    await handleRestoreFiles(idsArray);
  };

const handleBulkPermanentDelete = async () => {
    if (!ensureUser('handleBulkPermanentDelete')) return;
    
    // Guard: Don't proceed with empty selection
    if (selectedFiles.size === 0) {
      return;
    }
    
    const filesToDelete: FileItem[] = [];

    selectedFiles.forEach((id) => {
      const file = deletedFiles.find((f) => f.id === id);
      if (!file) return;

      const getAllDescendants = (folderId: string): FileItem[] => {
        const children = deletedFiles.filter((f) => f.parentFolderId === folderId);
        let result = [...children];
        for (const child of children) {
          if (child.type === 'folder') {
            result = result.concat(getAllDescendants(child.id));
          }
        }
        return result;
      };

      let toDelete = [file];
      if (file.type === 'folder') {
        toDelete = toDelete.concat(getAllDescendants(file.id));
      }

      filesToDelete.push(...toDelete);
    });

    const uniqueFilesToDelete = Array.from(
      new Map(filesToDelete.map((f) => [f.id, f])).values()
    );


    // Check if ANY of the files are receiver-deleted shared files
    const hasReceiverDeletedSharedFiles = uniqueFilesToDelete.some(item => 
      !!(item as any).sharedMeta ||
      !!(item as any).originalSharedId ||
      (item.isSharedFile && item.owner && item.owner !== userEmail)
    );

    // FIX: Track all pending permanent deletes to prevent sync from re-adding
    const allIdsToDelete = uniqueFilesToDelete.map(item => (item as any).originalSharedId || item.id);
    allIdsToDelete.forEach(itemId => pendingPermanentDeletesRef.current.add(itemId));

    // SCENARIO 1: Receiver permanently deleting shared items
    if (hasReceiverDeletedSharedFiles) {
      
      // OPTIMISTIC: Update UI immediately
      setDeletedFiles((prev) => prev.filter((f) => !uniqueFilesToDelete.some((d) => d.id === f.id)));
      setSelectedFiles(new Set());
      
      // BACKGROUND: Run API calls without blocking UI
      (async () => {
        try {
          const sharedItems = uniqueFilesToDelete.filter(item => 
            !!(item as any).sharedMeta ||
            !!(item as any).originalSharedId ||
            (item.isSharedFile && item.owner && item.owner !== userEmail)
          );

          // Add each to hidden_shares via API (API expects individual items)
          for (const item of sharedItems) {
            const fileId = (item as any).originalSharedId || item.id;
            try {
              await apiCall('/api/shares/hidden', {
                method: 'POST',
                body: JSON.stringify({ shareId: fileId, fileId: fileId })
              });
            } catch (e) {
              // Continue even if one fails
            }
          }

          // Remove each from receiver_trashed_shares
          for (const item of sharedItems) {
            const fileId = (item as any).originalSharedId || item.id;
            try {
              await apiCall('/api/shares/trashed', {
                method: 'DELETE',
                body: JSON.stringify({ fileId })
              });
            } catch (e) {
              // Continue even if one fails
            }
          }

          // FIX: Receiver permanently deleting DOES unshare
          // This removes the Share record so the sender can re-share if they want
          for (const item of sharedItems) {
            const fileId = (item as any).originalSharedId || item.id;
            try {
              await apiCall('/api/shares', {
                method: 'DELETE',
                body: JSON.stringify({ fileId, recipientEmail: userEmail })
              });
            } catch (e) {
              // error silenced for production
            }
          }
          
          // FIX: Clear pending permanent deletes after bulk receiver delete completes
          setTimeout(() => {
            allIdsToDelete.forEach(itemId => pendingPermanentDeletesRef.current.delete(itemId));
          }, 1000);
        } catch (e) {
          // Clear pending on error too
          allIdsToDelete.forEach(itemId => pendingPermanentDeletesRef.current.delete(itemId));
        }
      })();
      
      return;
    }

    // SCENARIO 2: Sender permanently deleting - remove all shares
    try {
      for (const item of uniqueFilesToDelete) {
        if (emailsMatch(item.owner, userEmail)) {
          
          // Remove all shares for this file via API
          const response = await fetch(`/api/shares/all?fileId=${item.id}&recursive=true`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });

          if (response.ok) {
            const result = await response.json();
          } else {
          }
        }
      }
    } catch (e) {
    }

    // Delete files permanently from database
    try {
      const fileIds = uniqueFilesToDelete.map(f => f.id);
      
      const response = await fetch('/api/files/permanent-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ fileIds }),
      });

      if (!response.ok) {
        const result = await response.json();
        alert('Failed to permanently delete files. Please try again.');
        return;
      }

      const result = await response.json();

    } catch (error) {
      alert('Failed to permanently delete files. Please try again.');
      return;
    }

    // Update local state
    setDeletedFiles(deletedFiles.filter((f) => !uniqueFilesToDelete.some((d) => d.id === f.id)));
    setStorageUsed((prev) => Math.max(0, prev - uniqueFilesToDelete.reduce((acc, item) => acc + (item.size || 0), 0)));
    setSelectedFiles(new Set());
    
    // FIX: Clear pending permanent deletes after owner bulk delete completes
    setTimeout(() => {
      allIdsToDelete.forEach(itemId => pendingPermanentDeletesRef.current.delete(itemId));
    }, 1000);
  };

  // ─── sorting ────────────────────────────────────────────────────────
  const handleSortChange = (column: 'name' | 'modified') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      // FIX: Default to desc for modified (newest first) and asc for name (A-Z)
      setSortOrder(column === 'modified' ? 'desc' : 'asc');
    }
  };

// ─── filter / sort / display ────────────────────────────────────────
  const getFilteredFiles = async () => {
    let baseFiles: FileItem[] = [];

    // Fetch metadata from API once for all tabs
    let tempDeletedList: string[] = [];
    let hiddenList: string[] = [];
    let receiverTrashedList: string[] = [];

    try {
      // Fetch temp_deleted_shares
      const tempDeletedResponse = await fetch('/api/shares/temp-deleted', {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (tempDeletedResponse.ok) {
        const result = await tempDeletedResponse.json();
        tempDeletedList = result.data.map((item: any) => item.fileId);
      }

      // Fetch hidden_shares
      const hiddenResponse = await fetch('/api/shares/hidden', {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (hiddenResponse.ok) {
        const result = await hiddenResponse.json();
        hiddenList = result.data.map((item: any) => item.fileId);
      }

      // Fetch receiver_trashed_shares
      const trashedResponse = await fetch('/api/shares/trashed', {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (trashedResponse.ok) {
        const result = await trashedResponse.json();
        receiverTrashedList = result.data.map((item: any) => item.fileId);
      }
    } catch (error) {
    }

    // Check deletedFiles for tombstones - ONLY track RECEIVED shares, not sent shares
    // isSharedFile=true can mean either "I shared this" OR "I received this"
    // isReceivedShare=true specifically means "I received this from someone else"
    const deletedSharedIds = new Set<string>();
    deletedFiles.forEach(df => {
      // Only track received shares that are in trash (tombstones for shares we received)
      // NOT files we own that we've shared with others
      if ((df as any).isReceivedShare || (df as any).originalSharedId || (df as any).tombstone) {
        deletedSharedIds.add(df.id);
        const origId = (df as any).originalSharedId;
        if (origId) deletedSharedIds.add(origId);
      }
    });

    switch (currentTab) {
      case 'vault':
        // CRITICAL: If we're inside a folder that's in receiver's trash, show NOTHING
        if (currentFolderId && (receiverTrashedList.includes(currentFolderId) || deletedSharedIds.has(currentFolderId))) {
          baseFiles = [];
          break;
        }
        
        baseFiles = files.filter((f) => {
          // Must match folder level
          const matchesFolder = currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId;
          if (!matchesFolder) return false;
          
          // FIX: Show BOTH own files AND received shares in Cloud Drive
          // This allows receiver to navigate into shared folders and upload
          // (Shared Items tab still shows received shares for easy access)
          
          // CRITICAL: Filter out ANY item that receiver has in their trash
          if (receiverTrashedList.includes(f.id)) {
            return false;
          }
          
          // CRITICAL: Filter out tombstones from deletedFiles
          if (deletedSharedIds.has(f.id)) {
            return false;
          }
          
          // CRITICAL: Also check if parent folder is in receiver's trash OR is a tombstone
          if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
            return false;
          }
          
          return true;
        });
        break;

      case 'shared':
        
        // FIX: Check if we're inside a received shared folder
        // If yes, show ALL files inside it (including own uploads to shared folder)
        const currentFolderIsReceivedShare = currentFolderId && files.some(f => 
          f.id === currentFolderId && (f as any).isReceivedShare
        );
        
        baseFiles = files.filter((f) => {
          const isReceivedShare = !!(f as any).isReceivedShare;
          
          // FIX: If we're inside a received shared folder, show ALL files in it
          // This includes both received shares AND own files uploaded to shared folder
          if (currentFolderIsReceivedShare) {
            // Just check if file is in this folder
            const matchesFolder = f.parentFolderId === currentFolderId;
            if (!matchesFolder) return false;
            
            
            // Still filter out trashed items
            if (receiverTrashedList.includes(f.id) || deletedSharedIds.has(f.id)) {
              return false;
            }
            if (tempDeletedList.includes(f.id)) {
              return false;
            }
            if (hiddenList.includes(f.id)) {
              return false;
            }
            
            return true;
          }
          
          // At ROOT or inside non-received folder: ONLY show received shares
          if (!isReceivedShare) {
            return false;
          }
          
          
          // Must not be temp deleted
          if (tempDeletedList.includes(f.id)) {
            return false;
          }
          
          // Must not be permanently hidden
          if (hiddenList.includes(f.id)) {
            return false;
          }
          
          // CRITICAL: Must not be in receiver's trash OR deletedFiles
          if (receiverTrashedList.includes(f.id) || deletedSharedIds.has(f.id)) {
            return false;
          }
          
          // NEW: If file has a parent folder, check if parent is in receiver's trash
          if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
            return false;
          }
          
          // Filter by current folder with special handling for Shared Items
          if (currentFolderId) {
            const matches = f.parentFolderId === currentFolderId;
            return matches;
          } else {
            // At ROOT level of Shared Items tab
            const isAtRoot = !f.parentFolderId;
            
            // For received shares: check if parent folder is ALSO a received share
            // If parent is NOT a received share (i.e., it's the user's own folder or doesn't exist in shares),
            // then show this item at root level in Shared Items
            if (isReceivedShare && f.parentFolderId) {
              const parentIsReceivedShare = files.some(p => 
                p.id === f.parentFolderId && (p as any).isReceivedShare
              );
              if (!parentIsReceivedShare) {
                return true; // Show at root because parent is user's own folder
              }
            }
            
            return isAtRoot;
          }
        });
        
        break;

      case 'favorites':
        if (currentFolderId) {
          baseFiles = files.filter((f) => {
            // Must match folder
            if (f.parentFolderId !== currentFolderId) return false;
            
            // CRITICAL: Filter out receiver-trashed items
            if (receiverTrashedList.includes(f.id)) {
              return false;
            }
            
            // CRITICAL: Filter out tombstones from deletedFiles
            if (deletedSharedIds.has(f.id)) {
              return false;
            }
            
            // CRITICAL: Filter out if parent is in receiver's trash OR is a tombstone
            if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
              return false;
            }
            
            return true;
          });
        } else {
          baseFiles = files.filter((f) => {
            if (!f.isFavorite) return false;
            
            // CRITICAL: Filter out receiver-trashed items
            if (receiverTrashedList.includes(f.id)) {
              return false;
            }
            
            // CRITICAL: Filter out tombstones from deletedFiles
            if (deletedSharedIds.has(f.id)) {
              return false;
            }
            
            // CRITICAL: Filter out if parent is in receiver's trash OR is a tombstone
            if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
              return false;
            }
            
            if (f.parentFolderId) {
              const parent = files.find((p) => p.id === f.parentFolderId);
              if (parent && parent.isFavorite) return false;
            }
            return true;
          });
        }
        break;

      case 'recent':
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        baseFiles = files.filter((f) => {
          // Must be recent
          if (new Date(f.createdAt) < sevenDaysAgo) return false;
          
          // CRITICAL: Filter out receiver-trashed items
          if (receiverTrashedList.includes(f.id)) {
            return false;
          }
          
          // CRITICAL: Filter out tombstones from deletedFiles
          if (deletedSharedIds.has(f.id)) {
            return false;
          }
          
          // CRITICAL: Filter out if parent is in receiver's trash OR is a tombstone
          if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
            return false;
          }
          
          return true;
        });
        baseFiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;

      case 'trash':
        
        // Get shared items that are in receiver's trash (still in files array, not deletedFiles)
        const receiverTrashedSharedItems = files.filter(f => {
          if (!receiverTrashedList.includes(f.id)) return false;
          
          // FIX: Hide if sender also has it in trash (temp_deleted)
          if (tempDeletedList.includes(f.id)) {
            return false;
          }
          
          // Respect folder hierarchy
          const matchesFolder = currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId;
          if (!matchesFolder) return false;
          
          return true;
        });
        
        
        // Filter out shared items when both sender AND receiver have in trash
        const tombstones = deletedFiles.filter((f) => {
          // First, check folder hierarchy
          const matchesFolder = currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId;
          if (!matchesFolder) return false;
          
          // Check if this is a received shared file tombstone (multiple ways to detect)
          const isReceivedShareTombstone = !!(f as any).sharedMeta || 
                                            !!(f as any).originalSharedId || 
                                            !!(f as any).isSharedFile ||
                                            !!(f as any).isReceivedShare;
          
          // Get the original file ID (try multiple properties)
          const fileId = (f as any).originalSharedId || f.id;
          
          // Check if sender has it in their trash (temp_deleted)
          const senderHasInTrash = tempDeletedList.includes(fileId);
          
          // CRITICAL: Always check temp_deleted for any file in trash (shared or not)
          if (senderHasInTrash && isReceivedShareTombstone) {
            return false; // Hide when sender has it in trash
          }
          
          return true;
        });
        
        // Combine tombstones with receiver-trashed shared items
        baseFiles = [...tombstones, ...receiverTrashedSharedItems];
        break;

      default:
        baseFiles = files.filter((f) =>
          currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId
        );
    }

    // Apply filters
    if (filters.type !== 'All') {
      if (filters.type === 'Folders') {
        if (!currentFolderId) {
          baseFiles = baseFiles.filter((f) => f.type === 'folder');
        }
      } else {
        const typeMap: Record<string, string[]> = {
          Documents: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'],
          Images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'],
          Videos: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'],
          Audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'],
          Spreadsheets: ['.xls', '.xlsx', '.csv', '.ods', '.tsv'],
        };

        const extensions = typeMap[filters.type] || [];
        baseFiles = baseFiles.filter((f) => {
          if (f.type === 'folder') return false;
          return extensions.some((ext) => f.name.toLowerCase().endsWith(ext));
        });
      }
    }

    if (filters.modified !== 'Any time') {
      const now = new Date();
      const filterDate = new Date();

      switch (filters.modified) {
        case 'Today':
          filterDate.setHours(0, 0, 0, 0);
          baseFiles = baseFiles.filter((f) => new Date(f.createdAt) >= filterDate);
          break;
        case 'Last 7 days':
          filterDate.setDate(now.getDate() - 7);
          baseFiles = baseFiles.filter((f) => new Date(f.createdAt) >= filterDate);
          break;
        case 'Last 30 days':
          filterDate.setDate(now.getDate() - 30);
          baseFiles = baseFiles.filter((f) => new Date(f.createdAt) >= filterDate);
          break;
        case 'This year (2026)':
          baseFiles = baseFiles.filter((f) => new Date(f.createdAt).getFullYear() === 2026);
          break;
        case 'Last year (2025)':
          baseFiles = baseFiles.filter((f) => new Date(f.createdAt).getFullYear() === 2025);
          break;
      }
    }

    // Apply sorting
    if (sortBy && currentTab !== 'recent') {
      baseFiles = [...baseFiles].sort((a, b) => {
        let comparison = 0;

        if (sortBy === 'name') {
          comparison = a.name.localeCompare(b.name);
          } else if (sortBy === 'modified') {
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }

        return sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    // CRITICAL: Deduplicate by ID to prevent React key collisions
    const seenIds = new Set<string>();
    baseFiles = baseFiles.filter(f => {
      if (seenIds.has(f.id)) {
        return false;
      }
      seenIds.add(f.id);
      return true;
    });

    return baseFiles;
  };
// start here later
  const [displayFiles, setDisplayFiles] = useState<FileItem[]>([]);

  // Update displayFiles whenever dependencies change
  useEffect(() => {
    const loadDisplayFiles = async () => {
      const filtered = await getFilteredFiles();
      setDisplayFiles(filtered);
    };
    loadDisplayFiles();
  }, [files, deletedFiles, currentTab, currentFolderId, filters, sortBy, sortOrder]);

  // FIX: Compute shared files count from actual files array (always accurate, even after optimistic updates)
  const getSharedFilesCount = useCallback((): number => {
    // Count ALL received shares that are NOT in trash (not in deletedFiles)
    const deletedIds = new Set(deletedFiles.map(d => d.id).concat(deletedFiles.map(d => (d as any).originalSharedId).filter(Boolean)));
    
    // Get all received shared folder IDs
    const receivedSharedFolderIds = new Set(
      files.filter(f => (f as any).isReceivedShare && f.type === 'folder').map(f => f.id)
    );
    
    // Build a set of all folder IDs that are inside received shared folders (recursive)
    const allSharedFolderIds = new Set(receivedSharedFolderIds);
    let foundNew = true;
    while (foundNew) {
      foundNew = false;
      for (const f of files) {
        if (f.type === 'folder' && f.parentFolderId && allSharedFolderIds.has(f.parentFolderId) && !allSharedFolderIds.has(f.id)) {
          allSharedFolderIds.add(f.id);
          foundNew = true;
        }
      }
    }
    
    const count = files.filter(f => {
      // Must not be in deletedFiles
      if (deletedIds.has(f.id)) return false;
      
      // Count if it's a received share
      if ((f as any).isReceivedShare) return true;
      
      // NEW: Also count files the current user uploaded INSIDE a received shared folder (any level)
      // These are owned by the user but their parent is a received share or inside one
      if (f.parentFolderId && allSharedFolderIds.has(f.parentFolderId)) {
        return true;
      }
      
      return false;
    }).length;
    
    return count;
  }, [files, deletedFiles]);
  
  // FIX: Compute visible trash count (excludes shared items when sender trashed them)
  const getVisibleTrashCount = useCallback((): number => {
    // Get temp_deleted list from any shared item we can find
    // For simplicity, count all deletedFiles that are root-level and not hidden by sender
    const count = deletedFiles.filter(f => {
      // Only count root-level items (items inside folders are counted as part of parent)
      if (f.parentFolderId) return false;
      return true;
    }).length;
    
    return count;
  }, [deletedFiles]);

const handleCleanupGlitchedFiles = async () => {
    if (!ensureUser('handleCleanupGlitchedFiles')) return;
    
    try {
      // Clean orphaned items from deletedFiles (client-side only - these are tombstones)
      const cleanedTrash = deletedFiles.filter(f => {
        if (!f.parentFolderId) return true;
        
        const parentExists = deletedFiles.some(p => p.id === f.parentFolderId);
        if (!parentExists) {
          return false;
        }
        return true;
      });
      
      setDeletedFiles(cleanedTrash);
      
      // Clean orphaned items from files (client-side check, but we'll also sync with API)
      const orphanedFileIds: string[] = [];
      
      const cleanedFiles = files.filter(f => {
        if (!f.parentFolderId) return true;
        if (f.isSharedFile) return true;
        
        const parentExists = files.some(p => p.id === f.parentFolderId && p.type === 'folder');
        if (!parentExists) {
          orphanedFileIds.push(f.id);
          return false;
        }
        return true;
      });
      
      setFiles(cleanedFiles);
      
      // If we found orphaned files, delete them from the database too
      if (orphanedFileIds.length > 0) {
        
        const response = await fetch('/api/files/cleanup-orphaned', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ fileIds: orphanedFileIds }),
        });

        if (!response.ok) {
        } else {
        }
      }
      
      alert('Cleanup complete! Removed orphaned/glitched files.');
    } catch (e) {
      // error silenced for production
      alert('Failed to cleanup. Check console for errors.');
    }
  };

  return {
    files,
    deletedFiles,
    storageUsed,
    currentFolderId,
    currentTab,
    uploadProgress,
    draggedFileId,
    dragOverId,
    selectedFiles,
    filters,
    sortBy,
    sortOrder,
    displayFiles,
    setCurrentFolderId,
    setCurrentTab,
    setDraggedFileId,
    setDragOverId,
    setSelectedFiles,
    setFilters,
    handleFilesSelected,
    handleCreateFolder,
    handleRenameFile,
    handleDeleteFile,
    handleRestoreFile,
    handleRestoreFiles,
    handlePermanentDelete,
    handleMoveToFolder,
    handleDownloadFile,
    handleToggleFavorite,
    handleShareFile,
    handleUpdateSharePermission,
    handleUnshareFile,
    handleUnshareAll,
    handleBulkDelete,
    handleBulkRestore,
    handleBulkPermanentDelete,
    handleSortChange,
    getSharedFilesCount,
    getVisibleTrashCount,
    handleCleanupGlitchedFiles,
  };
}
