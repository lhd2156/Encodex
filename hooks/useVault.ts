'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fileStorage } from '@/components/pdf/fileStorage';
import { sharedFilesManager, SHARED_FILES_EVENT, SHARED_FILES_SYNC_TRIGGER, SHARED_FILES_KEY } from '@/lib/sharedFilesManager';
import { decryptFileData, unwrapFileKey } from '@/lib/crypto';

// ========== API INTEGRATION (ADDED - keeps all localStorage logic intact) ==========
const getAuthToken = () => typeof window !== 'undefined' ? sessionStorage.getItem('auth_token') : null;
const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  if (!token) throw new Error('No auth token');
  
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
      console.error('Failed to parse JSON response:', parseError, 'from endpoint:', endpoint);
      return { success: false };
    }
  } catch (error) {
    console.error('API call failed:', { endpoint, error });
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
  uploaderName?: string; // ✅ NEW: Live display name of uploader (when different from owner)
  isSharedFile?: boolean;
  isReceivedShare?: boolean;
  insideSharedFolder?: boolean; // ✅ NEW: Set when file is uploaded to someone else's shared folder
  sharedWith?: string[]; // List of emails this file is shared with
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
}

export type TabType = 'vault' | 'shared' | 'favorites' | 'recent' | 'trash';

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
  const isSyncing = useRef(false); // ✅ CRITICAL FIX: Prevent concurrent syncs
  const syncDebounceTimer = useRef<NodeJS.Timeout | null>(null); // ✅ Debounce rapid sync calls
  const deletedFilesRef = useRef<FileItem[]>([]); // ✅ FIX: Ref to avoid dependency loop
  const pendingFavoritesRef = useRef<Set<string>>(new Set()); // ✅ FIX: Track files with pending favorite toggle
  const [sharedFilesCount, setSharedFilesCount] = useState(0); // ✅ FIX: State-based count instead of async function


  const devLog = (...args: any[]) => {
    try {
      const stamp = `${new Date().toISOString()} @${(performance && performance.now ? performance.now() : Date.now()).toFixed(2)}`;
      console.debug('[DEV]', stamp, ...args);
    } catch (e) {
      console.debug('[DEV]', new Date().toISOString(), ...args);
    }
  };

// ─── HELPER: Check if a shared folder is in sender's trash ────────────────
  const isSenderFolderInTrash = useCallback(async (folderId: string, ownerEmail: string): Promise<boolean> => {
    try {
      // Call API to get sender's trash
      const response = await apiCall(`/api/trash?owner=${encodeURIComponent(ownerEmail)}`);
      
      if (!response.success || !response.data) return false;
      
      const senderTrash = response.data;
      const isInTrash = senderTrash.some((item: any) => item.id === folderId);
      
      console.log(`🗑️ [TRASH_CHECK] Folder ${folderId} in sender's (${ownerEmail}) trash: ${isInTrash}`);
      return isInTrash;
    } catch (e) {
      console.error('❌ [TRASH_CHECK] Error checking sender trash:', e);
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
    console.log(`\n🔍 [VISIBILITY] Checking "${item.fileName}" (ID: ${item.fileId})`);
    console.log(`   Type: ${item.fileType}, Parent: ${item.parentFolderId || 'ROOT'}`);
    console.log(`   tempDeleted(${tempDeletedList.length}), receiverTrashed(${receiverTrashedList.length})`);

    // ── sender trashed it ──
    if (tempDeletedList.includes(item.fileId)) {
      console.log(`   ❌ [VISIBILITY] Item itself is in temp_deleted list (sender trashed it)`);
      return false;
    }

    // ✅ FIX: DON'T block receiver-trashed items here!
    // They need to pass through so they can be sorted into sharesToAddToTrash
    // and become proper tombstones in deletedFiles for the trash view.
    // The sorting happens later in the sync after visibility checks.
    if (receiverTrashedList.includes(item.fileId)) {
      console.log(`   📦 [VISIBILITY] Item is in receiver's trash - ALLOWING through for trash processing`);
      return true; // Changed from return false - let it through!
    }

    // If item is at root level, parent checks below are N/A
    if (!item.parentFolderId) {
      console.log(`   ✅ Root-level item, visible`);
      return true;
    }

    // Check if parent folder is in sender's trash
    const parentInSenderTrash = await isSenderFolderInTrash(item.parentFolderId, ownerEmail);
    if (parentInSenderTrash) {
      console.log(`   ❌ Parent folder ${item.parentFolderId} is in sender's trash`);
      return false;
    }

    // Check if parent folder is temp deleted
    if (tempDeletedList.includes(item.parentFolderId)) {
      console.log(`   ❌ Parent folder ${item.parentFolderId} is in temp_deleted list`);
      return false;
    }

    console.log(`   ✅ Item is visible (will be sorted into trash if parent is receiver-trashed)`);
    return true;
  }, [isSenderFolderInTrash]);

  // TOP TWO DONE

  const syncSharedFiles = useCallback(async () => {
    // ✅ CRITICAL: Prevent concurrent syncs (fixes API spam)
    if (isSyncing.current) {
      console.log('🔄 [SYNC] Already syncing, skipping...');
      return;
    }
    
    // ✅ FIX: Guard against missing token (e.g., fresh registration before token is set)
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('auth_token') : null;
    if (!token || !userEmail) {
      console.log('🔄 [SYNC] No token or userEmail, skipping sync...');
      return;
    }
    
    isSyncing.current = true;
    
    try {
    console.log('🔄 [SYNC] Starting sync for:', userEmail);
    
    // ✅ STEP 1: Fetch all data from API upfront
    const sharesResponse = await apiCall('/api/shares');
    const allShares = sharesResponse.data || [];
    
    const sharedWithMe = allShares.filter((share: any) => 
      emailsMatch(share.recipientEmail, userEmail)
    );
    const sharedByMe = allShares.filter((share: any) => 
      emailsMatch(share.file.ownerEmail, userEmail)
    );
    
    console.log('📥 [SYNC] Shared with me:', sharedWithMe.length, 'files');
    console.log('📤 [SYNC] Shared by me:', sharedByMe.length, 'files');

    const hiddenResponse = await apiCall('/api/shares/hidden');
    const hiddenList: string[] = (hiddenResponse.data || []).map((h: any) => h.fileId);
    console.log('🚫 [SYNC] Hidden shares:', hiddenList);

    const tempDeletedResponse = await apiCall('/api/shares/temp-deleted');
    let tempDeletedList: string[] = (tempDeletedResponse.data || []).map((t: any) => t.fileId);
    console.log('⏳ [SYNC] Temporarily deleted shares:', tempDeletedList);

    // ✅ FIX: Validate tempDeletedList - clean up stale TempDeletedShare records
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
          const ownerTrashIds = new Set((ownerTrashResponse.data || []).map((f: any) => f.id));
          
          for (const fileId of fileIds) {
            if (!ownerTrashIds.has(fileId)) {
              console.log(`🧹 [SYNC] Stale temp_deleted: ${fileId} not in ${ownerEmail}'s trash`);
              staleFileIds.push(fileId);
            }
          }
        } catch (e) {
          console.error(`❌ [SYNC] Failed to check ${ownerEmail}'s trash:`, e);
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
          console.log(`🧹 [SYNC] Cleaned up ${staleFileIds.length} stale temp_deleted record(s)`);
          // Update the tempDeletedList to exclude cleaned up IDs
          tempDeletedList = tempDeletedList.filter(id => !staleFileIds.includes(id));
        } catch (e) {
          console.error('❌ [SYNC] Failed to clean up stale temp_deleted records:', e);
        }
      }
    }

    const receiverTrashedResponse = await apiCall('/api/shares/trashed');
    const receiverTrashedList: string[] = (receiverTrashedResponse.data || []).map((t: any) => t.fileId);
    console.log('🗑️ [SYNC] Receiver trashed shares:', receiverTrashedList);

    // ✅ STEP 2.5: Fetch user's favorites (per-user, not shared between sender/receiver)
    let userFavoritesList: string[] = [];
    try {
      const favoritesResponse = await apiCall('/api/metadata/favorites');
      userFavoritesList = favoritesResponse.data || [];
      console.log('⭐ [SYNC] User favorites:', userFavoritesList.length);
    } catch (e) {
      console.warn('⚠️ [SYNC] Failed to fetch favorites:', e);
    }

    // ✅ STEP 3: Fetch sender's trash status
    const senderTrashResponse = await apiCall('/api/trash');
    const senderTrash = senderTrashResponse.data || [];
    
    // ✅ STEP 3: Pre-fetch all recipient lists for shared files
    const recipientsByFileId = new Map<string, string[]>();
    for (const share of sharedByMe) {
      try {
        const recipientsResponse = await apiCall('/api/shares/recipients', {
          method: 'POST',
          body: JSON.stringify({ fileId: share.fileId })
        });
        recipientsByFileId.set(share.fileId, recipientsResponse.recipients || []);
      } catch (e) {
        console.error(`Failed to fetch recipients for ${share.fileId}`, e);
        recipientsByFileId.set(share.fileId, []);
      }
    }

    // ✅ STEP 4: Now do synchronous state updates with the fetched data
    
    setDeletedFiles((prev) => {
      console.log(`\n🗑️ [TRASH-SYNC] === Processing deletedFiles ===`);
      console.log(`   Current trash count: ${prev.length}`);
      console.log(`   Items sender trashed (temp_deleted): ${tempDeletedList.length}`);
      console.log(`   Items receiver trashed (receiver_trashed): ${receiverTrashedList.length}`);

      const filtered = prev.filter((deletedFile) => {
        if (!deletedFile.isSharedFile) return true;
        
        // ✅ CAREFUL: Only remove if tempDeletedList ACTUALLY contains this file
        // AND the share no longer exists in sharedWithMe (sender revoked or file gone)
        if (tempDeletedList.includes(deletedFile.id)) {
          // Double-check: is this share still valid?
          const shareStillExists = sharedWithMe.some((s: any) => s.fileId === deletedFile.id);
          if (!shareStillExists) {
            console.log(`   🚫 [TRASH-SYNC] REMOVING "${deletedFile.name}" - sender trashed it and share gone`);
            return false;
          } else {
            console.log(`   ⚠️ [TRASH-SYNC] Keeping "${deletedFile.name}" - in temp_deleted but share still exists`);
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
            console.log(`   ♻️ [TRASH-SYNC] RE-ADDING "${share.fileName}" - sender restored but receiver still trashed it`);
            
            const tombstone: FileItem & { originalSharedId?: string; sharedMeta?: any } = {
              id: share.fileId,
              name: share.fileName,
              size: share.fileSize || 0,
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
          console.log(`🔄 [TRASH-SYNC] Rename-sync: "${deletedFile.name}" → "${updatedShare.fileName}"`);
          return { ...deletedFile, name: updatedShare.fileName };
        }
        return deletedFile;
      });

      const final = [...updated, ...toRestore];
      console.log(`   Final trash count after cleanup: ${final.length} (removed: ${prev.length - filtered.length}, re-added: ${toRestore.length})`);
      return final;
    });

    sharedWithMe.forEach((share: any) => {
      const selfHeld  = receiverTrashedList.includes(share.fileId);
      const parentHeld = share.parentFolderId && receiverTrashedList.includes(share.parentFolderId);
      if (selfHeld || parentHeld) {
        console.log(`⏸️  [PENDING] "${share.fileName}" (${share.fileId}) held — parent folder is in receiver trash. Will appear on restore.`);
      }
    });

    const sharesHeld = sharedWithMe.filter((share: any) => {
      return receiverTrashedList.includes(share.fileId) || (share.parentFolderId && receiverTrashedList.includes(share.parentFolderId));
    });

    if (sharesHeld.length > 0) {
      console.log(`🗑️ [SYNC] Found ${sharesHeld.length} held shared item(s) that should appear in Trash`);
      setDeletedFiles((prev) => {
        const existingIds = new Set(prev.map(d => d.id));
        const existingOrig = new Set(prev.map(d => (d as any).originalSharedId).filter(Boolean));

        const toAdd: FileItem[] = [];
        sharesHeld.forEach((share: any) => {
          if (existingIds.has(share.fileId) || existingOrig.has(share.fileId)) {
            console.log(`   ℹ️ [SYNC] Tombstone already exists for ${share.fileId}`);
            return;
          }

          const tombstone: FileItem & { originalSharedId?: string; sharedMeta?: any } = {
            id: share.fileId,
            name: share.fileName,
            size: share.fileSize || 0,
            type: share.fileType,
            createdAt: new Date(share.file.createdAt || Date.now()),
            parentFolderId: share.parentFolderId || null,
            owner: share.file.ownerEmail,
            isSharedFile: true,
          } as any;

          tombstone.originalSharedId = share.fileId;
          tombstone.sharedMeta = { ownerId: share.file.ownerEmail, ownerName: share.file.ownerName };

          console.log(`   ➕ [SYNC] Creating tombstone for held share: ${share.fileName} (${share.fileId})`);
          toAdd.push(tombstone);
        });

        if (toAdd.length > 0) {
          return [...prev, ...toAdd];
        }
        return prev;
      });
    }

    // ✅ STEP 5: Handle trash status sync for sender's shared files
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
          console.log(`✅ [SENDER_${isInSenderTrash ? 'TRASH' : 'RESTORE'}] Updated temp_deleted for ${allRecipients.length} recipients`);
        } catch (e) {
          console.error(`❌ [SENDER_${isInSenderTrash ? 'TRASH' : 'RESTORE'}] Failed to update temp_deleted:`, e);
        }
      }
    }

    // ✅ FIX: Compute visibility results BEFORE setFiles (since setFiles callback must be synchronous)
    const visibilityResults = await Promise.all(
      sharedWithMe.map(async (share: any) => {
        const isHidden = hiddenList.includes(share.fileId);
        if (isHidden) {
          console.log(`   🚫 [SYNC] "${share.fileName}" permanently hidden, skipping`);
          return { share, visible: false };
        }
        
        const visible = await shouldShowSharedItem(share, tempDeletedList, share.file.ownerEmail, receiverTrashedList);
        return { share, visible };
      })
    );
    
    const precomputedActiveShares = visibilityResults
      .filter(result => result.visible)
      .map(result => result.share);

    // ✅ FIX: Fetch fresh owned files from API to catch files added by others (e.g., receiver uploads to shared folder)
    let freshOwnedFiles: FileItem[] = [];
    try {
      const filesResponse = await apiCall('/api/files');
      if (filesResponse.files) {
        freshOwnedFiles = filesResponse.files.map((f: any) => ({
          ...f,
          createdAt: new Date(f.createdAt),
          size: typeof f.size === 'string' ? parseInt(f.size, 10) : f.size
        }));
        console.log(`📁 [SYNC] Fetched ${freshOwnedFiles.length} fresh owned files from API`);
      }
    } catch (e) {
      console.error('❌ [SYNC] Failed to fetch fresh owned files:', e);
    }

    setFiles((prev) => {
      const seenOwn = new Set<string>();
      const normalizedUserEmail = userEmail?.toLowerCase() || '';
      // ✅ FIX: Use fresh owned files from API if available, otherwise fall back to prev
      // Files from API are ALWAYS owned files (userId matches current user)
      const sourceFiles = freshOwnedFiles.length > 0 ? freshOwnedFiles : prev;
      let ownFiles = sourceFiles.filter((f) => {
        // NEVER include received shares in own files
        // isReceivedShare = file was shared WITH us by someone else
        if ((f as any).isReceivedShare) {
          console.log(`🔧 [SYNC] Excluding "${f.name}" from ownFiles - is a received share`);
          return false;
        }
        
        // ✅ CRITICAL FIX: Only use owner check, NOT isSharedFile flag!
        // Files uploaded to shared folders have isSharedFile=true but are still OWNED by uploader
        // The isSharedFile flag indicates "inside shared folder" NOT "received from someone else"
        if (f.owner && normalizedUserEmail && f.owner.toLowerCase() !== normalizedUserEmail) {
          console.log(`🔧 [SYNC] Excluding "${f.name}" from ownFiles - owner mismatch (${f.owner} vs ${userEmail})`);
          return false;
        }
        
        // If using fresh API data, owner field might not be set - check if it's NOT a received share
        // (API returns only files where userId = current user)
        if (!f.owner && freshOwnedFiles.length > 0) {
          // This is from fresh API call, so it's definitely our file
          // Don't exclude based on isSharedFile flag
        }
        
        if (seenOwn.has(f.id)) {
          console.warn(`🔧 [SYNC] Deduping own file "${f.name}" (${f.id}) — duplicate removed`);
          return false;
        }
        seenOwn.add(f.id);
        return true;
      });
      console.log('📁 [SYNC] Own files count:', ownFiles.length, freshOwnedFiles.length > 0 ? '(from fresh API)' : '(from prev state)');
      
      sharedByMe.forEach((share: any) => {
        const ownFileIndex = ownFiles.findIndex(f => f.id === share.fileId);
        if (ownFileIndex !== -1) {
          const allRecipients = recipientsByFileId.get(share.fileId) || [];
          console.log(`🔍 [RECIPIENTS] File ${share.fileId} shared with ${allRecipients.length} user(s):`, allRecipients);
          
          const isInSenderTrash = filesInTrash.has(share.fileId);
          console.log(`🗑️ [SENDER_TRASH] File ${share.fileId} in sender's trash: ${isInSenderTrash}`);
          
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
            console.log(`🔀 [SYNC] Sender conflict with shared name: "${nameFromShare}" -> "${finalName}"`);
          }
          
          ownFiles[ownFileIndex] = {
            ...ownFiles[ownFileIndex],
            name: finalName,
            sharedWith: activeRecipients.length > 0 ? activeRecipients : undefined
          };
        }
      });

      // ✅ Use precomputed activeShares (computed before setFiles to handle async properly)
      const activeShares = precomputedActiveShares;
      
      console.log('\n📋 [SYNC] Active shares after filtering:', activeShares.length);
      activeShares.forEach((s: any, i: number) => {
        console.log(`   ${i + 1}. "${s.fileName}" (${s.fileType}) - Parent: ${s.parentFolderId || 'ROOT'}`);
      });
      
      const sharesToAddToTrash: any[] = [];
      const sharesToAddToFiles: any[] = [];
      
      activeShares.forEach((share: any) => {
        console.log(`\n🔍 [SYNC] Checking share: "${share.fileName}" (ID: ${share.fileId})`);

        console.log(`   Type: ${share.fileType}, Parent: ${share.parentFolderId || 'ROOT'}`);
        console.log(`   Owner: ${share.file.ownerEmail}`);
        
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
              console.log(`   🗑️ Parent folder ${share.parentFolderId} found in deletedFiles tombstones`);
            }
          }
        }
        
        if (isInReceiverTrash || parentInReceiverTrash) {
          console.log(`   🗑️ GOES TO TRASH: ${isInReceiverTrash ? 'Item itself' : 'Parent'} in receiver's trash`);
          sharesToAddToTrash.push(share);
        } else {
          console.log('   ✅ VISIBLE: Will be shown in files');
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
        
        console.log(`🔍 [SYNC] Processing share: "${share.fileName}"`, {
          fileId: share.fileId,
          shareParentId: share.parentFolderId,
          resolvedParentId: parentFolderId,
          isInSharedSet: share.parentFolderId ? sharedItemIds.has(share.parentFolderId) : false
        });
        
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
        
        console.log(`🔍 [SYNC] Checking conflicts for "${share.fileName}":`, {
          hasConflictWithOwnFiles: hasConflict,
          duplicateActiveShares: existingSharedConflict.length,
          shareFileId: share.fileId,
          parentFolderId: parentFolderId
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
          console.log(`🔀 [SYNC] Receiver conflict: "${share.fileName}" -> "${displayName}"`);
        }
        
        // ✅ FIX: Use API-based favorites (userFavoritesList from sync)
        const isFavorite = userFavoritesList.includes(share.fileId);
        
        return {
          id: share.fileId,
          name: displayName,
          size: share.fileSize,
          type: share.fileType,
          createdAt: share.file.createdAt,
          parentFolderId: parentFolderId,
          sharedBy: share.file.ownerEmail,
          sharedByName: share.file.ownerName, // Owner's display name (live from User table)
          owner: share.file.ownerEmail,
          // ✅ ownerName stores uploader's email (for VaultTable "who uploaded" display)
          ownerName: share.file.uploaderEmail || undefined,
          // ✅ NEW: uploaderName stores uploader's live display name
          uploaderName: share.file.uploaderName || undefined,
          isSharedFile: true,
          isReceivedShare: true as any,
          isFavorite, // ✅ Use loaded favorite state
        };
      });
      
      console.log('✅ [SYNC] Final shared file items:', sharedFileItems.length);
      
      if (sharesToAddToTrash.length > 0) {
        console.log(`🗑️ [TRASH-SYNC-2] Found ${sharesToAddToTrash.length} items to process for receiver's trash`);
        sharesToAddToTrash.forEach((s: any) => console.log(`   → "${s.fileName}" (${s.fileId}) parent=${s.parentFolderId || 'ROOT'}`));
        
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
              console.log(`   ✏️ [TRASH-SYNC-2] Updating tombstone name: "${d.name}" -> "${share.fileName}"`);
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
              size: share.fileSize || 0,
              type: share.fileType,
              createdAt: new Date(share.file.createdAt || Date.now()),
              parentFolderId: share.parentFolderId || null,
              owner: share.file.ownerEmail,
              isSharedFile: true,
            } as any;
            
            tombstone.originalSharedId = share.fileId;
            tombstone.sharedMeta = { ownerId: share.file.ownerEmail, ownerName: share.file.ownerName };
            
            console.log(`   ➕ [TRASH-SYNC-2] Creating tombstone: ${share.fileName} (${share.fileId})`);
            toAdd.push(tombstone);
          });
          
          if (toAdd.length > 0) {
            console.log(`✅ [TRASH-SYNC-2] Adding ${toAdd.length} new items to deletedFiles`);
            updated = [...updated, ...toAdd];
          }
          
          return updated;
        });
      } else {
        console.log(`✅ [TRASH-SYNC-2] sharesToAddToTrash is empty — no items with trashed parents.`);
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
          console.log(`🔧 [SYNC] Removing shared item ${sf.id} because an own file with same ID exists`);
          return false;
        }

        if (deletedIds.has(sf.id) || receiverTrashedList.includes(sf.id)) {
          console.log(`🔧 [SYNC] Skipping shared item "${sf.name}" (${sf.id}) - receiver has it in trash`, {
            inDeletedIds: deletedIds.has(sf.id),
            inReceiverTrashed: receiverTrashedList.includes(sf.id)
          });
          return false;
        }
        
        if (sf.parentFolderId && receiverTrashedList.includes(sf.parentFolderId)) {
          console.log(`🔧 [SYNC] Skipping shared item "${sf.name}" (${sf.id}) - parent folder ${sf.parentFolderId} is in receiver's trash`);
          return false;
        }

        return true;
      });

      console.log(`📊 [SYNC] After dedup: ${ownFiles.length} own + ${uniqueSharedFiles.length} shared (${sharedFileItems.length - uniqueSharedFiles.length} dupes removed)`);
      
      const combinedFiles = [...ownFiles, ...uniqueSharedFiles];

      try {
        const dedupMap = new Map<string, FileItem>();
        const dupIds: string[] = [];
        for (const f of combinedFiles) {
          if (dedupMap.has(f.id)) {
            dupIds.push(f.id);
            console.warn(`🔧 [SYNC] Skipping duplicate ID: ${f.id} (${f.name})`);
            continue;
          }
          dedupMap.set(f.id, f);
        }
        if (dupIds.length > 0) console.warn(`🔧 [SYNC] Removed ${dupIds.length} duplicate final file IDs: ${dupIds.join(', ')}`);
        const combinedDeduped = Array.from(dedupMap.values());

        const finalFiles = combinedDeduped.map(file => {
          // ✅ FIX: Apply user-specific favorites from API (not the old shared File.isFavorite)
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
          // ✅ FIX: Don't preserve old sharedWith - trust the API
          // If file is not in sharedByMe anymore, it has no active shares
          // This ensures paperclip disappears after unsharing
          return {
            ...file,
            isFavorite,
            sharedWith: sharedWith.length > 0 ? sharedWith : undefined
          };
        });

        // ✅ FIX: Only count files I OWN toward storage (not received shares)
        let totalStorage = 0;
        const storageBreakdown: { own: number; folders: number } = {
          own: 0,
          folders: 0
        };
        
        finalFiles.forEach(file => {
          if (file.type === 'folder') {
            storageBreakdown.folders++;
            return;
          }
          
          // Only count files I OWN (not received shares)
          if (emailsMatch(file.owner, userEmail) && !file.isReceivedShare) {
            totalStorage += file.size;
            storageBreakdown.own += file.size;
          }
          // Received shares don't count toward MY storage
        });
        
        console.log(`📊 [SYNC] Storage recalculated: ${totalStorage} bytes (own files only)`);
        console.log(`   Breakdown: Own=${storageBreakdown.own} bytes, Folders=${storageBreakdown.folders}`);
        setStorageUsed(totalStorage);

        // ✅ FIX: Calculate shared files count from the data we already have
        setSharedFilesCount(uniqueSharedFiles.length);

        console.log(`📊 [SYNC] Final: ${finalFiles.length} files (${ownFiles.length} own + ${uniqueSharedFiles.length} shared)`);

        return finalFiles;
      } catch (e) {
        console.error('❌ [SYNC] Deduplication of combined files failed', e);
        const finalFiles = combinedFiles.map(file => {
          if (file.isReceivedShare) return file;
          const sharedWith = recipientsByFileId.get(file.id) || [];
          return {
            ...file,
            sharedWith: sharedWith.length > 0 ? sharedWith : undefined
          };
        });
        return finalFiles;
      }
    });    } finally {
      isSyncing.current = false;
    }
  }, [userEmail, shouldShowSharedItem, isSenderFolderInTrash]); // ✅ FIX: Removed deletedFiles to break infinite loop

  // ✅ PERFORMANCE: Debounced sync wrapper - prevents rapid consecutive syncs
  const debouncedSyncSharedFiles = useCallback(() => {
    if (syncDebounceTimer.current) {
      clearTimeout(syncDebounceTimer.current);
    }
    syncDebounceTimer.current = setTimeout(() => {
      syncSharedFiles();
    }, 300); // Wait 300ms before syncing to batch rapid calls
  }, [syncSharedFiles]);

  // ✅ FIX: Keep deletedFilesRef in sync with deletedFiles state
  useEffect(() => {
    deletedFilesRef.current = deletedFiles;
  }, [deletedFiles]);

  // FINISHED THIS PART ABOVE

 // 1) Initial load (own files + shared files)
  useEffect(() => {
    if (!userEmail) return;

    const loadInitialData = async () => {
      console.log('🚀 [INIT] Loading vault for user:', userEmail);
      
      // Normalize user email for case-insensitive comparisons (used throughout)
      const normalizedUserEmail = userEmail.toLowerCase();
      
      // Fetch from API instead of localStorage.getItem()
      const filesResponse = await apiCall('/api/files');
      const trashResponse = await apiCall('/api/trash');
      
      // Get storage (we'll recalculate it, but fetch for logging)
      let savedStorageNum = 0;

      let loadedFiles: FileItem[] = [];
      if (filesResponse.files) {
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
          console.log('🔎 [INIT] API response loaded');
          const beforeCount = loadedFiles.length;
          loadedFiles = loadedFiles.filter((f: any) => {
            // Keep if explicitly owned by this user (case-insensitive)
            if (f.owner && f.owner.toLowerCase() === normalizedUserEmail) return true;
            // Keep if marked as a received shared item
            if (f.isReceivedShare) return true;
            // Otherwise drop it as potential contamination
            console.warn('⚠️ [INIT] Dropping unexpected vault entry not owned or received:', f.id || f.name);
            return false;
          });
          if (loadedFiles.length !== beforeCount) {
            console.log(`🧹 [INIT] Filtered vault entries: ${beforeCount} -> ${loadedFiles.length}`);
          }
          // Deduplicate by id to avoid duplicate entries making it through (safety)
          try {
            const map = new Map<string, any>();
            for (const f of loadedFiles) map.set(f.id, f);
            const deduped = Array.from(map.values());
            if (deduped.length !== loadedFiles.length) {
              console.log(`🧹 [INIT] Deduped vault entries: ${loadedFiles.length} -> ${deduped.length}`);
              loadedFiles = deduped;
              // Note: No localStorage.setItem here - API is source of truth
            }
          } catch (e) {
            console.warn('⚠️ [INIT] Vault dedupe failed', e);
          }
        } catch (e) {
          console.error('❌ [INIT] Failed during vault sanitization check', e);
        }
        console.log('📂 [INIT] Loaded files:', loadedFiles.length);
      }

      setFiles(loadedFiles);

      if (trashResponse.data) {
        const parsed = trashResponse.data;
        let deletedItems = parsed.map((f: any) => ({ ...f, createdAt: new Date(f.createdAt) }));
        // Ensure trash items either belong to this user or are proper tombstones (originalSharedId)
        // Use case-insensitive email comparison for owner check
        try {
          const beforeTrash = deletedItems.length;
          deletedItems = deletedItems.filter((d: any) => {
            if (d.owner && d.owner.toLowerCase() === normalizedUserEmail) return true;
            if (d.originalSharedId) return true; // tombstone for received share
            console.warn('⚠️ [INIT] Dropping unexpected trash entry not owned or tombstone:', d.id || d.name);
            return false;
          });
          if (deletedItems.length !== beforeTrash) {
            console.log(`🧹 [INIT] Filtered trash entries: ${beforeTrash} -> ${deletedItems.length}`);
          }
          // Deduplicate trash by id to avoid duplicate tombstones
          try {
            const tmap = new Map<string, any>();
            for (const t of deletedItems) tmap.set(t.id, t);
            const td = Array.from(tmap.values());
            if (td.length !== deletedItems.length) {
              console.log(`🧹 [INIT] Deduped trash entries: ${deletedItems.length} -> ${td.length}`);
              deletedItems = td;
              // Note: No localStorage.setItem here - API is source of truth
            }
          } catch (e) {
            console.warn('⚠️ [INIT] Trash dedupe failed', e);
          }
        } catch (e) {
          console.error('❌ [INIT] Failed during trash sanitization check', e);
        }
        setDeletedFiles(deletedItems);
        console.log('🗑️ [INIT] Loaded deleted files:', deletedItems.length);
      }
      
      // ✅ FIX 3: Recalculate storage from loaded files (don't trust saved value)
      // ONLY count files that I OWN (not received shares)
      let calculatedStorage = 0;
      loadedFiles.forEach(file => {
        if (file.type === 'folder') return;
        
        // Only count files I actually OWN (my files, not received shares)
        if (emailsMatch(file.owner, userEmail) && !file.isReceivedShare) {
          calculatedStorage += file.size;
        }
        // Received shares don't count toward MY storage - they're owned by someone else
      });
      
      if (calculatedStorage !== savedStorageNum) {
        console.log(`📊 [INIT] Storage mismatch: saved=${savedStorageNum}, calculated=${calculatedStorage}`);
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
      console.log('🔔 [EVENT] Received same-tab SHARED_FILES_EVENT');
      debouncedSyncSharedFiles();
    };
    window.addEventListener(SHARED_FILES_EVENT, handler);
    return () => window.removeEventListener(SHARED_FILES_EVENT, handler);
  }, [debouncedSyncSharedFiles]);

  // 3) Listen for the native cross-tab `storage` event
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'shared_files_global' || e.key === SHARED_FILES_SYNC_TRIGGER) {
        console.log('🔔 [EVENT] Received cross-tab storage event for key:', e.key);
        debouncedSyncSharedFiles();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [debouncedSyncSharedFiles]);

  // 4) ✅ Polling for real-time shared file updates (every 30 seconds, only when tab is visible)
  useEffect(() => {
    if (!userEmail) return;
    
    let pollInterval: NodeJS.Timeout | null = null;
    
    const startPolling = () => {
      if (pollInterval) return; // Already polling
      pollInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          console.log('🔄 [POLL] Checking for shared file updates...');
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

  // ✅ FIX: Periodic storage recalculation to catch and fix double-counting
  useEffect(() => {
    if (!hasLoaded.current || !userEmail) return;
    
    const recalculateStorage = () => {
      let correctTotal = 0;
      const breakdown: { own: number; skipped: number } = {
        own: 0,
        skipped: 0
      };
      
      files.forEach(file => {
        if (file.type === 'folder') return;
        
        // CRITICAL: Only count files I OWN (not received shares)
        // Received shares belong to someone else - they don't count toward MY storage
        if (emailsMatch(file.owner, userEmail) && !file.isReceivedShare) {
          correctTotal += file.size;
          breakdown.own += file.size;
        } else {
          // Not my file or it's a received share - don't count it
          breakdown.skipped++;
        }
      });
      
      if (correctTotal !== storageUsed) {
        console.log(`🔄 [CLEANUP] Fixing storage: ${storageUsed} -> ${correctTotal} bytes`);
        console.log(`   Breakdown: Own=${breakdown.own}, Skipped=${breakdown.skipped} files`);
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
      if (opName) console.error(`[useVault] ${opName} attempted with empty userEmail - aborting`);
      else console.error('[useVault] operation attempted with empty userEmail - aborting');
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
      console.error('[useVault] upload attempted with empty userEmail - aborting');
      return;
    }
    
    // ✅ DEBUG: Log upload context for debugging ownership issues
    console.log(`📤 [UPLOAD-DEBUG] Upload initiated:`, {
      userEmail,
      parentIdFromArg: parentId,
      currentFolderIdFromState: currentFolderId,
      fileCount: fileList instanceof FileList ? fileList.length : fileList.length
    });
    
    // ✅ FIX: Check if uploading to a shared folder and prepare auto-share
    let targetParentId = parentId;
    let shareOwner: string | null = null;
    let shareOwnerName: string | null = null;
    let shareRecipients: string[] = [];
    let sharedParentFolderId: string | null = null;
    let isUploadingToOthersFolder = false;
    
    // ✅ SAFETY CHECK: Verify targetParentId belongs to user OR is a shared folder they have access to
    if (targetParentId) {
      const parentFolder = files.find(f => f.id === targetParentId);
      
      if (!parentFolder) {
        console.warn(`⚠️ [UPLOAD] Parent folder ${targetParentId} not found in files state - uploading to root instead`);
        targetParentId = null;
      } else {
        console.log(`📤 [UPLOAD-DEBUG] Parent folder found:`, {
          name: parentFolder.name,
          owner: parentFolder.owner,
          isSharedFile: parentFolder.isSharedFile,
          isReceivedShare: (parentFolder as any).isReceivedShare
        });
      }
    }
    
    // Check if we're uploading to a shared folder
    if (targetParentId) {
      const parentFolder = files.find(f => f.id === targetParentId);
      
      // ✅ IMPROVED: Check if this is a RECEIVED shared folder (owned by someone else)
      // Use multiple checks for robustness: isSharedFile, isReceivedShare, or owner mismatch
      const isReceivedFolder = parentFolder && (
        (parentFolder as any).isReceivedShare ||
        (parentFolder.isSharedFile && parentFolder.owner && !emailsMatch(parentFolder.owner, userEmail)) ||
        (parentFolder.owner && !emailsMatch(parentFolder.owner, userEmail))
      );
      
      if (isReceivedFolder && parentFolder.owner) {
        // ✅ FIX: Uploading to someone else's shared folder
        // File stays owned by uploader, but share WITH folder owner so they can see it
        isUploadingToOthersFolder = true;
        sharedParentFolderId = targetParentId;
        shareRecipients = [parentFolder.owner]; // Share with folder owner
        shareOwner = userEmail;
        shareOwnerName = userName || userEmail;
        console.log(`📤 [UPLOAD] Uploading to RECEIVED shared folder "${parentFolder.name}" - will share WITH owner ${parentFolder.owner}`);
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
            console.log(`📤 [UPLOAD] Uploading to shared folder "${parentFolder.name}" - will auto-share with:`, shareRecipients);
          }
        } catch (e) {
          console.error('Failed to fetch recipients:', e);
          shareRecipients = [];
        }
      }
    }
    
    const filesArray = Array.from(fileList);
    console.debug('[useVault] handleFilesSelected start', { userEmail, parentId: targetParentId, count: filesArray.length });
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
            // ✅ FIX: Owner is ALWAYS the uploader (matches API behavior)
            owner: userEmail,
            // ✅ FIX: ownerName stores uploader's email for display when inside others' folders
            ownerName: isUploadingToOthersFolder ? userEmail : undefined,
            // ✅ FIX: Mark as "inside shared folder" but NOT as received share (uploader owns it)
            isSharedFile: isUploadingToOthersFolder ? true : undefined,
            insideSharedFolder: isUploadingToOthersFolder ? true : undefined, // ✅ NEW: Track that it's inside a shared folder
            // ✅ FIX: If uploading to shared folder, show paper clip immediately
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
        // ✅ FIX: Owner is ALWAYS the uploader (matches API behavior)
        owner: userEmail,
        // ✅ FIX: ownerName stores uploader's email for display when inside others' folders
        ownerName: isUploadingToOthersFolder ? userEmail : undefined,
        // ✅ FIX: Mark as "inside shared folder" but NOT as received share (uploader owns it)
        isSharedFile: isUploadingToOthersFolder ? true : undefined,
        insideSharedFolder: isUploadingToOthersFolder ? true : undefined, // ✅ NEW: Track that it's inside a shared folder
        // ✅ FIX: If uploading to shared folder, show paper clip immediately
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
        console.warn(`[UPLOAD] Dedup removed ${newFiles.length - toAdd.length} file(s) that already existed in state`);
      }
      return [...prev, ...toAdd];
    });
    
    // ✅ FIX: Only add to storage if uploading to OWN folder
    // When uploading to someone else's shared folder, files belong to them (not us)
    if (!isUploadingToOthersFolder) {
      setStorageUsed((prev) => prev + filesArray.reduce((acc, f) => acc + f.size, 0));
      console.log(`📊 [UPLOAD] Added ${filesArray.reduce((acc, f) => acc + f.size, 0)} bytes to storage (own folder)`);
    } else {
      console.log(`📊 [UPLOAD] NOT adding to storage - files belong to folder owner`);
    }
    
    setUploadProgress(newProgress);

    // ✅ NEW: Upload folders to API first (before files, so parentFolderId references exist)
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

            console.log(`📁 [UPLOAD] Folder uploaded with new ID: ${oldId} → ${serverFolder.id}`);
          }
        }
      } catch (e) {
        console.error(`❌ [UPLOAD] Failed to upload folder "${folder.name}" to API:`, e);
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
          await fileStorage.saveFile(fileItem.id, file);
          console.debug('[useVault] file successfully stored via fileStorage', { fileId: fileItem.id, fileName: fileItem.name });
          try {
            window.dispatchEvent(new CustomEvent('file-stored', { detail: { fileId: fileItem.id } }));
          } catch (e) {
            console.debug('[useVault] file-stored event failed', e);
          }
          
          // ✅ NEW: Persist file to API
          try {
            const uploadResponse = await apiCall('/api/files/upload', {
              method: 'POST',
              body: JSON.stringify({
                encryptedData: [], // TODO: Add encryption
                iv: [],
                wrappedKey: [],
                fileName: fileItem.name,
                mimeType: file.type,
                size: file.size,
                parentFolderId: fileItem.parentFolderId,
                isFolder: false
              })
            });
            
            // ✅ FIX: Update local state with the actual filename/ID from API
            // The API may have auto-renamed the file if a duplicate existed
            if (uploadResponse.file) {
              const serverFile = uploadResponse.file;
              const oldId = fileItem.id;
              const oldName = fileItem.name;
              
              // ✅ CRITICAL: Also update fileStorage with the new server ID
              // The file is stored under oldId, we need it under the new server ID
              if (oldId !== serverFile.id) {
                try {
                  // Copy the file data from old ID to new ID in fileStorage
                  const existingFile = await fileStorage.getFileURL(oldId);
                  if (existingFile) {
                    // Re-save under the new ID
                    await fileStorage.saveFile(serverFile.id, file);
                    // Optionally delete the old entry (but keep it for safety)
                    console.log(`📦 [STORAGE] Re-saved file under new server ID: ${oldId} → ${serverFile.id}`);
                  }
                } catch (storageError) {
                  console.warn('[STORAGE] Failed to update fileStorage with new ID:', storageError);
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
                    console.log(`📝 [UPLOAD] File renamed by server: "${oldName}" → "${serverFile.name}"`);
                  }
                  return updated;
                }
                return f;
              }));
              
              // Also update the fileItem reference for auto-sharing later
              fileItem.id = serverFile.id;
              fileItem.name = serverFile.name;
            }
            
            console.debug('[useVault] file uploaded to API', { fileId: fileItem.id, fileName: fileItem.name });
          } catch (apiError) {
            console.error('[useVault] Failed to upload file to API:', apiError);
            // ✅ Remove the failed file from local state
            setFiles((prev) => prev.filter((f) => f.id !== fileItem.id));
            setStorageUsed((prev) => Math.max(0, prev - file.size));
          }
        } catch (error) {
          console.error('[useVault] Failed to store file via fileStorage:', error, { fileId: fileItem.id });
        }
      } else {
        console.warn('[useVault] No fileItem found to store for raw file', { fileName: file.name, size: file.size });
      }

      for (let p = 0; p <= 100; p += 10) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        setUploadProgress((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, progress: p } : item))
        );
        if (p === 100) console.debug('[useVault] upload progress finished for', { fileIndex: i, fileName: file.name });
      }
    }

    // ✅ FIX: Auto-share uploaded files if parent is shared
    if (shareRecipients.length > 0 && shareOwner && shareOwnerName) {
      console.log(`📤 [UPLOAD] Auto-sharing ${newFiles.length} new items with ${shareRecipients.length} recipients`);
      console.log(`📤 [UPLOAD] Target shared folder (parentFolderId for share entries): ${sharedParentFolderId}`);

      // 🔍 DEBUG: check if any recipient has the target folder in their trash
      for (const email of shareRecipients) {
        try {
          const rtResponse = await apiCall(`/api/shares/trashed?recipientEmail=${encodeURIComponent(email)}`);
          const rtList: string[] = (rtResponse.data || []).map((t: any) => t.fileId);
          console.log(`🔍 [UPLOAD] receiver_trashed_shares for ${email}: ${JSON.stringify(rtList)}`);
          console.log(`   Target folder ${sharedParentFolderId} in their trash? ${rtList.includes(sharedParentFolderId!)}`);
        } catch (e) {
          console.error(`❌ [UPLOAD] Failed to read receiver_trashed_shares for ${email}`, e);
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
            
            // ✅ CRITICAL FIX: Use sharedParentFolderId instead of newFile.parentFolderId
            const parentIdForShare = sharedParentFolderId;
            
            console.log(`📤 [UPLOAD] Sharing "${newFile.name}" with parent: ${parentIdForShare}`);
            
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
            
            console.log(`✅ [UPLOAD] Auto-shared "${newFile.name}" with ${recipient} (parent: ${parentIdForShare})`);
          } catch (error) {
            console.error(`❌ [UPLOAD] Failed to auto-share "${newFile.name}" with ${recipient}:`, error);
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

    // ✅ NEW: Persist folder to API and update with server-generated ID
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
      
      // ✅ FIX: Update the folder ID with server-generated one
      if (response.file?.id) {
        serverId = response.file.id;
        newFolder.id = serverId ?? newFolder.id; // Keep temp ID if serverId is somehow null
        setFiles((prev) => prev.map(f => f.id === tempId ? { ...f, id: serverId ?? tempId } : f));
        console.debug('[useVault] folder created in API', { tempId, serverId });
      } else {
        console.warn('[useVault] API response missing file ID, keeping temp ID');
      }
    } catch (apiError) {
      console.error('[useVault] Failed to create folder in API:', apiError);
      return; // Don't proceed with sharing if folder creation failed
    }

    // ✅ FIX: Auto-share the new folder if parent is shared
    // When inside someone else's shared folder: share WITH the folder owner
    // When inside our own shared folder: share with existing recipients
    let shareRecipients: string[] = [];
    let shareOwner: string | undefined;
    let shareOwnerName: string | undefined;
    let sharedParentFolderId: string | null = null;

    if (currentFolderId) {
      const parentFolder = files.find(f => f.id === currentFolderId && f.type === 'folder');
      
      if (parentFolder) {
        // ✅ IMPROVED: Check if this is a RECEIVED shared folder (owned by someone else)
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
          
          console.log(`📤 [CREATE_FOLDER] Parent is received shared folder from ${parentFolder.owner} - will share new folder WITH owner`);
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
              
              console.log(`📤 [CREATE_FOLDER] Parent is our shared folder, will auto-share with ${recipients.length} recipients`);
            }
          } catch (e) {
            console.error('Failed to fetch recipients:', e);
          }
        }
      }
    }

    // Auto-share the new folder if needed
    if (shareRecipients.length > 0 && shareOwner && shareOwnerName) {
      console.log(`📤 [CREATE_FOLDER] Auto-sharing new folder "${uniqueName}" with ${shareRecipients.length} recipients`);
      
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
          
          console.log(`✅ [CREATE_FOLDER] Auto-shared "${uniqueName}" with ${recipient} (parent: ${sharedParentFolderId})`);
        } catch (error) {
          console.error(`❌ [CREATE_FOLDER] Failed to auto-share "${uniqueName}" with ${recipient}:`, error);
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
      console.error('[RENAME] File not found in files or deletedFiles:', id);
      return;
    }
    if (!ensureUser('handleRenameFile')) return;

    const isReceivedShare = file.isSharedFile && !emailsMatch(file.owner, userEmail);

    // ✅ FIX: Only block renaming OWNER's files in trash - receivers CAN rename shared files in their trash
    if (isInTrash && !isReceivedShare) {
      console.warn('⚠️ Cannot rename your own files in trash');
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
      console.error('Failed to fetch recipients:', e);
    }
    
    // ✅ FIX: Fallback to local sharedWith if API failed
    if (shareRecipients.length === 0 && file.sharedWith && file.sharedWith.length > 0) {
      console.log('[RENAME] Using local sharedWith as fallback');
      shareRecipients = file.sharedWith;
    }
    
    const isShared = shareRecipients.length > 0;
    const isOwner = emailsMatch(file.owner, userEmail);

    console.log(`[RENAME] Starting rename for file ${id}:`, {
      currentName: file.name,
      newName,
      isSharedFile: file.isSharedFile,
      owner: file.owner,
      currentUser: userEmail,
      isShared,
      isOwner,
      isReceivedShare,
    });

    // CASE 1: This is a RECEIVED shared file (receiver is renaming)
    if (isReceivedShare) {
      console.log(`[RENAME] CASE 1: Receiver renaming shared file (in trash: ${isInTrash})`);
      
      try {
        await apiCall('/api/shares', {
          method: 'PATCH',
          body: JSON.stringify({ fileId: id, fileName: newName })
        });
        console.log(`[RENAME] API update successful`);
        
        console.log(`✏️ [RENAME] Receiver renamed shared file ${id} to: ${newName} (propagated to sender)`);
        
        // Update the file in the appropriate state
        if (isInTrash) {
          console.log(`[RENAME] Updating deletedFiles state for receiver's trash`);
          setDeletedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name: newName } : f)));
        } else {
          console.log(`[RENAME] File is in receiver's active vault - sync will handle update`);
        }
        
        setTimeout(() => {
          console.log('[RENAME] Triggering sync after receiver rename');
          syncSharedFiles();
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        }, 100);
      } catch (e) {
        console.error('[RENAME] Failed to propagate receiver rename to shared entries', e);
      }
      return;
    }

    // CASE 2: This is a file OWNED BY sender (sender is renaming)
    console.log(`[RENAME] CASE 2: Sender renaming (in trash: ${isInTrash})`, { isOwner, isShared });

    if (isOwner) {
      const uniqueName = makeUniqueName(
        newName,
        file.parentFolderId ?? null,
        file.type === 'folder',
        false,
        true
      );

      console.log(`[RENAME] Unique name after conflict check: ${uniqueName}`);

      // Update the file in the appropriate state (trash or active files)
      if (isInTrash) {
        console.log(`[RENAME] ✅ File is in SENDER's TRASH - updating deletedFiles only (NO propagation)`);
        setDeletedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name: uniqueName } : f)));
        console.log(`✏️ [RENAME] Renamed file in trash ${id} to: ${uniqueName} (NOT propagated - file is deleted)`);
      } else {
        console.log(`[RENAME] ✅ File is in SENDER's VAULT - updating files state`);
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name: uniqueName } : f)));
        
        // Update via API
        try {
          await apiCall(`/api/files/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: uniqueName })
          });
          console.log('[RENAME] File renamed in API');
        } catch (apiError) {
          console.error('[RENAME] Failed to rename file in API:', apiError);
        }
        
        // ONLY propagate rename if file is NOT in trash
        if (isShared) {
          console.log(`[RENAME] 📡 File is shared - will propagate to receivers`);
          try {
            await apiCall('/api/shares', {
              method: 'PATCH',
              body: JSON.stringify({ fileId: id, fileName: uniqueName })
            });
            console.log(`[RENAME] API update successful`);
            
            console.log(`✏️ [RENAME] Sender renamed shared file ${id} to: ${uniqueName} (propagated to receivers)`);
            
            // Trigger sync so receivers see the change
            setTimeout(() => {
              console.log(`[RENAME] 🔔 Triggering cross-tab sync for rename propagation`);
              window.dispatchEvent(new Event(SHARED_FILES_EVENT));
            }, 100);
          } catch (e) {
            console.error('[RENAME] Failed to propagate sender rename to shared entries', e);
          }
        } else {
          console.log(`✏️ [RENAME] Renamed file ${id} to: ${uniqueName} (not shared, no propagation)`);
        }
      }

      return;
    }

    console.warn('[RENAME] Unexpected rename scenario - no action taken');
  };

  // ─── delete ─────────────────────────────────────────────────────────
  const handleDeleteFile = async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;
    
    console.log('🗑️ [DELETE] Starting delete for file:', { id, name: file.name, isSharedFile: file.isSharedFile, owner: file.owner });
    
    // If this is a received shared file/folder, allow the recipient to delete it locally
    if (file.isSharedFile && file.owner && file.owner !== userEmail) {
      if (!ensureUser('handleDeleteFile')) return;

      // ✅ FIX 5: Decrease storage for received shares when deleted
      if (file.isReceivedShare && file.type !== 'folder') {
        console.log(`📉 [DELETE] Removing received share from storage: -${file.size} bytes`);
        setStorageUsed((prev) => Math.max(0, prev - file.size));
      }

      console.log('🗑️ [DELETE] RECEIVER deleting shared item:', file.name, 'type:', file.type);
      
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
      
      // ✅ OPTIMISTIC UI: Build tombstones and update UI IMMEDIATELY
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

      // ✅ OPTIMISTIC: Update UI first (instant feedback)
      setFiles((prev) => prev.filter((f) => !itemsToDelete.some(d => d.id === f.id)));
      setDeletedFiles((prev) => {
        const merged = [...prev, ...tombstones];
        const map = new Map<string, any>();
        for (const t of merged) map.set(t.id, t);
        return Array.from(map.values());
      });
      setStorageUsed((prev) => Math.max(0, prev - totalSize));
      console.log('✅ [DELETE] UI updated (optimistic) - receiver trash');

      // ✅ BACKGROUND: Run API calls without blocking UI
      (async () => {
        try {
          for (const item of itemsToDelete) {
            await apiCall('/api/shares/trashed', {
              method: 'POST',
              body: JSON.stringify({ shareId: item.id, fileId: item.id })
            });
          }
        } catch (e) {
          console.error('❌ [DELETE] Failed to add to receiver_trashed_shares', e);
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

    // ✅ OPTIMISTIC UI: Build deleted items and update UI IMMEDIATELY
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

    // ✅ OPTIMISTIC: Update UI first (instant feedback)
    setDeletedFiles((prev) => [...prev, ...deletedItems]);
    setFiles((prev) => prev.filter((f) => !toDelete.some(d => d.id === f.id)));
    setSelectedFiles(new Set());
    console.log('✅ [DELETE] UI updated (optimistic)');

    // ✅ BACKGROUND: Run API calls without blocking UI
    (async () => {
      try {
        for (const item of toDelete) {
          // Fetch recipients from API
          let recipients: string[] = [];
          try {
            const recipientsResponse = await apiCall('/api/shares/recipients', {
              method: 'POST',
              body: JSON.stringify({ fileId: item.id })
            });
            recipients = recipientsResponse.recipients || [];
          } catch (e) {
            console.error('Failed to fetch recipients:', e);
          }
          
          const isShared = recipients.length > 0;
          
          if (isShared && emailsMatch(item.owner, userEmail)) {
            try {
              // Mark as temp deleted via API
              await apiCall('/api/shares/temp-deleted', {
                method: 'POST',
                body: JSON.stringify({
                  fileIds: [item.id],
                  recipientEmails: recipients,
                  isTrashed: true
                })
              });
            } catch (e) {
              console.error('❌ [DELETE] Failed to mark shared file as temporarily deleted', e);
            }
          }
          
          // Move to trash via API
          try {
            await apiCall('/api/trash/move', {
              method: 'POST',
              body: JSON.stringify({ fileIds: [item.id] })
            });
          } catch (apiError) {
            console.error('[DELETE] Failed to move to trash in API:', apiError);
          }
        }

        // Trigger sync for receivers
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
      } catch (e) {
        console.error('❌ [DELETE] Background API calls failed:', e);
      }
    })();
  };

// ─── restore ────────────────────────────────────────────────────────
  const handleRestoreFile = async (id: string) => {
    const file = deletedFiles.find((f) => f.id === id);
    if (!file) return;
    if (!ensureUser('handleRestoreFile')) return;

    console.log('♻️ [RESTORE] Starting restore for file:', { id, name: file.name, owner: file.owner });

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
          console.error('Failed to fetch recipients:', e);
        }
        
        console.log('♻️ [RESTORE] SENDER restoring, checking if shared. Recipients:', recipients);
        
        if (recipients.length > 0) {
          console.log('📤 [RESTORE] Auto re-sharing file to receivers after restore');
          console.log(`📦 [RESTORE] Total items to restore: ${toRestore.length}`);
          
          // ✅ CRITICAL FIX: Remove ALL items (parent + descendants) from temp_deleted via API
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
            console.log(`✅ [RESTORE] Cleaned temp_deleted list for all recipients`);
          } catch (e) {
            console.error('❌ [RESTORE] Failed to clean temp_deleted via API:', e);
          }

          // Notify other tabs/components
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
          console.log('✅ [RESTORE] Auto re-shared file to all receivers');
        }
      }
    } catch (e) {
      console.error('❌ [RESTORE] Failed to restore shared file visibility', e);
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
          console.log(`♻️ [RESTORE] Removed ${itemId} from receiver_trashed_shares`);
        } catch (e) {
          console.error(`Failed to remove ${itemId} from receiver_trashed_shares:`, e);
        }
      }
      console.log('🕒 [RESTORE] Completed receiver_trashed_shares cleanup —', new Date().toISOString());

      // ✅ NOTE: Receiver does NOT need to recreate share entries
      // The share still exists in the database - we just removed the "trashed" marker
      // Triggering sync will re-fetch the share from the API
      for (const item of toRestore) {
        if ((item as any).sharedMeta && (item as any).sharedMeta.ownerId) {
          console.log('♻️ [RESTORE] RECEIVER restoring tombstone - syncing to re-fetch share');
          // Just trigger sync - the share entry still exists on the server (sender owns it)
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
          break; // Only need to trigger once
        }
      }
    } catch (e) {
      console.error('❌ [RESTORE] Failed in tombstone recreation/cleanup', e);
    }

    // ── RECEIVER restoring a shared folder: unlock pending items ────────────
    try {
      const isReceiverRestoringShared = toRestore.some(item =>
        (item as any).sharedMeta || (item as any).originalSharedId ||
        (item.isSharedFile && item.owner && item.owner !== userEmail)
      );

      if (isReceiverRestoringShared) {
        const idsBeingRestored = toRestore.map(i => (i as any).originalSharedId || i.id);
        console.log(`♻️  [RESTORE] Cleaning receiver_trashed_shares via API`);
        console.log(`   IDs being restored: ${JSON.stringify(idsBeingRestored)}`);

        // Clean via API
        for (const itemId of idsBeingRestored) {
          try {
            await apiCall('/api/shares/trashed', {
              method: 'DELETE',
              body: JSON.stringify({ fileId: itemId })
            });
          } catch (e) {
            console.error(`Failed to remove ${itemId}:`, e);
          }
        }

        console.log(`🕒 [RESTORE] Completed receiver_trashed_shares write — ${new Date().toISOString()}`);
        console.log(`♻️  [RESTORE] Triggering sync — pending items will now be delivered.`);

        // Kick sync so pending shared items flow into files
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
      }
    } catch (e) {
      console.error('❌ [RESTORE] Failed to clean receiver_trashed_shares', e);
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

    // ✅ OPTIMISTIC UI: Update state immediately
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
    console.log('✅ [RESTORE] UI updated (optimistic)');

    // ✅ BACKGROUND: Run API calls without blocking UI (only for files we OWN)
    (async () => {
      try {
        // ✅ FIX: Only restore files that user OWNS (not shared tombstones)
        const ownedFilesToRestore = toRestore.filter(f => {
          const isReceiverTombstone = (f as any).sharedMeta || (f as any).originalSharedId || 
            (f.isSharedFile && f.owner && !emailsMatch(f.owner, userEmail));
          if (isReceiverTombstone) {
            console.log(`⏭️ [RESTORE] Skipping API restore for shared tombstone: ${f.name}`);
            return false;
          }
          return true;
        });
        
        if (ownedFilesToRestore.length > 0) {
          await apiCall('/api/trash/restore', {
            method: 'POST',
            body: JSON.stringify({ fileIds: ownedFilesToRestore.map(f => f.id) })
          });
          console.log(`✅ [RESTORE] Restored ${ownedFilesToRestore.length} owned files via API`);
        }
      } catch (e) {
        console.error('❌ [RESTORE] Failed to restore in API:', e);
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

    console.log('💥 [PERM_DELETE] Starting permanent delete for file:', { id, name: file.name, owner: file.owner });

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

    // ✅ FIX 2: Improved check for receiver-deleted shared files
    const isReceiverDeletingSharedFile = 
      !!(file as any).sharedMeta ||
      !!(file as any).originalSharedId ||
      (file.isSharedFile && file.owner && file.owner !== userEmail);

    // ✅ OPTIMISTIC UI: Update UI first (instant feedback)
    const storageToFree = toDelete.reduce((acc, item) => acc + (item.size || 0), 0);
    setDeletedFiles((prev) => prev.filter((f) => !toDelete.some(d => d.id === f.id)));
    if (!isReceiverDeletingSharedFile) {
      setStorageUsed((prev) => Math.max(0, prev - storageToFree));
    }
    setSelectedFiles(new Set());
    console.log('✅ [PERM_DELETE] UI updated (optimistic)');

    // ✅ BACKGROUND: Run API calls without blocking UI
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
              console.error(`Failed to hide ${itemId}:`, e);
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
              console.error(`Failed to unshare ${shareId}:`, e);
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

        // ✅ FIX: Use bulk delete API which properly handles folder hierarchies
        // The bulk API checks if ancestors are deleted, allowing children of deleted folders to be removed
        const allIdsToDelete = toDelete.map(item => item.id);
        try {
          await apiCall('/api/files/permanent-delete', {
            method: 'DELETE',
            body: JSON.stringify({ fileIds: allIdsToDelete })
          });
          console.log(`✅ [PERM_DELETE] Bulk deleted ${allIdsToDelete.length} files via API`);
        } catch (e) {
          console.error(`❌ [PERM_DELETE] Bulk delete failed, trying individual deletes:`, e);
          // Fallback to individual deletes
          for (const item of toDelete) {
            try {
              await apiCall(`/api/trash/${item.id}`, { method: 'DELETE' });
            } catch (e2) {
              console.error(`❌ [PERM_DELETE] Failed to delete ${item.id} from API:`, e2);
            }
          }
        }
      } catch (e) {
        console.error('❌ [PERM_DELETE] Background API calls failed:', e);
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
      console.error(`❌ [MOVE] File not found: ${fileId}`);
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
      console.error('Failed to fetch file recipients:', e);
    }
    
    if (targetFolderId) {
      try {
        const targetRecipientsResponse = await apiCall('/api/shares/recipients', {
          method: 'POST',
          body: JSON.stringify({ fileId: targetFolderId })
        });
        targetRecipients = targetRecipientsResponse.recipients || [];
      } catch (e) {
        console.error('Failed to fetch target folder recipients:', e);
      }
    }
    
    // ✅ GUARD: Prevent shared files from going into unshared folders
    const isFileShared = fileRecipients.length > 0;
    const targetIsShared = targetFolderId ? targetRecipients.length > 0 : false;
    const targetFolderOwner = targetFolder?.owner || userEmail;
    const targetIsReceivedShare = targetFolder?.isReceivedShare || (targetFolder?.owner && targetFolder.owner !== userEmail);
    
    if (isFileShared && targetFolderId && !targetIsShared && !targetIsReceivedShare) {
      console.warn(`⚠️ [MOVE] Cannot move shared file "${file.name}" into unshared folder "${targetFolder?.name}"`);
      alert(`Cannot move shared file "${file.name}" into an unshared folder. Share the folder first, or move to a different location.`);
      return;
    }
    
    // ✅ GUARD: Prevent moving folder into itself or its descendants
    if (file.type === 'folder' && targetFolderId) {
      const isDescendant = (parentId: string, childId: string): boolean => {
        if (parentId === childId) return true;
        const parent = files.find(f => f.id === parentId);
        if (!parent || !parent.parentFolderId) return false;
        return isDescendant(parent.parentFolderId, childId);
      };
      
      if (isDescendant(targetFolderId, fileId)) {
        console.warn(`⚠️ [MOVE] Cannot move folder into itself or its descendant`);
        return;
      }
    }
    
    console.log(`📁 [MOVE] Moving "${file.name}" (${file.id}) to ${targetFolderId ? `"${targetFolder?.name}" (${targetFolderId})` : 'root'}`);
    console.log(`📁 [MOVE] File details:`, {
      fileId: file.id,
      fileName: file.name,
      fileType: file.type,
      currentParent: file.parentFolderId,
      isSharedFile: file.isSharedFile,
      owner: file.owner,
      isFileShared,
      targetIsShared
    });
    
    if (targetFolder) {
      console.log(`📁 [MOVE] Target folder details:`, {
        folderId: targetFolder.id,
        folderName: targetFolder.name,
        isSharedFile: targetFolder.isSharedFile,
        owner: targetFolder.owner
      });
    }
    
    // ✅ FIX: Check for duplicate names and add (1), (2), etc. suffix
    const makeUniqueNameInFolder = (name: string, parentId: string | null): string => {
      const siblingsInTarget = files.filter(f => 
        f.id !== fileId && // Exclude the file being moved
        f.parentFolderId === parentId
      );
      
      console.log(`🔍 [MOVE] Checking for duplicates in target folder. Found ${siblingsInTarget.length} siblings`);
      
      const baseName = name.replace(/\s*\(\d+\)(\.[^.]+)?$/, '$1'); // Remove existing (N) suffix
      const extension = baseName.includes('.') ? baseName.slice(baseName.lastIndexOf('.')) : '';
      const nameWithoutExt = extension ? baseName.slice(0, -extension.length) : baseName;
      
      let finalName = name;
      let counter = 1;
      
      while (siblingsInTarget.some(f => f.name.toLowerCase() === finalName.toLowerCase())) {
        finalName = `${nameWithoutExt} (${counter})${extension}`;
        counter++;
        console.log(`🔄 [MOVE] Name conflict detected, trying: "${finalName}"`);
      }
      
      if (finalName !== name) {
        console.log(`📝 [MOVE] Renamed "${name}" → "${finalName}" to avoid conflict`);
      }
      
      return finalName;
    };
    
    const newName = makeUniqueNameInFolder(file.name, targetFolderId);
    
    console.log(`✅ [MOVE] Final name will be: "${newName}"`);
    
    // Update local files state with new name and location
    setFiles(files.map((f) => {
      if (f.id === fileId) {
        return { ...f, name: newName, parentFolderId: targetFolderId };
      }
      return f;
    }));
    
    console.log(`✅ [MOVE] Updated local files state`);
    
    // Update file in API
    try {
      await apiCall(`/api/files/${fileId}`, {
        method: 'PATCH',
        body: JSON.stringify({ 
          name: newName,
          parentFolderId: targetFolderId 
        })
      });
      console.log(`✅ [MOVE] Updated file in API`);
    } catch (apiError) {
      console.error('❌ [MOVE] Failed to update file in API:', apiError);
    }
    
    // ✅ CRITICAL FIX: Handle moves into shared folders (bi-directional sharing)
    if (targetFolderId && targetFolder) {
      // Check if target folder is shared (could be received or owned)
      const folderOwner = targetFolder.owner || userEmail;
      const isReceivedFolder = targetFolder.isReceivedShare || (targetFolder.owner && targetFolder.owner !== userEmail);
      
      console.log(`📁 [MOVE] Target folder info:`, {
        folderId: targetFolderId,
        folderName: targetFolder.name,
        folderOwner,
        isReceivedFolder,
        currentUser: userEmail
      });
      
      // Get all people this folder is shared with (including owner if it's a received share)
      let peopleToShareWith: string[] = [];
      
      if (isReceivedFolder && folderOwner !== userEmail) {
        // If moving into a received shared folder, share back with the owner
        peopleToShareWith.push(folderOwner);
        console.log(`🔄 [MOVE] Target is a received folder, will share with owner: ${folderOwner}`);
      }
      
      // Also share with any other recipients of this folder
      peopleToShareWith = [...new Set([...peopleToShareWith, ...targetRecipients])];
      
      // Remove current user from the list
      peopleToShareWith = peopleToShareWith.filter(email => email !== userEmail);
      
      if (peopleToShareWith.length > 0) {
        console.log(`🎯 [MOVE] Target folder is shared, will share file with ${peopleToShareWith.length} user(s):`, peopleToShareWith);
        
        // 🔍 DEBUG: dump the receiver_trashed_shares for each target
        for (const email of peopleToShareWith) {
          try {
            const rtResponse = await apiCall(`/api/shares/trashed?recipientEmail=${encodeURIComponent(email)}`);
            const rtList: string[] = (rtResponse.data || []).map((t: any) => t.fileId);
            console.log(`🔍 [MOVE] receiver_trashed_shares for ${email}: ${JSON.stringify(rtList)}`);
            console.log(`   Target folder ${targetFolderId} in their trash? ${rtList.includes(targetFolderId!)}`);
          } catch (e) {
            console.error(`❌ [MOVE] Failed to read receiver_trashed_shares for ${email}`, e);
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
                console.log(`📦 [MOVE] Got file data for auto-share: ${file.name}`);
              } catch (error) {
                console.error(`❌ [MOVE] Failed to get file data for ${file.name}:`, error);
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
            
            console.log(`✅ [MOVE] Auto-shared "${newName}" with ${recipientEmail}`);
          } catch (error) {
            console.error(`❌ [MOVE] Failed to auto-share with ${recipientEmail}:`, error);
          }
        }
        
        // Trigger sync after auto-sharing
        console.log(`🔔 [MOVE] Triggered sync after auto-sharing`);
      }
    }

    // ✅ If this file was already being shared, update the shared file entries too
    const sharedWith = fileRecipients;
    if (sharedWith.length > 0) {
      console.log(`📤 [MOVE] File is shared with ${sharedWith.length} recipient(s), updating shared entries...`);
      
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
        console.log(`✅ [MOVE] Updated shared file location and name for ${sharedWith.length} recipient(s)`);
      } catch (error) {
        console.error('❌ [MOVE] Failed to update shared file entries:', error);
      }
    } else {
      console.log(`ℹ️ [MOVE] File is not shared with anyone (yet)`);
    }
    
    // ✅ If this is a folder, recursively update all children
    if (file.type === 'folder') {
      console.log(`📁 [MOVE] Target is a folder, recursively updating children...`);
      const updateChildrenRecursive = async (parentId: string) => {
        const children = files.filter(f => f.parentFolderId === parentId);
        console.log(`🔍 [MOVE] Found ${children.length} children in folder ${parentId}`);
        
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
            console.error('Failed to fetch child recipients:', e);
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
              console.log(`✅ [MOVE] Updated child share: ${child.name}`);
            } catch (error) {
              console.error('❌ [MOVE] Failed to update child shared file:', error);
            }
          }
          
          if (child.type === 'folder') {
            await updateChildrenRecursive(child.id);
          }
        }
      };
      
      await updateChildrenRecursive(fileId);
      console.log(`✅ [MOVE] Finished updating folder and all children`);
    }
    
    // Trigger sync
    window.dispatchEvent(new Event(SHARED_FILES_EVENT));
    
    console.log(`🎉 [MOVE] Move operation complete!`);
  };

  // DONE

  
// ─── download ───────────────────────────────────────────────────────
  const handleDownloadFile = async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;

    // ✅ Check if we have masterKey
    if (!masterKey) {
      alert('Vault is locked. Please unlock your vault to download files.');
      console.error('Cannot download: masterKey not available');
      return;
    }

    if (file.type === 'folder') {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const addFolderToZip = async (folderId: string, zipFolder: any) => {
        const children = files.filter((f) => f.parentFolderId === folderId);
        for (const child of children) {
          if (child.type === 'folder') {
            const subFolder = zipFolder.folder(child.name);
            await addFolderToZip(child.id, subFolder);
          } else {
            try {
              // Download encrypted file data from API
              const response = await fetch(`/api/files/download/${child.id}`, {
                headers: {
                  'Authorization': `Bearer ${authToken}`,
                },
              });

              if (!response.ok) {
                console.error(`Failed to download file ${child.name}`);
                continue;
              }

              const { encryptedData, iv, wrappedKey, fileName, mimeType } = await response.json();

              // ✅ FIX: Unwrap the key first
              const fileKey = await unwrapFileKey(
                new Uint8Array(wrappedKey).buffer,
                masterKey
              );

              // ✅ FIX: Decrypt with unwrapped key AND mimeType
              const decryptedBlob = await decryptFileData(
                new Uint8Array(encryptedData).buffer,
                fileKey,
                new Uint8Array(iv),
                mimeType || 'application/octet-stream'
              );

              if (decryptedBlob) {
                zipFolder.file(child.name, decryptedBlob);
              }
            } catch (error) {
              console.error(`Failed to add file ${child.name} to zip:`, error);
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
        // Download encrypted file data from API
        const response = await fetch(`/api/files/download/${id}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });

        if (!response.ok) {
          alert('File not found. It may not have been uploaded properly.');
          return;
        }

        const { encryptedData, iv, wrappedKey, fileName, mimeType } = await response.json();

        // ✅ FIX: Unwrap the key first
        const fileKey = await unwrapFileKey(
          new Uint8Array(wrappedKey).buffer,
          masterKey
        );

        // ✅ FIX: Decrypt with unwrapped key AND mimeType
        const blob = await decryptFileData(
          new Uint8Array(encryptedData).buffer,
          fileKey,
          new Uint8Array(iv),
          mimeType || 'application/octet-stream'
        );

        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          alert('Failed to decrypt file. Please try again.');
        }
      } catch (error) {
        console.error('Failed to download file:', error);
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

    // ✅ FIX: Use functional update to avoid closure issues
    setFiles(prev => prev.map((f) => (f.id === id ? { ...f, isFavorite: newFavoriteState } : f)));

    // ✅ FIX: Use API-based favorites (per-user, works for both owned and received files)
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
        console.error('Failed to toggle favorite:', errorData.error || response.statusText);
        // ✅ FIX: Use functional update for revert too
        setFiles(prev => prev.map((f) => (f.id === id ? { ...f, isFavorite: originalFavoriteState } : f)));
      } else {
        console.log(`❤️ [FAVORITE] ${newFavoriteState ? 'Added' : 'Removed'}: ${file.name}`);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // ✅ FIX: Use functional update for revert
      setFiles(prev => prev.map((f) => (f.id === id ? { ...f, isFavorite: originalFavoriteState } : f)));
    }
  };

// ─── sharing ────────────────────────────────────────────────────────
  const handleShareFile = async (id: string, recipientEmail: string, senderName?: string): Promise<boolean> => {
    console.log('📤 [SHARE] handleShareFile called:', { id, recipientEmail, senderName });
    
    const file = files.find((f) => f.id === id);
    if (!file) {
      console.log('❌ [SHARE] File not found in local state:', id);
      return false;
    }
    if (file.isSharedFile) {
      console.log('❌ [SHARE] Cannot share a received file:', { id, name: file.name });
      return false;
    }
    if (!ensureUser('handleShareFile')) {
      console.log('❌ [SHARE] No user session');
      return false;
    }

    // ✅ Sanity check: warn if ID looks like temp ID
    if (id.length < 15 && !id.startsWith('c')) {
      console.warn('⚠️ [SHARE] File ID looks like temp ID, may not exist in DB:', id);
    }

    console.log('📤 [SHARE] Sharing file:', { id, name: file.name, type: file.type, recipientEmail, currentSharedWith: file.sharedWith });

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

    // ✅ OPTIMISTIC UI: Update sharedWith immediately for responsive feel
    const normalizedRecipient = recipientEmail.toLowerCase().trim();
    setFiles((prev) => prev.map((f) => {
      if (!itemsToShare.some(item => item.id === f.id)) return f;
      const currentSharedWith = (f as any).sharedWith || [];
      if (currentSharedWith.some((email: string) => email.toLowerCase() === normalizedRecipient)) {
        return f; // Already has this recipient
      }
      return { ...f, sharedWith: [...currentSharedWith, recipientEmail] };
    }));

    // ✅ HYBRID: Await ROOT item share, background for descendants
    // This gives accurate feedback while keeping it fast
    try {
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
          parentFolderId: file.parentFolderId,
        }),
      });

      console.log('📤 [SHARE] ROOT API response status:', rootResponse.status, 'for', file.name);

      if (!rootResponse.ok) {
        const result = await rootResponse.json();
        console.log('❌ [SHARE] ROOT API error:', result, 'status:', rootResponse.status);
        
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
      console.log('📤 [SHARE] ROOT API result:', rootResult);

      if (!rootResult.success && !rootResult.message?.includes('already shared')) {
        // Root share failed - revert
        console.log('❌ [SHARE] ROOT share failed:', rootResult.message);
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

      console.log(`✅ [SHARE] ROOT item shared successfully: ${file.name}`);

      // Share descendants in BACKGROUND (don't block)
      if (itemsToShare.length > 1) {
        const descendants = itemsToShare.slice(1); // Everything except root
        (async () => {
          console.log(`📤 [SHARE] Sharing ${descendants.length} descendants in background`);
          
          const sharePromises = descendants.map(async (item) => {
            try {
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
                  parentFolderId: item.parentFolderId,
                }),
              });

              if (response.ok) {
                const result = await response.json();
                if (result.success || result.message?.includes('already shared')) {
                  console.log(`✅ [SHARE] Descendant shared: ${item.name}`);
                  return true;
                }
              }
              console.log(`❌ [SHARE] Descendant failed: ${item.name}`);
              return false;
            } catch (error) {
              console.error(`❌ [SHARE] Error sharing ${item.name}:`, error);
              return false;
            }
          });

          const results = await Promise.all(sharePromises);
          const successCount = results.filter(r => r).length;
          console.log(`📤 [SHARE] Background complete: ${successCount}/${descendants.length} descendants shared`);
        })();
      }

      // Trigger cross-tab sync so receiver sees it faster
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
      return true;

    } catch (error) {
      console.error('❌ [SHARE] Failed to share file:', error);
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

 const handleUnshareFile = async (id: string, recipientEmail: string): Promise<boolean> => {
    if (!ensureUser('handleUnshareFile')) return false;
    
    const file = files.find((f) => f.id === id);
    if (!file) return false;
    
    console.log('🚫 [UNSHARE] Unsharing:', { id, name: file.name, type: file.type, recipientEmail });
    
    // ✅ FIX: Get all descendants for folders (to update their sharedWith too)
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
    
    // ✅ OPTIMISTIC UI: Update sharedWith for parent AND all children
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
    
    // ✅ BACKGROUND: Run API call
    try {
      const response = await fetch(`/api/shares?fileId=${id}&recipientEmail=${encodeURIComponent(recipientEmail)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        const result = await response.json();
        console.error('❌ [UNSHARE] Failed to unshare:', result.error);
        // Revert on failure - trigger sync to restore correct state
        debouncedSyncSharedFiles();
        return false;
      }

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ [UNSHARE] Successfully unshared ${result.count} item(s) from ${recipientEmail}`);
        // ✅ FIX: Trigger full sync to ensure state is correct (paperclip removed)
        debouncedSyncSharedFiles();
        // Trigger event for receiver to see changes
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        return true;
      } else {
        console.warn('⚠️ [UNSHARE] Unshare returned unsuccessful');
        return false;
      }

    } catch (error) {
      console.error('❌ [UNSHARE] Error unsharing file:', error);
      return false;
    }
  };

  // TODO START HERE.

const handleUnshareAll = async (id: string): Promise<boolean> => {
    if (!ensureUser('handleUnshareAll')) return false;
    
    const file = files.find((f) => f.id === id);
    if (!file) return false;
    
    console.log('🚫 [UNSHARE_ALL] Unsharing from all:', { id, name: file.name, type: file.type });
    
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
        console.error('❌ [UNSHARE_ALL] Failed to unshare:', result.error);
        return false;
      }

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ [UNSHARE_ALL] Successfully unshared ${result.count} share(s) from ${result.affectedRecipients} recipient(s)`);
        return true;
      } else {
        console.warn('⚠️ [UNSHARE_ALL] Unshare all returned unsuccessful');
        return false;
      }

    } catch (error) {
      console.error('❌ [UNSHARE_ALL] Error unsharing file from all:', error);
      return false;
    }
  };

  // ─── bulk operations ────────────────────────────────────────────────
const handleBulkDelete = async () => {
    if (!ensureUser('handleBulkDelete')) return;
    
    // ✅ Guard: Don't proceed with empty selection
    if (selectedFiles.size === 0) {
      console.log('⚠️ [BULK_DELETE] No files selected, skipping');
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

    console.log('🗑️ [BULK_DELETE] Deleting files:', uniqueFilesToDelete.length);

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

    // ✅ OPTIMISTIC: Update UI first (instant feedback)
    setDeletedFiles([...deletedFiles, ...deletedItems]);
    setFiles(files.filter((f) => !uniqueFilesToDelete.some(d => d.id === f.id)));
    setSelectedFiles(new Set());
    console.log('✅ [BULK_DELETE] Local state updated - files moved to trash (optimistic)');

    // ✅ BACKGROUND: Run API call without blocking UI
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
          console.error('❌ [BULK_DELETE] API failed:', result.error);
          // Note: We don't revert on failure - user can manually restore if needed
        } else {
          const result = await response.json();
          console.log(`✅ [BULK_DELETE] API confirmed: ${result.message}`);
        }
      } catch (error) {
        console.error('❌ [BULK_DELETE] API error:', error);
      }
    })();
  };

const handleBulkRestore = async () => {
    const idsArray = Array.from(selectedFiles);
    await handleRestoreFiles(idsArray);
  };

const handleBulkPermanentDelete = async () => {
    if (!ensureUser('handleBulkPermanentDelete')) return;
    
    // ✅ Guard: Don't proceed with empty selection
    if (selectedFiles.size === 0) {
      console.log('⚠️ [BULK_PERM_DELETE] No files selected, skipping');
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

    console.log('💥 [BULK_PERM_DELETE] Permanently deleting files:', uniqueFilesToDelete.length);

    // ✅ Check if ANY of the files are receiver-deleted shared files
    const hasReceiverDeletedSharedFiles = uniqueFilesToDelete.some(item => 
      !!(item as any).sharedMeta ||
      !!(item as any).originalSharedId ||
      (item.isSharedFile && item.owner && item.owner !== userEmail)
    );

    // SCENARIO 1: Receiver permanently deleting shared items
    if (hasReceiverDeletedSharedFiles) {
      console.log('💥 [BULK_PERM_DELETE] RECEIVER permanently deleting shared files');
      
      // ✅ OPTIMISTIC: Update UI immediately
      setDeletedFiles((prev) => prev.filter((f) => !uniqueFilesToDelete.some((d) => d.id === f.id)));
      setSelectedFiles(new Set());
      
      // ✅ BACKGROUND: Run API calls without blocking UI
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

          // ✅ FIX: Receiver permanently deleting DOES unshare
          // This removes the Share record so the sender can re-share if they want
          for (const item of sharedItems) {
            const fileId = (item as any).originalSharedId || item.id;
            try {
              await apiCall('/api/shares', {
                method: 'DELETE',
                body: JSON.stringify({ fileId, recipientEmail: userEmail })
              });
              console.log(`✅ [BULK_PERM_DELETE] Removed share for ${item.name}`);
            } catch (e) {
              console.error(`Failed to unshare ${fileId}:`, e);
            }
          }
        } catch (e) {
          console.error('❌ [BULK_PERM_DELETE] Background API calls failed', e);
        }
      })();
      
      return;
    }

    // SCENARIO 2: Sender permanently deleting - remove all shares
    try {
      for (const item of uniqueFilesToDelete) {
        if (emailsMatch(item.owner, userEmail)) {
          console.log('💥 [BULK_PERM_DELETE] SENDER permanently deleting:', item.name);
          
          // Remove all shares for this file via API
          const response = await fetch(`/api/shares/all?fileId=${item.id}&recursive=true`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });

          if (response.ok) {
            const result = await response.json();
            console.log(`✅ [BULK_PERM_DELETE] Removed ${result.count} share(s) for ${item.name}`);
          } else {
            console.error(`❌ [BULK_PERM_DELETE] Failed to remove shares for ${item.name}`);
          }
        }
      }
    } catch (e) {
      console.error('❌ [BULK_PERM_DELETE] Failed to remove shares on permanent delete', e);
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
        console.error('❌ [BULK_PERM_DELETE] Failed to permanently delete:', result.error);
        alert('Failed to permanently delete files. Please try again.');
        return;
      }

      const result = await response.json();
      console.log(`✅ [BULK_PERM_DELETE] ${result.message}`);

    } catch (error) {
      console.error('❌ [BULK_PERM_DELETE] Error permanently deleting:', error);
      alert('Failed to permanently delete files. Please try again.');
      return;
    }

    // Update local state
    setDeletedFiles(deletedFiles.filter((f) => !uniqueFilesToDelete.some((d) => d.id === f.id)));
    setStorageUsed((prev) => Math.max(0, prev - uniqueFilesToDelete.reduce((acc, item) => acc + (item.size || 0), 0)));
    setSelectedFiles(new Set());
    console.log('✅ [BULK_PERM_DELETE] Files permanently deleted');
  };

  // ─── sorting ────────────────────────────────────────────────────────
  const handleSortChange = (column: 'name' | 'modified') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      // ✅ FIX: Default to desc for modified (newest first) and asc for name (A-Z)
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
      console.error('❌ Failed to fetch metadata:', error);
    }

    // Check deletedFiles for tombstones
    const deletedSharedIds = new Set<string>();
    deletedFiles.forEach(df => {
      if (df.isSharedFile || (df as any).originalSharedId || (df as any).tombstone) {
        deletedSharedIds.add(df.id);
        const origId = (df as any).originalSharedId;
        if (origId) deletedSharedIds.add(origId);
      }
    });

    switch (currentTab) {
      case 'vault':
        // ✅ CRITICAL: If we're inside a folder that's in receiver's trash, show NOTHING
        if (currentFolderId && (receiverTrashedList.includes(currentFolderId) || deletedSharedIds.has(currentFolderId))) {
          console.log(`🗑️ [VAULT] Current folder ${currentFolderId} is in receiver's trash - showing nothing`);
          baseFiles = [];
          break;
        }
        
        baseFiles = files.filter((f) => {
          // Must match folder level
          const matchesFolder = currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId;
          if (!matchesFolder) return false;
          
          // ✅ FIX: Show BOTH own files AND received shares in Cloud Drive
          // This allows receiver to navigate into shared folders and upload
          // (Shared Items tab still shows received shares for easy access)
          
          // ✅ CRITICAL: Filter out ANY item that receiver has in their trash
          if (receiverTrashedList.includes(f.id)) {
            console.log(`🗑️ [VAULT] Filtering out receiver-trashed item: ${f.name} (ID: ${f.id})`);
            return false;
          }
          
          // 🔥 CRITICAL: Filter out tombstones from deletedFiles
          if (deletedSharedIds.has(f.id)) {
            console.log(`🗑️ [VAULT] Filtering out tombstone: ${f.name}`);
            return false;
          }
          
          // ✅ CRITICAL: Also check if parent folder is in receiver's trash OR is a tombstone
          if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
            console.log(`🗑️ [VAULT] Filtering out "${f.name}" - parent folder in receiver's trash`);
            return false;
          }
          
          return true;
        });
        break;

      case 'shared':
        console.log(`📂 [SHARED TAB] Current folder: ${currentFolderId || 'ROOT'}`);
        console.log(`   Temp deleted: ${tempDeletedList.length}, Hidden: ${hiddenList.length}, Receiver trashed: ${receiverTrashedList.length}`);
        console.log(`   Deleted shared IDs from deletedFiles: ${deletedSharedIds.size}`, Array.from(deletedSharedIds));
        
        // ✅ FIX: Check if we're inside a received shared folder
        // If yes, show ALL files inside it (including own uploads to shared folder)
        const currentFolderIsReceivedShare = currentFolderId && files.some(f => 
          f.id === currentFolderId && (f as any).isReceivedShare
        );
        
        baseFiles = files.filter((f) => {
          const isReceivedShare = !!(f as any).isReceivedShare;
          
          // ✅ FIX: If we're inside a received shared folder, show ALL files in it
          // This includes both received shares AND own files uploaded to shared folder
          if (currentFolderIsReceivedShare) {
            // Just check if file is in this folder
            const matchesFolder = f.parentFolderId === currentFolderId;
            if (!matchesFolder) return false;
            
            console.log(`   📁 [SHARED/INSIDE] "${f.name}" isReceived=${isReceivedShare}, matchesFolder=${matchesFolder}`);
            
            // Still filter out trashed items
            if (receiverTrashedList.includes(f.id) || deletedSharedIds.has(f.id)) {
              console.log(`   🗑️ Filtering out receiver-trashed: ${f.name} (${f.id})`);
              return false;
            }
            if (tempDeletedList.includes(f.id)) {
              console.log(`   ⏳ Filtering out temp-deleted: ${f.name} (${f.id})`);
              return false;
            }
            if (hiddenList.includes(f.id)) {
              console.log(`   🚫 Filtering out permanently hidden: ${f.name} (${f.id})`);
              return false;
            }
            
            return true;
          }
          
          // At ROOT or inside non-received folder: ONLY show received shares
          if (!isReceivedShare) {
            return false;
          }
          
          console.log(`   📤 [SHARED] "${f.name}" isReceived=${isReceivedShare}`);
          
          // Must not be temp deleted
          if (tempDeletedList.includes(f.id)) {
            console.log(`   ⏳ Filtering out temp-deleted: ${f.name} (${f.id})`);
            return false;
          }
          
          // Must not be permanently hidden
          if (hiddenList.includes(f.id)) {
            console.log(`   🚫 Filtering out permanently hidden: ${f.name} (${f.id})`);
            return false;
          }
          
          // 🔥 CRITICAL: Must not be in receiver's trash OR deletedFiles
          if (receiverTrashedList.includes(f.id) || deletedSharedIds.has(f.id)) {
            console.log(`   🗑️ Filtering out receiver-trashed: ${f.name} (${f.id})`, {
              inReceiverTrashed: receiverTrashedList.includes(f.id),
              inDeletedFiles: deletedSharedIds.has(f.id)
            });
            return false;
          }
          
          // 🔥 NEW: If file has a parent folder, check if parent is in receiver's trash
          if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
            console.log(`   🗑️ Filtering out (parent folder in receiver's trash): ${f.name} (${f.id})`);
            return false;
          }
          
          // ✅ Filter by current folder with special handling for Shared Items
          if (currentFolderId) {
            const matches = f.parentFolderId === currentFolderId;
            console.log(`   📁 "${f.name}" parent=${f.parentFolderId}, current=${currentFolderId}, matches=${matches}`);
            return matches;
          } else {
            // At ROOT level of Shared Items tab
            const isAtRoot = !f.parentFolderId;
            
            // ✅ For received shares: check if parent folder is ALSO a received share
            // If parent is NOT a received share (i.e., it's the user's own folder or doesn't exist in shares),
            // then show this item at root level in Shared Items
            if (isReceivedShare && f.parentFolderId) {
              const parentIsReceivedShare = files.some(p => 
                p.id === f.parentFolderId && (p as any).isReceivedShare
              );
              if (!parentIsReceivedShare) {
                console.log(`   📁 "${f.name}" parent=${f.parentFolderId} is NOT a shared folder, showing at root`);
                return true; // Show at root because parent is user's own folder
              }
            }
            
            console.log(`   📁 "${f.name}" parent=${f.parentFolderId}, at root=${isAtRoot}`);
            return isAtRoot;
          }
        });
        
        console.log(`📊 [SHARED TAB] Showing ${baseFiles.length} shared files`);
        break;

      case 'favorites':
        if (currentFolderId) {
          baseFiles = files.filter((f) => {
            // Must match folder
            if (f.parentFolderId !== currentFolderId) return false;
            
            // ✅ CRITICAL: Filter out receiver-trashed items
            if (receiverTrashedList.includes(f.id)) {
              console.log(`🗑️ [FAVORITES] Filtering out receiver-trashed: ${f.name}`);
              return false;
            }
            
            // 🔥 CRITICAL: Filter out tombstones from deletedFiles
            if (deletedSharedIds.has(f.id)) {
              console.log(`🗑️ [FAVORITES] Filtering out tombstone: ${f.name}`);
              return false;
            }
            
            // ✅ CRITICAL: Filter out if parent is in receiver's trash OR is a tombstone
            if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
              console.log(`🗑️ [FAVORITES] Filtering out "${f.name}" - parent in trash`);
              return false;
            }
            
            return true;
          });
        } else {
          baseFiles = files.filter((f) => {
            if (!f.isFavorite) return false;
            
            // ✅ CRITICAL: Filter out receiver-trashed items
            if (receiverTrashedList.includes(f.id)) {
              console.log(`🗑️ [FAVORITES] Filtering out receiver-trashed: ${f.name}`);
              return false;
            }
            
            // 🔥 CRITICAL: Filter out tombstones from deletedFiles
            if (deletedSharedIds.has(f.id)) {
              console.log(`🗑️ [FAVORITES] Filtering out tombstone: ${f.name}`);
              return false;
            }
            
            // ✅ CRITICAL: Filter out if parent is in receiver's trash OR is a tombstone
            if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
              console.log(`🗑️ [FAVORITES] Filtering out "${f.name}" - parent in trash`);
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
          
          // ✅ CRITICAL: Filter out receiver-trashed items
          if (receiverTrashedList.includes(f.id)) {
            console.log(`🗑️ [RECENTS] Filtering out receiver-trashed: ${f.name}`);
            return false;
          }
          
          // 🔥 CRITICAL: Filter out tombstones from deletedFiles
          if (deletedSharedIds.has(f.id)) {
            console.log(`🗑️ [RECENTS] Filtering out tombstone: ${f.name}`);
            return false;
          }
          
          // ✅ CRITICAL: Filter out if parent is in receiver's trash OR is a tombstone
          if (f.parentFolderId && (receiverTrashedList.includes(f.parentFolderId) || deletedSharedIds.has(f.parentFolderId))) {
            console.log(`🗑️ [RECENTS] Filtering out "${f.name}" - parent in trash`);
            return false;
          }
          
          return true;
        });
        baseFiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;

      case 'trash':
        console.log(`🗑️ [TRASH TAB] Receiver trashed shares: ${receiverTrashedList.length}`);
        
        // Get shared items that are in receiver's trash (still in files array, not deletedFiles)
        const receiverTrashedSharedItems = files.filter(f => {
          if (!receiverTrashedList.includes(f.id)) return false;
          
          // ✅ FIX: Hide if sender also has it in trash (temp_deleted)
          if (tempDeletedList.includes(f.id)) {
            console.log(`🗑️ [TRASH TAB] Hiding "${f.name}" - sender also has in trash (temp_deleted)`);
            return false;
          }
          
          // Respect folder hierarchy
          const matchesFolder = currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId;
          if (!matchesFolder) return false;
          
          console.log(`🗑️ [TRASH TAB] Including receiver-trashed shared item: "${f.name}"`);
          return true;
        });
        
        console.log(`🗑️ [TRASH TAB] Found ${receiverTrashedSharedItems.length} receiver-trashed shared items`);
        
        // ✅ Filter out shared items when both sender AND receiver have in trash
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
          
          // ✅ CRITICAL: Always check temp_deleted for any file in trash (shared or not)
          if (senderHasInTrash && isReceivedShareTombstone) {
            console.log(`🗑️ [TRASH TAB] Hiding "${f.name}" - sender trashed this shared item`);
            return false; // Hide when sender has it in trash
          }
          
          return true;
        });
        
        // ✅ Combine tombstones with receiver-trashed shared items
        baseFiles = [...tombstones, ...receiverTrashedSharedItems];
        console.log(`🗑️ [TRASH TAB] Total items in trash: ${baseFiles.length} (${tombstones.length} tombstones + ${receiverTrashedSharedItems.length} receiver-trashed)`);
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

  // ✅ FIX: Compute shared files count from actual files array (always accurate, even after optimistic updates)
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
      
      // ✅ NEW: Also count files the current user uploaded INSIDE a received shared folder (any level)
      // These are owned by the user but their parent is a received share or inside one
      if (f.parentFolderId && allSharedFolderIds.has(f.parentFolderId)) {
        return true;
      }
      
      return false;
    }).length;
    
    return count;
  }, [files, deletedFiles]);
  
  // ✅ FIX: Compute visible trash count (excludes shared items when sender trashed them)
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
          console.log(`🧹 Removing orphaned trash item: ${f.name}`);
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
          console.log(`🧹 Removing orphaned file: ${f.name}`);
          orphanedFileIds.push(f.id);
          return false;
        }
        return true;
      });
      
      setFiles(cleanedFiles);
      
      // If we found orphaned files, delete them from the database too
      if (orphanedFileIds.length > 0) {
        console.log(`🧹 Deleting ${orphanedFileIds.length} orphaned files from database...`);
        
        const response = await fetch('/api/files/cleanup-orphaned', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ fileIds: orphanedFileIds }),
        });

        if (!response.ok) {
          console.error('❌ Failed to cleanup orphaned files in database');
        } else {
          console.log('✅ Orphaned files cleaned from database');
        }
      }
      
      console.log('✨ Cleanup complete');
      alert('Cleanup complete! Removed orphaned/glitched files.');
    } catch (e) {
      console.error('Failed to cleanup glitched files', e);
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