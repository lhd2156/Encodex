'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fileStorage } from '@/components/pdf/fileStorage';
import { sharedFilesManager, SHARED_FILES_EVENT, SHARED_FILES_SYNC_TRIGGER, SHARED_FILES_KEY } from '@/lib/sharedFilesManager';

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
  isSharedFile?: boolean;
  isReceivedShare?: boolean;
  sharedWith?: string[]; // List of emails this file is shared with
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
}

export type TabType = 'vault' | 'shared' | 'favorites' | 'recent' | 'trash';

export function useVault(userEmail: string, userName?: string) {
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

  // ─── HELPER: Check if a shared folder is in sender's trash ────────────────
  const isSenderFolderInTrash = useCallback((folderId: string, ownerEmail: string): boolean => {
    try {
      const senderTrashKey = `trash_${ownerEmail}`;
      const senderTrashData = localStorage.getItem(senderTrashKey);
      
      if (!senderTrashData) return false;
      
      const senderTrash = JSON.parse(senderTrashData);
      const isInTrash = senderTrash.some((item: any) => item.id === folderId);
      
      console.log(`🗑️ [TRASH_CHECK] Folder ${folderId} in sender's (${ownerEmail}) trash: ${isInTrash}`);
      return isInTrash;
    } catch (e) {
      console.error('❌ [TRASH_CHECK] Error checking sender trash:', e);
      return false;
    }
  }, []);

  // ─── HELPER: Check if item should be visible based on folder parent trash status ─────
  const shouldShowSharedItem = useCallback((
    item: any, 
    tempDeletedList: string[], 
    ownerEmail: string,
    receiverTrashedList: string[] = []   // ← NEW: receiver's own trashed-share IDs
  ): boolean => {
    console.log(`\n🔍 [VISIBILITY] Checking "${item.fileName}" (ID: ${item.fileId})`);
    console.log(`   Type: ${item.fileType}, Parent: ${item.parentFolderId || 'ROOT'}`);
    console.log(`   tempDeleted(${tempDeletedList.length}), receiverTrashed(${receiverTrashedList.length})`);

    // ── sender trashed it ──
    if (tempDeletedList.includes(item.fileId)) {
      console.log(`   ❌ [VISIBILITY] Item itself is in temp_deleted list (sender trashed it)`);
      return false;
    }

    // ── NEW: receiver already trashed this exact item ──
    if (receiverTrashedList.includes(item.fileId)) {
      console.log(`   ❌ [VISIBILITY] Item itself is in receiver_trashed_shares — blocked at visibility gate`);
      return false;
    }

    // If item is at root level, parent checks below are N/A
    if (!item.parentFolderId) {
      console.log(`   ✅ Root-level item, visible`);
      return true;
    }

    // ── NEW: parent folder is in receiver's trash ──
    if (receiverTrashedList.includes(item.parentFolderId)) {
      console.log(`   ❌ [VISIBILITY] Parent folder ${item.parentFolderId} is in receiver_trashed_shares — item routed to trash`);
      return false;
    }

    // Check if parent folder is in sender's trash
    const parentInSenderTrash = isSenderFolderInTrash(item.parentFolderId, ownerEmail);
    if (parentInSenderTrash) {
      console.log(`   ❌ Parent folder ${item.parentFolderId} is in sender's trash`);
      return false;
    }

    // Check if parent folder is temp deleted
    if (tempDeletedList.includes(item.parentFolderId)) {
      console.log(`   ❌ Parent folder ${item.parentFolderId} is in temp_deleted list`);
      return false;
    }

    console.log(`   ✅ Item is visible`);
    return true;
  }, [isSenderFolderInTrash]);

  // ─── shared-files sync ──────────────────────────────────────────────
  const syncSharedFiles = useCallback(() => {
    console.log('\n🔄 [SYNC] ================== STARTING SYNC ==================');
    console.log('🔄 [SYNC] User:', userEmail);
    const sharedWithMe = sharedFilesManager.getSharedWithMe(userEmail);
    const sharedByMe = sharedFilesManager.getSharedByMe(userEmail);
    console.log('📥 [SYNC] Shared with me:', sharedWithMe.length, 'files');
    console.log('📤 [SYNC] Shared by me:', sharedByMe.length, 'files');

    // Get receiver's permanently hidden shares
    const hiddenKey = `hidden_shares_${userEmail}`;
    const hiddenData = localStorage.getItem(hiddenKey);
    const hiddenList: string[] = hiddenData ? JSON.parse(hiddenData) : [];
    console.log('🚫 [SYNC] Hidden shares:', hiddenList);

    // Get receiver's temporarily-hidden shares (owner moved to trash)
    const tempDeletedKey = `temp_deleted_shares_${userEmail}`;
    const tempDeletedData = localStorage.getItem(tempDeletedKey);
    const tempDeletedList: string[] = tempDeletedData ? JSON.parse(tempDeletedData) : [];
    console.log('⏳ [SYNC] Temporarily deleted shares:', tempDeletedList);
    console.log('⏳ [SYNC] Raw temp_deleted data:', tempDeletedData);

    // Get receiver's trashed shares (moved to trash but share still intact)
    const receiverTrashedKey = `receiver_trashed_shares_${userEmail}`;
    const receiverTrashedData = localStorage.getItem(receiverTrashedKey);
    const receiverTrashedList: string[] = receiverTrashedData ? JSON.parse(receiverTrashedData) : [];
    console.log('🗑️ [SYNC] Receiver trashed shares:', receiverTrashedList);

    // ✅ Sync rename updates into any shared files already sitting in the receiver's trash.
    //    We do NOT add new arrivals to trash here any more — if the parent folder is trashed
    //    the item is simply held in shared_files_global until the folder is restored, at which
    //    point the next sync delivers it into files naturally.
    setDeletedFiles((prev) => {
      console.log(`\n🗑️ [TRASH-SYNC-1] === deletedFiles rename-sync pass ===`);
      console.log(`   Existing trash count: ${prev.length}`);

      return prev.map((deletedFile) => {
        if (!deletedFile.isSharedFile) return deletedFile;

        const updatedShare = sharedWithMe.find(s => s.fileId === deletedFile.id);
        if (updatedShare && updatedShare.fileName !== deletedFile.name) {
          console.log(`🔄 [TRASH-SYNC-1] Rename-sync in trash: "${deletedFile.name}" → "${updatedShare.fileName}"`);
          return { ...deletedFile, name: updatedShare.fileName };
        }
        return deletedFile;
      });
    });

    // 🔍 DEBUG: log every share that is being held back because its folder is trashed
    sharedWithMe.forEach(share => {
      const selfHeld  = receiverTrashedList.includes(share.fileId);
      const parentHeld = share.parentFolderId && receiverTrashedList.includes(share.parentFolderId);
      if (selfHeld || parentHeld) {
        console.log(`⏸️  [PENDING] "${share.fileName}" (${share.fileId}) held — parent folder is in receiver trash. Will appear on restore.`);
      }
    });

    setFiles((prev) => {
      // ── dedup own files by ID (first occurrence wins) ──────────────────
      const seenOwn = new Set<string>();
      let ownFiles = prev.filter((f) => {
        if (f.isSharedFile) return false;
        if (seenOwn.has(f.id)) {
          console.warn(`🔧 [SYNC] Deduping own file "${f.name}" (${f.id}) — duplicate removed`);
          return false;
        }
        seenOwn.add(f.id);
        return true;
      });
      console.log('📁 [SYNC] Own files count:', ownFiles.length);
      
      // Update owner's own files with sharedWith info and sync names
      sharedByMe.forEach((share) => {
        const ownFileIndex = ownFiles.findIndex(f => f.id === share.fileId);
        if (ownFileIndex !== -1) {
          // Get all recipients for this file
          const allRecipients = sharedFilesManager.getShareRecipients(share.fileId);
          console.log(`🔍 [RECIPIENTS] File ${share.fileId} shared with ${allRecipients.length} user(s):`, allRecipients);
          
          // ✅ NEW: Check if file/folder is in sender's trash
          let isInSenderTrash = false;
          try {
            const senderTrashKey = `trash_${userEmail}`;
            const senderTrashData = localStorage.getItem(senderTrashKey);
            if (senderTrashData) {
              const senderTrash = JSON.parse(senderTrashData);
              isInSenderTrash = senderTrash.some((item: any) => item.id === share.fileId);
            }
          } catch (e) {
            console.error('❌ Error checking sender trash:', e);
          }
          
          console.log(`🗑️ [SENDER_TRASH] File ${share.fileId} in sender's trash: ${isInSenderTrash}`);
          
          // ✅ FIX: When sender moves to trash, add to ALL recipients' temp_deleted lists
          if (isInSenderTrash) {
            console.log(`🗑️ [SENDER_TRASH] Adding to recipients' temp_deleted lists`);
            allRecipients.forEach(recipient => {
              const recipientTempDeletedKey = `temp_deleted_shares_${recipient}`;
              const recipientTempDeletedData = localStorage.getItem(recipientTempDeletedKey);
              let recipientTempDeletedList: string[] = recipientTempDeletedData ? JSON.parse(recipientTempDeletedData) : [];
              
              if (!recipientTempDeletedList.includes(share.fileId)) {
                recipientTempDeletedList.push(share.fileId);
                localStorage.setItem(recipientTempDeletedKey, JSON.stringify(recipientTempDeletedList));
                console.log(`   ✅ Added ${share.fileId} to ${recipient}'s temp_deleted`);
              }
            });
          } else {
            // ✅ FIX: When sender restores from trash, remove from ALL recipients' temp_deleted lists
            console.log(`♻️ [SENDER_RESTORE] Removing from recipients' temp_deleted lists`);
            allRecipients.forEach(recipient => {
              const recipientTempDeletedKey = `temp_deleted_shares_${recipient}`;
              const recipientTempDeletedData = localStorage.getItem(recipientTempDeletedKey);
              if (recipientTempDeletedData) {
                let recipientTempDeletedList: string[] = JSON.parse(recipientTempDeletedData);
                const before = recipientTempDeletedList.length;
                recipientTempDeletedList = recipientTempDeletedList.filter(id => id !== share.fileId);
                
                if (before !== recipientTempDeletedList.length) {
                  localStorage.setItem(recipientTempDeletedKey, JSON.stringify(recipientTempDeletedList));
                  console.log(`   ✅ Removed ${share.fileId} from ${recipient}'s temp_deleted`);
                }
              }
            });
          }
          
          // ✅ FIX: Check if ANY recipient has the file in trash (temp_deleted)
          const isInAnyRecipientTrash = allRecipients.some(recipient => {
            const recipientTempDeletedKey = `temp_deleted_shares_${recipient}`;
            const recipientTempDeletedData = localStorage.getItem(recipientTempDeletedKey);
            if (recipientTempDeletedData) {
              const recipientTempDeletedList: string[] = JSON.parse(recipientTempDeletedData);
              return recipientTempDeletedList.includes(share.fileId);
            }
            return false;
          });
          
          // ✅ FIX: Remove sharedWith if all recipients have trashed it
          const activeRecipients = isInAnyRecipientTrash ? [] : allRecipients;
          
          // Check if the shared name conflicts with sender's other files
          const nameFromShare = share.fileName;
          let finalName = nameFromShare;
          
          const hasConflict = ownFiles.some((f, idx) => 
            idx !== ownFileIndex &&
            f.name === nameFromShare && 
            !f.parentFolderId && 
            f.type === share.fileType
          );
          
          if (hasConflict) {
            // Apply conflict resolution for sender's view
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

      // ✅ FIX: Filter active shares with improved visibility logic
      // 🔥 NOW passes receiverTrashedList — this is what was missing and caused dupes
      const activeShares = sharedWithMe.filter(share => {
        const isHidden = hiddenList.includes(share.fileId);

        // Skip if permanently hidden
        if (isHidden) {
          console.log(`   🚫 [SYNC] "${share.fileName}" permanently hidden, skipping`);
          return false;
        }
        
        // 🔥 FIX: pass receiverTrashedList so the gate can block items inside a trashed folder
        const visible = shouldShowSharedItem(share, tempDeletedList, share.ownerId, receiverTrashedList);
        
        return visible;
      });
      
      console.log('\n📋 [SYNC] Active shares after filtering:', activeShares.length);
      activeShares.forEach((s, i) => {
        console.log(`   ${i + 1}. "${s.fileName}" (${s.fileType}) - Parent: ${s.parentFolderId || 'ROOT'}`);
      });
      
      // 🔥 NEW: Separate handling for shares that should go directly to trash
      const sharesToAddToTrash: any[] = [];
      const sharesToAddToFiles: any[] = [];
      
      activeShares.forEach(share => {
        console.log(`\n🔍 [SYNC] Checking share: "${share.fileName}" (ID: ${share.fileId})`);
        console.log(`   Type: ${share.fileType}, Parent: ${share.parentFolderId || 'ROOT'}`);
        console.log(`   Owner: ${share.ownerId}`);
        
        // Check if this item or its parent is in receiver's trash
        const isInReceiverTrash = receiverTrashedList.includes(share.fileId);
        const parentInReceiverTrash = share.parentFolderId && receiverTrashedList.includes(share.parentFolderId);
        
        if (isInReceiverTrash || parentInReceiverTrash) {
          console.log(`   🗑️ GOES TO TRASH: ${isInReceiverTrash ? 'Item itself' : 'Parent'} in receiver's trash`);
          sharesToAddToTrash.push(share);
        } else {
          console.log('   ✅ VISIBLE: Will be shown in files');
          sharesToAddToFiles.push(share);
        }
      });
      
      // Build a map of ALL shared item IDs for hierarchy resolution
      // This includes items already in the files array AND items being added
      const sharedItemIds = new Set(activeShares.map(s => s.fileId));
      
      // Helper function to find parent folder ID from the share entry
      const getSharedParentId = (share: any): string | null => {
        // Use the parentFolderId from the share entry itself
        const parentId = share.parentFolderId;
        
        // If no parent, it's at root level
        if (!parentId) {
          return null;
        }
        
        // Check if the parent is also in the shared list
        if (sharedItemIds.has(parentId)) {
          return parentId; // Parent is shared, maintain hierarchy
        }
        
        // ✅ FIX: Also check if the parent is one of our own folders.
        // This handles the case where User A shares folder "test" with User B,
        // User B uploads a file into "test", which gets auto-shared back to User A.
        // The file's parentFolderId points to "test" — which is in User A's ownFiles,
        // but NOT in sharedItemIds (because User A owns it, not received it as a share).
        if (ownFiles.some(f => f.id === parentId && f.type === 'folder')) {
          return parentId; // Parent is our own folder, maintain hierarchy
        }
        
        return null; // Parent is not shared or owned, place at root
      };
      
      const sharedFileItems: FileItem[] = sharesToAddToFiles
        .map((share) => {
        let displayName = share.fileName;
        
        // Determine the parent folder ID from the share entry
        const parentFolderId = getSharedParentId(share);
        
        console.log(`🔍 [SYNC] Processing share: "${share.fileName}"`, {
          fileId: share.fileId,
          shareParentId: share.parentFolderId,
          resolvedParentId: parentFolderId,
          isInSharedSet: share.parentFolderId ? sharedItemIds.has(share.parentFolderId) : false
        });
        
        
        // Only check conflicts at the SAME LEVEL (same parent)
        const hasConflict = ownFiles.some(f => 
          f.name === share.fileName && 
          f.parentFolderId === parentFolderId &&
          f.type === share.fileType
        );
        
        // Also check if there's already another ACTIVE shared file with the same name at the same level
        const existingSharedConflict = sharesToAddToFiles.filter(s => {
          if (s.fileId === share.fileId) return false;
          if (s.fileName !== share.fileName) return false;
          if (s.fileType !== share.fileType) return false;
          // Check if they have the same parent
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
          // Apply conflict resolution for receiver
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
          
          // Check against both own files AND other ACTIVE shared files at the same level
          while (
            ownFiles.some(f => f.name === candidateName && f.parentFolderId === parentFolderId && f.type === share.fileType) ||
            activeShares.some(s => {
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
        
        return {
          id: share.fileId,
          name: displayName,
          size: share.fileSize,
          type: share.fileType,
          createdAt: share.originalCreatedAt,
          parentFolderId: parentFolderId, // ✅ FIX: Preserve folder hierarchy
          sharedBy: share.ownerId,
          sharedByName: share.ownerName,
          owner: share.ownerId,
          ownerName: share.ownerName,
          isSharedFile: true,
          isReceivedShare: true as any,
          isFavorite: false,
        };
      });
      
      console.log('✅ [SYNC] Final shared file items:', sharedFileItems.length);
      
      // ── sharesToAddToTrash is dead code now ──────────────────────────────
      // shouldShowSharedItem blocks any item (or child of a trashed folder) from
      // entering activeShares, so sharesToAddToTrash is always [].
      // New files that arrive while the folder is trashed are simply held in
      // shared_files_global and delivered on the next sync after restore.
      if (sharesToAddToTrash.length > 0) {
        // Should never happen — log loudly if it does so we can investigate.
        console.warn(`⚠️  [TRASH-SYNC-2] UNEXPECTED: sharesToAddToTrash is non-empty (${sharesToAddToTrash.length} items). These should have been filtered by shouldShowSharedItem.`);
        sharesToAddToTrash.forEach(s => console.warn(`   → "${s.fileName}" (${s.fileId}) parent=${s.parentFolderId || 'ROOT'}`));
      } else {
        console.log(`✅ [TRASH-SYNC-2] sharesToAddToTrash is empty as expected — pending items held until restore.`);
      }
      
      // ✅ FIX: deduplicate – if own file and shared file share the same ID, own file wins
      const ownFileIds = new Set(ownFiles.map(f => f.id));
      const uniqueSharedFiles = sharedFileItems.filter(sf => !ownFileIds.has(sf.id));
      console.log(`📊 [SYNC] After dedup: ${ownFiles.length} own + ${uniqueSharedFiles.length} shared (${sharedFileItems.length - uniqueSharedFiles.length} dupes removed)`);
      
      // Add share info to all files
      const combinedFiles = [...ownFiles, ...uniqueSharedFiles];
      const finalFiles = combinedFiles.map(file => {
        if (file.isReceivedShare) return file;
        const sharedWith = sharedFilesManager.getShareRecipients(file.id);
        return {
          ...file,
          sharedWith: sharedWith.length > 0 ? sharedWith : undefined
        };
      });
      
      console.log(`📊 [SYNC] Final file count: ${finalFiles.length} (${ownFiles.length} own + ${uniqueSharedFiles.length} shared)`);
      console.log('🔄 [SYNC] ================== SYNC COMPLETE ==================\n');
      
      return finalFiles;
    });
  }, [userEmail, shouldShowSharedItem, isSenderFolderInTrash]);

  // 1) Initial load (own files + shared files)
  useEffect(() => {
    if (!userEmail) return;

    console.log('🚀 [INIT] Loading vault for user:', userEmail);
    const savedFiles = localStorage.getItem(`vault_${userEmail}`);
    const savedTrash = localStorage.getItem(`trash_${userEmail}`);
    const savedStorage = localStorage.getItem(`storage_${userEmail}`);

    let loadedFiles: FileItem[] = [];
    if (savedFiles) {
      const parsed = JSON.parse(savedFiles);
      loadedFiles = parsed.map((f: any) => ({ ...f, createdAt: new Date(f.createdAt) }));
      console.log('📂 [INIT] Loaded files:', loadedFiles.length);
    }

    setFiles(loadedFiles);

    if (savedTrash) {
      const parsed = JSON.parse(savedTrash);
      const deletedItems = parsed.map((f: any) => ({ ...f, createdAt: new Date(f.createdAt) }));
      setDeletedFiles(deletedItems);
      console.log('🗑️ [INIT] Loaded deleted files:', deletedItems.length);
    }
    if (savedStorage) {
      setStorageUsed(parseInt(savedStorage, 10));
    }

    hasLoaded.current = true;
    syncSharedFiles();
  }, [userEmail, syncSharedFiles]);

  // 2) Listen for the custom same-tab event
  useEffect(() => {
    const handler = () => {
      console.log('🔔 [EVENT] Received same-tab SHARED_FILES_EVENT');
      syncSharedFiles();
    };
    window.addEventListener(SHARED_FILES_EVENT, handler);
    return () => window.removeEventListener(SHARED_FILES_EVENT, handler);
  }, [syncSharedFiles]);

  // 3) Listen for the native cross-tab `storage` event
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'shared_files_global' || e.key === SHARED_FILES_SYNC_TRIGGER) {
        console.log('🔔 [EVENT] Received cross-tab storage event for key:', e.key);
        syncSharedFiles();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [syncSharedFiles]);

  // ─── persist own files (GUARDED) ────────────────────────────────────
  useEffect(() => {
    if (!hasLoaded.current || !userEmail) return;
    // Dedup by ID before writing — first occurrence wins
    const seen = new Set<string>();
    const ownFiles = files.filter((f) => {
      if (f.isSharedFile) return false;
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
    try {
      const key = `vault_${userEmail}`;
      const serialized = JSON.stringify(ownFiles);
      console.debug('[useVault] Persisting vault key', key, 'len', serialized.length, 'hasLoaded', hasLoaded.current);
      localStorage.setItem(key, serialized);
    } catch (e) {
      console.error('[useVault] Failed persisting vault data', e);
    }
  }, [files, userEmail]);

  useEffect(() => {
    if (!hasLoaded.current || !userEmail) return;
    try {
      const key = `trash_${userEmail}`;
      const serialized = JSON.stringify(deletedFiles);
      console.debug('[useVault] Persisting trash key', key, 'len', serialized.length, 'hasLoaded', hasLoaded.current);
      localStorage.setItem(key, serialized);
    } catch (e) {
      console.error('[useVault] Failed persisting trash data', e);
    }
  }, [deletedFiles, userEmail]);

  useEffect(() => {
    if (!hasLoaded.current || !userEmail) return;
    try {
      const key = `storage_${userEmail}`;
      const value = storageUsed.toString();
      console.debug('[useVault] Persisting storage key', key, 'value', value, 'hasLoaded', hasLoaded.current);
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('[useVault] Failed persisting storage data', e);
    }
  }, [storageUsed, userEmail]);

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
    
    // ✅ FIX: Check if uploading to a shared folder and prepare auto-share
    let targetParentId = parentId;
    let shareOwner: string | null = null;
    let shareOwnerName: string | null = null;
    let shareRecipients: string[] = [];
    let sharedParentFolderId: string | null = null; // ✅ FIX: Track the actual shared folder ID
    
    // Check if we're uploading to a shared folder
    if (targetParentId) {
      const parentFolder = files.find(f => f.id === targetParentId);
      if (parentFolder && parentFolder.isSharedFile && parentFolder.owner && parentFolder.owner !== userEmail) {
        // ✅ FIX: Allow upload – auto-share new files back to the folder owner
        shareRecipients = [parentFolder.owner];
        shareOwner = userEmail;
        shareOwnerName = userName || userEmail;
        sharedParentFolderId = targetParentId; // ✅ CRITICAL: Save the shared folder ID
        console.log(`📤 [UPLOAD] Uploading to RECEIVED shared folder "${parentFolder.name}" (ID: ${targetParentId}) - will auto-share back to owner:`, parentFolder.owner);
      }
      
      // Check if we're uploading to OUR OWN shared folder
      if (parentFolder && parentFolder.owner === userEmail) {
        shareRecipients = sharedFilesManager.getShareRecipients(targetParentId);
        if (shareRecipients.length > 0) {
          shareOwner = userEmail;
          shareOwnerName = userName || userEmail;
          sharedParentFolderId = targetParentId; // ✅ Save folder ID for our own shared folder too
          console.log(`📤 [UPLOAD] Uploading to shared folder "${parentFolder.name}" - will auto-share with:`, shareRecipients);
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
            owner: userEmail,
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
        owner: userEmail,
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
    setStorageUsed((prev) => prev + filesArray.reduce((acc, f) => acc + f.size, 0));
    setUploadProgress(newProgress);

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
      shareRecipients.forEach(email => {
        try {
          const rtKey = `receiver_trashed_shares_${email}`;
          const rtRaw = localStorage.getItem(rtKey);
          const rtList: string[] = rtRaw ? JSON.parse(rtRaw) : [];
          console.log(`🔍 [UPLOAD] receiver_trashed_shares for ${email}: ${JSON.stringify(rtList)}`);
          console.log(`   Target folder ${sharedParentFolderId} in their trash? ${rtList.includes(sharedParentFolderId!)}`);
        } catch (e) {
          console.error(`❌ [UPLOAD] Failed to read receiver_trashed_shares for ${email}`, e);
        }
      });
      
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
            // This ensures files uploaded to a shared folder appear in the correct location for the recipient
            const parentIdForShare = sharedParentFolderId;
            
            console.log(`📤 [UPLOAD] Sharing "${newFile.name}" with parent: ${parentIdForShare}`);
            
            await sharedFilesManager.shareFile(
              newFile.id,
              newFile.name,
              newFile.size,
              newFile.type,
              shareOwner,
              shareOwnerName,
              recipient,
              newFile.createdAt,
              parentIdForShare, // ✅ FIX: Use the shared folder ID, not the local parent ID
              fileData
            );
            
            console.log(`✅ [UPLOAD] Auto-shared "${newFile.name}" with ${recipient} (parent: ${parentIdForShare})`);
          } catch (error) {
            console.error(`❌ [UPLOAD] Failed to auto-share "${newFile.name}" with ${recipient}:`, error);
          }
        }
      }
      
      // Trigger sync
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
      sharedFilesManager.triggerSync();
    }

    setTimeout(() => setUploadProgress([]), 500);
  };

  // ─── folder ─────────────────────────────────────────────────────────
  const handleCreateFolder = async (folderName: string) => {
    if (!ensureUser('handleCreateFolder')) return;
    const uniqueName = makeUniqueName(folderName, currentFolderId, true, false);
    const newFolder: FileItem = {
      id: Math.random().toString(36).substring(2, 11),
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

    // ✅ FIX: Auto-share the new folder if parent is shared
    let shareRecipients: string[] = [];
    let shareOwner: string | undefined;
    let shareOwnerName: string | undefined;
    let sharedParentFolderId: string | null = null;

    if (currentFolderId) {
      const parentFolder = files.find(f => f.id === currentFolderId && f.type === 'folder');
      
      if (parentFolder) {
        // Check if parent is a received shared folder
        if (parentFolder.isSharedFile && parentFolder.owner && parentFolder.owner !== userEmail) {
          // This is a received share - we need to share back to the original owner
          shareRecipients = [parentFolder.owner];
          shareOwner = userEmail;
          shareOwnerName = userName;
          sharedParentFolderId = currentFolderId;
          
          console.log(`📤 [CREATE_FOLDER] Parent is shared folder from ${parentFolder.owner}, will auto-share back`);
        } else {
          // Check if parent is owned by us and shared with others
          const recipients = sharedFilesManager.getShareRecipients(currentFolderId);
          if (recipients.length > 0) {
            shareRecipients = recipients;
            shareOwner = userEmail;
            shareOwnerName = userName;
            sharedParentFolderId = currentFolderId;
            
            console.log(`📤 [CREATE_FOLDER] Parent is our shared folder, will auto-share with ${recipients.length} recipients`);
          }
        }
      }
    }

    // Auto-share the new folder if needed
    if (shareRecipients.length > 0 && shareOwner && shareOwnerName) {
      console.log(`📤 [CREATE_FOLDER] Auto-sharing new folder "${uniqueName}" with ${shareRecipients.length} recipients`);
      
      for (const recipient of shareRecipients) {
        try {
          await sharedFilesManager.shareFile(
            newFolder.id,
            newFolder.name,
            newFolder.size,
            newFolder.type,
            shareOwner,
            shareOwnerName,
            recipient,
            newFolder.createdAt,
            sharedParentFolderId, // Preserve hierarchy
            undefined // No file data for folders
          );
          
          console.log(`✅ [CREATE_FOLDER] Auto-shared "${uniqueName}" with ${recipient} (parent: ${sharedParentFolderId})`);
        } catch (error) {
          console.error(`❌ [CREATE_FOLDER] Failed to auto-share "${uniqueName}" with ${recipient}:`, error);
        }
      }
      
      // Trigger sync
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
      sharedFilesManager.triggerSync();
    }
  };

  // ─── rename ─────────────────────────────────────────────────────────
  const handleRenameFile = (id: string, newName: string) => {
    // First check if file is in trash
    const trashFile = deletedFiles.find((f) => f.id === id);
    const activeFile = files.find((f) => f.id === id);
    
    const file = trashFile || activeFile;
    if (!file) {
      console.error('[RENAME] File not found in files or deletedFiles:', id);
      return;
    }
    if (!ensureUser('handleRenameFile')) return;

    const isInTrash = !!trashFile;
    const isShared = sharedFilesManager.getShareRecipients(id).length > 0;
    const isOwner = file.owner === userEmail;
    const isReceivedShare = file.isSharedFile && file.owner !== userEmail;

    console.log(`[RENAME] Starting rename for file ${id}:`, {
      currentName: file.name,
      newName,
      isSharedFile: file.isSharedFile,
      owner: file.owner,
      currentUser: userEmail,
      isInTrash,
      isShared,
      isOwner,
      isReceivedShare,
    });

    // CASE 1: This is a RECEIVED shared file (receiver is renaming)
    if (isReceivedShare) {
      console.log(`[RENAME] CASE 1: Receiver renaming shared file (in trash: ${isInTrash})`);
      
      try {
        const success = sharedFilesManager.updateSharedFileName(id, newName);
        console.log(`[RENAME] SharedFilesManager update result: ${success}`);
        
        if (success) {
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
        } else {
          console.error('[RENAME] Failed to update shared file name in metadata');
        }
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
        
        // ONLY propagate rename if file is NOT in trash
        if (isShared) {
          console.log(`[RENAME] 📡 File is shared - will propagate to receivers`);
          try {
            const updateSuccess = sharedFilesManager.updateSharedFileName(id, uniqueName);
            console.log(`[RENAME] SharedFilesManager update result: ${updateSuccess}`);
            
            if (updateSuccess) {
              console.log(`✏️ [RENAME] Sender renamed shared file ${id} to: ${uniqueName} (propagated to receivers)`);
              
              // Trigger sync so receivers see the change
              setTimeout(() => {
                console.log(`[RENAME] 🔔 Triggering cross-tab sync for rename propagation`);
                window.dispatchEvent(new Event(SHARED_FILES_EVENT));
              }, 100);
            } else {
              console.error('[RENAME] Failed to update shared metadata');
            }
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

// ─── delete ─────────────────────────────────────────────────────
  const handleDeleteFile = (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;
    
    console.log('🗑️ [DELETE] Starting delete for file:', { id, name: file.name, isSharedFile: file.isSharedFile, owner: file.owner });
    
    // If this is a received shared file/folder, allow the recipient to delete it locally
    if (file.isSharedFile && file.owner && file.owner !== userEmail) {
      if (!ensureUser('handleDeleteFile')) return;

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
        console.log(`🗑️ [DELETE] Deleting shared folder with ${descendants.length} items inside`);
      }
      
      
      // ✅ NEW FIX: DON'T unshare - instead add to receiver_trashed_shares
      // This keeps the share relationship intact so new content goes into the same folder
      try {
        const receiverTrashedKey = `receiver_trashed_shares_${userEmail}`;
        const existingData = localStorage.getItem(receiverTrashedKey);
        let receiverTrashedList: string[] = existingData ? JSON.parse(existingData) : [];
        
        for (const item of itemsToDelete) {
          if (!receiverTrashedList.includes(item.id)) {
            receiverTrashedList.push(item.id);
            console.log(`   ✅ Added ${item.id} ("${item.name}") to receiver_trashed_shares`);
          }
        }
        
        localStorage.setItem(receiverTrashedKey, JSON.stringify(receiverTrashedList));
        console.log(`✅ [DELETE] Added ${itemsToDelete.length} items to receiver_trashed_shares (share relationship intact)`);
      } catch (e) {
        console.error('❌ [DELETE] Failed to add to receiver_trashed_shares', e);
      }

      // ✅ FIX 3: Enhanced tombstone creation with detailed logging
      console.log('🗑️ [DELETE] Creating tombstones for receiver-deleted shared files:', {
        itemCount: itemsToDelete.length,
        items: itemsToDelete.map(i => ({ id: i.id, name: i.name, type: i.type }))
      });

      const tombstones = itemsToDelete.map(item => {
        const tombstone = {
          id: item.id,
          name: item.name,
          size: item.size,
          type: item.type,
          createdAt: new Date(),
          parentFolderId: item.parentFolderId, // Preserve hierarchy in trash
          originalParentId: item.parentFolderId,
          originalSharedId: item.id, // ✅ CRITICAL: Mark this as a shared file tombstone
          sharedMeta: {
            ownerId: item.owner,
            ownerName: (item as any).ownerName || undefined,
            fileSize: item.size,
            fileType: item.type,
            originalCreatedAt: item.createdAt,
          } as any,
        } as any;
        
        console.log(`   📋 Tombstone created for "${item.name}":`, {
          id: tombstone.id,
          hasSharedMeta: !!tombstone.sharedMeta,
          hasOriginalSharedId: !!tombstone.originalSharedId,
          parentFolderId: tombstone.parentFolderId
        });
        
        return tombstone;
      });

      setFiles((prev) => prev.filter((f) => !itemsToDelete.some(d => d.id === f.id)));
      setDeletedFiles((prev) => [...prev, ...tombstones]);

      // Calculate total size
      const totalSize = itemsToDelete.reduce((sum, item) => {
        return sum + (item.type === 'file' ? item.size : 0);
      }, 0);
      
      setStorageUsed((prev) => Math.max(0, prev - totalSize));

      console.log('✅ [DELETE] Receiver tombstones created in trash:', tombstones.length);

      // 🔍 DEBUG: dump the final receiver_trashed_shares so we can verify it persisted
      try {
        const debugRtKey = `receiver_trashed_shares_${userEmail}`;
        const debugRtRaw = localStorage.getItem(debugRtKey);
        console.log(`🔍 [DELETE] Final receiver_trashed_shares for ${userEmail}: ${debugRtRaw}`);
      } catch (e) { /* ignore */ }

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

    // ✅ FIX: Process ALL files being deleted (including folder children)
    toDelete.forEach(item => {
      const isShared = sharedFilesManager.getShareRecipients(item.id).length > 0;
      console.log('🗑️ [DELETE] SENDER deleting file, isShared:', isShared, 'file:', item.name);
      
      if (isShared && item.owner === userEmail) {
        try {
          const recipients = sharedFilesManager.getShareRecipients(item.id);
          console.log('⏳ [DELETE] Marking file as temporarily deleted for receivers:', recipients);
          
          recipients.forEach(recipientEmail => {
            const key = `temp_deleted_shares_${recipientEmail}`;
            const existing = localStorage.getItem(key);
            const deletedList = existing ? JSON.parse(existing) : [];
            if (!deletedList.includes(item.id)) {
              deletedList.push(item.id);
              localStorage.setItem(key, JSON.stringify(deletedList));
              console.log(`⏳ [DELETE] Added ${item.id} to temp_deleted list for ${recipientEmail}`);
            }
          });
          
          console.log(`✅ [DELETE] Temporarily hiding shared file ${item.id} from receivers`);
        } catch (e) {
          console.error('❌ [DELETE] Failed to mark shared file as temporarily deleted', e);
        }
      }
    });

    // Trigger sync for receivers ONCE after processing all files
    const hasSharedFiles = toDelete.some(item => 
      sharedFilesManager.getShareRecipients(item.id).length > 0 && item.owner === userEmail
    );
    
    if (hasSharedFiles) {
      try {
        sharedFilesManager.triggerSync();
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        console.log('🔔 [DELETE] Triggered sync for receivers');
      } catch (e) {
        console.error('Failed to trigger storage event', e);
      }
    }

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

    setDeletedFiles([...deletedFiles, ...deletedItems]);
    setFiles(files.filter((f) => !toDelete.some(d => d.id === f.id)));
    setSelectedFiles(new Set());
    console.log('✅ [DELETE] File moved to trash');
  };

  // ─── restore ────────────────────────────────────────────────────────
  const handleRestoreFile = (id: string) => {
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
      if (file.owner === userEmail) {
        const recipients = sharedFilesManager.getShareRecipients(id);
        console.log('♻️ [RESTORE] SENDER restoring, checking if shared. Recipients:', recipients);
        
        if (recipients.length > 0) {
          console.log('📤 [RESTORE] Auto re-sharing file to receivers after restore');
          console.log(`📦 [RESTORE] Total items to restore: ${toRestore.length}`);
          
          // ✅ CRITICAL FIX: Remove ALL items (parent + descendants) from temp_deleted
          recipients.forEach((recipientEmail) => {
            const key = `temp_deleted_shares_${recipientEmail}`;
            const existing = localStorage.getItem(key);
            
            if (existing) {
              const deletedList = JSON.parse(existing);
              console.log(`🔍 [RESTORE] Before cleanup for ${recipientEmail}:`, deletedList);
              
              // Remove ALL restored items from the temp_deleted list
              const idsToRemove = toRestore.map(item => item.id);
              const filtered = deletedList.filter((fileId: string) => !idsToRemove.includes(fileId));
              
              console.log(`🧹 [RESTORE] Removing ${idsToRemove.length} IDs:`, idsToRemove);
              console.log(`🔍 [RESTORE] After cleanup:`, filtered);
              
              if (filtered.length > 0) {
                localStorage.setItem(key, JSON.stringify(filtered));
              } else {
                localStorage.removeItem(key);
              }
              
              console.log(`✅ [RESTORE] Cleaned temp_deleted list for ${recipientEmail}`);
            }
          });

          // Notify other tabs/components
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
          console.log('✅ [RESTORE] Auto re-shared file to all receivers');
          
          // Force storage event for cross-tab sync
          try {
            sharedFilesManager.triggerSync();
          } catch (e) {
            console.error('Failed to trigger storage event', e);
          }
        }
      }
    } catch (e) {
      console.error('❌ [RESTORE] Failed to restore shared file visibility', e);
    }

    // If any of the toRestore items are tombstones for a previously-received
    // shared file (deleted by the recipient), try to re-create the share
    // entry so the restored item behaves like a shared file again.
    try {
      for (const item of toRestore) {
        if ((item as any).sharedMeta && (item as any).sharedMeta.ownerId) {
          const meta = (item as any).sharedMeta;
          console.log('♻️ [RESTORE] RECEIVER restoring tombstone, recreating share entry');
          try {
            sharedFilesManager.shareFile(
              item.id,
              item.name,
              item.size || 0,
              item.type || 'file',
              meta.ownerId,
              meta.ownerName || meta.ownerId,
              userEmail,
              new Date(meta.originalCreatedAt || item.createdAt)
            );
            window.dispatchEvent(new Event(SHARED_FILES_EVENT));
            console.log('✅ [RESTORE] Recreated share entry for receiver');
          } catch (e) {
            console.error('❌ [RESTORE] Failed to recreate share on restore', e);
          }
        }
      }
    } catch (e) {
      console.error('❌ [RESTORE] Failed in tombstone recreation', e);
    }

    // ── RECEIVER restoring a shared folder: unlock pending items ────────────
    // Strip the restored IDs out of receiver_trashed_shares.  Any new files the
    // sender added while the folder was trashed are sitting in shared_files_global
    // doing nothing.  Once we remove the folder from this list the next sync will
    // see them as visible and deliver them into files naturally.
    try {
      const isReceiverRestoringShared = toRestore.some(item =>
        (item as any).sharedMeta || (item as any).originalSharedId ||
        (item.isSharedFile && item.owner && item.owner !== userEmail)
      );

      if (isReceiverRestoringShared) {
        const rtKey = `receiver_trashed_shares_${userEmail}`;
        const rtRaw = localStorage.getItem(rtKey);

        if (rtRaw) {
          const rtList: string[] = JSON.parse(rtRaw);
          const idsBeingRestored = new Set(toRestore.map(i => (i as any).originalSharedId || i.id));
          console.log(`♻️  [RESTORE] Cleaning receiver_trashed_shares. Before: ${JSON.stringify(rtList)}`);
          console.log(`   IDs being restored: ${JSON.stringify([...idsBeingRestored])}`);

          const cleaned = rtList.filter(id => !idsBeingRestored.has(id));

          if (cleaned.length > 0) {
            localStorage.setItem(rtKey, JSON.stringify(cleaned));
          } else {
            localStorage.removeItem(rtKey);
          }

          console.log(`♻️  [RESTORE] After cleanup: ${JSON.stringify(cleaned)}`);
          console.log(`♻️  [RESTORE] Triggering sync — pending items will now be delivered.`);

          // Kick sync so pending shared items flow into files
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
          sharedFilesManager.triggerSync();
        }
      }
    } catch (e) {
      console.error('❌ [RESTORE] Failed to clean receiver_trashed_shares', e);
    }

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

    setFiles((prev) => {
      const existingIds = new Set(prev.map(f => f.id));
      const toAdd = restoredItems.filter(f => !existingIds.has(f.id));
      return [...prev, ...toAdd];
    });
    setDeletedFiles((prev) => prev.filter((f) => !toRestore.some(r => r.id === f.id)));
    setSelectedFiles(new Set());
    console.log('✅ [RESTORE] File restored from trash');
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
      !!(file as any).sharedMeta ||  // Tombstone has sharedMeta
      !!(file as any).originalSharedId ||  // Tombstone has originalSharedId
      (file.isSharedFile && file.owner && file.owner !== userEmail);  // Active shared file

    console.log('💥 [PERM_DELETE] Checking if receiver deleting shared file:', {
      fileId: file.id,
      fileName: file.name,
      hasSharedMeta: !!(file as any).sharedMeta,
      hasOriginalSharedId: !!(file as any).originalSharedId,
      isSharedFile: file.isSharedFile,
      fileOwner: file.owner,
      currentUser: userEmail,
      ownerMismatch: file.owner !== userEmail,
      finalDecision: isReceiverDeletingSharedFile
    });

    // SCENARIO 1: Receiver permanently deleting a shared item
    // Add to permanent hidden list so it never comes back until re-shared
    if (isReceiverDeletingSharedFile) {
      console.log('💥 [PERM_DELETE] RECEIVER permanently deleting shared file');
      
      try {
        const hiddenKey = `hidden_shares_${userEmail}`;
        const existingHidden = localStorage.getItem(hiddenKey);
        const hiddenList: string[] = existingHidden ? JSON.parse(existingHidden) : [];
        
        // ✅ FIX 4: Enhanced permanent delete logging
        toDelete.forEach(item => {
          const itemId = (item as any).originalSharedId || item.id;
          console.log(`   🔍 Processing item for hiding:`, {
            itemName: item.name,
            itemId: item.id,
            originalSharedId: (item as any).originalSharedId,
            useId: itemId,
            alreadyHidden: hiddenList.includes(itemId)
          });
          
          if (!hiddenList.includes(itemId)) {
            hiddenList.push(itemId);
            console.log(`   ✅ Added ${itemId} ("${item.name}") to permanent hidden list`);
          } else {
            console.log(`   ⏭️ ${itemId} ("${item.name}") already in hidden list`);
          }
        });
        
        console.log(`🚫 [PERM_DELETE] Final hidden list (${hiddenList.length} items):`, hiddenList);
        
        localStorage.setItem(hiddenKey, JSON.stringify(hiddenList));
        console.log('✅ [PERM_DELETE] Shared items permanently hidden');
        
        // ✅ ALSO remove from temp_deleted list (cleanup)
        const tempDeletedKey = `temp_deleted_shares_${userEmail}`;
        const existingTempDeleted = localStorage.getItem(tempDeletedKey);
        if (existingTempDeleted) {
          const tempDeletedList = JSON.parse(existingTempDeleted);
          const idsToRemove = toDelete.map(item => (item as any).originalSharedId || item.id);
          const filtered = tempDeletedList.filter((id: string) => !idsToRemove.includes(id));
          
          if (filtered.length > 0) {
            localStorage.setItem(tempDeletedKey, JSON.stringify(filtered));
          } else {
            localStorage.removeItem(tempDeletedKey);
          }
          console.log('🧹 [PERM_DELETE] Cleaned temp_deleted list');
        }
        
        // ✅ NEW FIX: Remove share entries from registry when receiver permanently deletes
        console.log('🗑️ [PERM_DELETE] Removing share entries from registry...');
        toDelete.forEach(item => {
          const shareId = (item as any).originalSharedId || item.id;
          const recipients = sharedFilesManager.getShareRecipients(shareId);
          
          if (recipients.includes(userEmail)) {
            console.log(`   🗑️ Unsharing ${item.name} (${shareId}) from ${userEmail}`);
            sharedFilesManager.unshareFile(shareId, userEmail);
          }
        });
        console.log('✅ [PERM_DELETE] Share entries removed from registry');

        // Also remove from receiver_trashed_shares
        try {
          const receiverTrashedKey = `receiver_trashed_shares_${userEmail}`;
          const existingData = localStorage.getItem(receiverTrashedKey);
          if (existingData) {
            let receiverTrashedList: string[] = JSON.parse(existingData);
            const idsToRemove = toDelete.map(item => (item as any).originalSharedId || item.id);
            receiverTrashedList = receiverTrashedList.filter(id => !idsToRemove.includes(id));
            localStorage.setItem(receiverTrashedKey, JSON.stringify(receiverTrashedList));
            console.log('✅ [PERM_DELETE] Cleaned receiver_trashed_shares');
          }
        } catch (e) {
          console.error('❌ [PERM_DELETE] Failed to clean receiver_trashed_shares', e);
        }
        
        // Trigger sync to update all views (including sender's UI)
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        sharedFilesManager.triggerSync();
      } catch (e) {
        console.error('❌ [PERM_DELETE] Failed to add to hidden list', e);
      }
      
      // Remove from deleted files
      setDeletedFiles(deletedFiles.filter((f) => !toDelete.some(d => d.id === f.id)));
      setSelectedFiles(new Set());
      console.log('✅ [PERM_DELETE] Receiver permanently deleted shared items');
      return;
    }

    // SCENARIO 2: If owner is permanently deleting, remove all shares permanently
    // so recipients no longer see the item (must re-share manually).
    try {
      if (file.owner === userEmail) {
        const recipients = sharedFilesManager.getShareRecipients(id);
        console.log('💥 [PERM_DELETE] SENDER permanently deleting shared file. Recipients:', recipients);
        
        if (recipients.length > 0) {
          console.log('🚫 [PERM_DELETE] Removing all shares permanently');
          
          // ✅ FIX: Remove ALL descendants from temp_deleted lists, not just the parent
          const allIdsToClean = toDelete.map(item => item.id);
          
          recipients.forEach(recipientEmail => {
            const key = `temp_deleted_shares_${recipientEmail}`;
            const existing = localStorage.getItem(key);
            
            if (existing) {
              const deletedList = JSON.parse(existing);
              const filtered = deletedList.filter((fileId: string) => !allIdsToClean.includes(fileId));
              
              if (filtered.length > 0) {
                localStorage.setItem(key, JSON.stringify(filtered));
              } else {
                localStorage.removeItem(key);
              }
            }
            console.log(`🚫 [PERM_DELETE] Cleaned temp_deleted for ${recipientEmail}`);
          });
          
          // Remove share entries for ALL items
          toDelete.forEach(item => {
            sharedFilesManager.removeAllSharesForFile(item.id);
          });
          console.log('✅ [PERM_DELETE] All share entries removed');
          
          window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        }
      }
    } catch (e) {
      console.error('❌ [PERM_DELETE] Failed to remove shares on permanent delete', e);
    }

    for (const item of toDelete) {
      if (item.type === 'file') {
        try {
          await fileStorage.deleteFile(item.id);
          console.log('🗑️ [PERM_DELETE] Deleted file data from storage:', item.id);
        } catch (error) {
          console.error('❌ [PERM_DELETE] Failed to delete file from storage:', error);
        }
      }
    }

    setDeletedFiles(deletedFiles.filter((f) => !toDelete.some(d => d.id === f.id)));
    setStorageUsed((prev) => Math.max(0, prev - toDelete.reduce((acc, item) => acc + (item.size || 0), 0)));
    setSelectedFiles(new Set());
    console.log('✅ [PERM_DELETE] File permanently deleted');
  };

  // ─── move ───────────────────────────────────────────────────────────
  const handleMoveToFolder = (fileId: string, targetFolderId: string | null) => {
    if (!ensureUser('handleMoveToFolder')) return;
    
    const file = files.find(f => f.id === fileId);
    const targetFolder = targetFolderId ? files.find(f => f.id === targetFolderId) : null;
    
    if (!file) {
      console.error(`❌ [MOVE] File not found: ${fileId}`);
      return;
    }
    
    // ✅ GUARD: Prevent shared files from going into unshared folders
    const fileRecipients = sharedFilesManager.getShareRecipients(fileId);
    const isFileShared = fileRecipients.length > 0;
    const targetIsShared = targetFolderId ? sharedFilesManager.getShareRecipients(targetFolderId).length > 0 : false;
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
        console.log(`🔄 [MOVE] Target is a received folder, will share with owner: \${folderOwner}`);
      }
      
      // Also share with any other recipients of this folder
      const folderRecipients = sharedFilesManager.getShareRecipients(targetFolderId);
      peopleToShareWith = [...new Set([...peopleToShareWith, ...folderRecipients])];
      
      // Remove current user from the list
      peopleToShareWith = peopleToShareWith.filter(email => email !== userEmail);
      
      if (peopleToShareWith.length > 0) {
        console.log(`🎯 [MOVE] Target folder is shared, will share file with ${peopleToShareWith.length} user(s):`, peopleToShareWith);
        
        // 🔍 DEBUG: dump the receiver_trashed_shares for each target so we can see if they have the folder trashed
        peopleToShareWith.forEach(email => {
          try {
            const rtKey = `receiver_trashed_shares_${email}`;
            const rtRaw = localStorage.getItem(rtKey);
            const rtList: string[] = rtRaw ? JSON.parse(rtRaw) : [];
            console.log(`🔍 [MOVE] receiver_trashed_shares for ${email}: ${JSON.stringify(rtList)}`);
            console.log(`   Target folder ${targetFolderId} in their trash? ${rtList.includes(targetFolderId!)}`);
          } catch (e) {
            console.error(`❌ [MOVE] Failed to read receiver_trashed_shares for ${email}`, e);
          }
        });

        // Share the file with each person (including folder owner if receiver is moving file in)
        // Wrap in async IIFE to handle await
        (async () => {
          for (const recipientEmail of peopleToShareWith) {
            try {
              // Get file data if it's a file (not folder)
              let fileData: Blob | undefined = undefined;
              if (file.type === 'file') {
                try {
                  fileData = await fileStorage.getFile(file.id);
                  console.log(`📦 [MOVE] Got file data for auto-share: ${file.name}`);
                } catch (error) {
                  console.error(`❌ [MOVE] Failed to get file data for ${file.name}:`, error);
                }
              }
              
              const success = await sharedFilesManager.shareFile(
                file.id,
                newName,  // Use the new name (with (1) suffix if needed)
                file.size,
                file.type,
                userEmail,  // Current user is the owner/sender
                userName || userEmail,
                recipientEmail,
                file.createdAt,
                targetFolderId,  // Set parent to the shared folder
                fileData
              );
              
              if (success) {
                console.log(`✅ [MOVE] Auto-shared "${newName}" with ${recipientEmail}`);
              } else {
                console.log(`ℹ️ [MOVE] "${newName}" already shared with ${recipientEmail}`);
              }
            } catch (error) {
              console.error(`❌ [MOVE] Failed to auto-share with ${recipientEmail}:`, error);
            }
          }
          
          // Trigger sync after auto-sharing
          sharedFilesManager.triggerSync();
          console.log(`🔔 [MOVE] Triggered sync after auto-sharing`);
        })();
      }
    }

    
    // ✅ If this file was already being shared, update the shared file entries too
    const sharedWith = sharedFilesManager.getShareRecipients(fileId);
    if (sharedWith.length > 0) {
      console.log(`📤 [MOVE] File is shared with ${sharedWith.length} recipient(s), updating shared entries...`);
      
      // Update each share entry with new parentFolderId AND new name
      const allShares = sharedFilesManager.getAllShares();
      const updatedShares = allShares.map(share => {
        if (share.fileId === fileId) {
          console.log(`🔄 [MOVE] Updating share entry for ${share.recipientEmail}`);
          return { ...share, fileName: newName, parentFolderId: targetFolderId };
        }
        return share;
      });
      
      // Save updated shares
      try {
        localStorage.setItem(SHARED_FILES_KEY, JSON.stringify(updatedShares));
        sharedFilesManager.triggerSync();
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
      const updateChildrenRecursive = (parentId: string) => {
        const children = files.filter(f => f.parentFolderId === parentId);
        console.log(`🔍 [MOVE] Found ${children.length} children in folder ${parentId}`);
        children.forEach(child => {
          const childSharedWith = sharedFilesManager.getShareRecipients(child.id);
          if (childSharedWith.length > 0) {
            const allShares = sharedFilesManager.getAllShares();
            const updatedShares = allShares.map(share => {
              if (share.fileId === child.id) {
                return { ...share, parentFolderId: child.parentFolderId };
              }
              return share;
            });
            
            try {
              localStorage.setItem(SHARED_FILES_KEY, JSON.stringify(updatedShares));
              console.log(`✅ [MOVE] Updated child share: ${child.name}`);
            } catch (error) {
              console.error('❌ [MOVE] Failed to update child shared file:', error);
            }
          }
          
          if (child.type === 'folder') {
            updateChildrenRecursive(child.id);
          }
        });
      };
      
      updateChildrenRecursive(fileId);
      sharedFilesManager.triggerSync();
      console.log(`✅ [MOVE] Finished updating folder and all children`);
    }
    
    console.log(`🎉 [MOVE] Move operation complete!`);
  };

  // ─── download ───────────────────────────────────────────────────────
  const handleDownloadFile = async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;

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
              const blob = await fileStorage.getFile(child.id);
              if (blob) {
                zipFolder.file(child.name, blob);
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
        let blob: Blob | null = null;

        if (file.isSharedFile && file.owner && file.owner !== userEmail) {
          blob = await sharedFilesManager.getSharedFileData(id, file.owner, userEmail);
          if (blob) {
            console.log('✅ Downloaded shared file data');
          }
        }

        if (!blob) {
          blob = await fileStorage.getFile(id);
        }

        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          alert('File not found. It may not have been uploaded properly.');
        }
      } catch (error) {
        console.error('Failed to download file:', error);
        alert('Failed to download file. Please try again.');
      }
    }
  };

  // ─── favorites ──────────────────────────────────────────────────────
  const handleToggleFavorite = (id: string) => {
    if (!ensureUser('handleToggleFavorite')) return;
    setFiles(files.map((f) => (f.id === id ? { ...f, isFavorite: !f.isFavorite } : f)));
  };

  // ─── sharing ────────────────────────────────────────────────────────
  const handleShareFile = async (id: string, recipientEmail: string, senderName?: string): Promise<boolean> => {
    const file = files.find((f) => f.id === id);
    if (!file || file.isSharedFile) return false;
    if (!ensureUser('handleShareFile')) return false;

    console.log('📤 [SHARE] Sharing file:', { id, name: file.name, type: file.type, recipientEmail });

    // ✅ FIX: Check if recipient has this file in their trash (tombstone exists)
    try {
      const recipientTrashKey = `trash_${recipientEmail}`;
      const recipientTrashData = localStorage.getItem(recipientTrashKey);
      
      if (recipientTrashData) {
        const recipientTrash = JSON.parse(recipientTrashData);
        const inRecipientTrash = recipientTrash.some((item: any) => 
          item.id === id || 
          (item.sharedMeta && item.sharedMeta.fileId === id) ||
          item.originalSharedId === id
        );
        
        if (inRecipientTrash) {
          console.warn('⚠️ [SHARE] Cannot share - recipient has this file in trash. They must permanently delete it first.');
          alert('This file is in the recipient\'s trash. They must permanently delete it before you can share it again.');
          return false;
        }
      }
    } catch (e) {
      console.error('❌ [SHARE] Error checking recipient trash:', e);
    }

    try {
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
        // Get all descendants (files and subfolders)
        const descendants = getAllDescendants(file.id);
        itemsToShare = itemsToShare.concat(descendants);
        console.log(`📦 [SHARE] Sharing folder with ${descendants.length} items inside`);
      }

      // ✅ FIX: Clear temp_deleted markers BEFORE sharing
      const tempDeletedKey = `temp_deleted_shares_${recipientEmail}`;
      try {
        const tempDeleted = localStorage.getItem(tempDeletedKey);
        if (tempDeleted) {
          const list = JSON.parse(tempDeleted);
          const fileIds = itemsToShare.map(item => item.id);
          const filtered = list.filter((fid: string) => !fileIds.includes(fid));
          
          if (filtered.length !== list.length) {
            const removedCount = list.length - filtered.length;
            console.log(`🧹 [SHARE] Clearing ${removedCount} temp_deleted marker(s) for ${recipientEmail}`);
            
            if (filtered.length > 0) {
              localStorage.setItem(tempDeletedKey, JSON.stringify(filtered));
            } else {
              localStorage.removeItem(tempDeletedKey);
            }
          }
        }
      } catch (e) {
        console.error('❌ [SHARE] Failed to clear temp_deleted markers:', e);
      }

      // Share each item
      let allSuccess = true;
      let alreadySharedCount = 0;
      
      for (const item of itemsToShare) {
        let fileData: Blob | undefined = undefined;
        
        // Only get file data for actual files (not folders)
        if (item.type === 'file') {
          try {
            fileData = await fileStorage.getFile(item.id);
            console.log(`📦 [SHARE] Got file data for: ${item.name}`);
          } catch (error) {
            console.error(`❌ [SHARE] Failed to get file data for ${item.name}:`, error);
          }
        }

        const success = await sharedFilesManager.shareFile(
          item.id,
          item.name,
          item.size,
          item.type,
          userEmail,
          senderName || userName || userEmail,
          recipientEmail,
          item.createdAt,
          item.parentFolderId,
          fileData
        );

        if (success) {
          console.log(`✅ [SHARE] Successfully shared ${item.type}: ${item.name}`);
        } else {
          console.log(`ℹ️ [SHARE] ${item.type} already shared (reshare): ${item.name}`);
          alreadySharedCount++;
        }
      }

      // ✅ FIX: Trigger sync events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        console.log('🔔 [SHARE] Triggered sync event for reshare');
        
        try {
          sharedFilesManager.triggerSync();
        } catch (e) {
          console.error('Failed to trigger cross-tab sync', e);
        }
      }

      if (allSuccess || alreadySharedCount === itemsToShare.length) {
        console.log(`✅ [SHARE] Successfully shared/reshared ${file.name} and all contents with ${recipientEmail}`);
        return true;
      } else {
        console.warn(`⚠️ [SHARE] Some items failed to share`);
        return false;
      }

    } catch (error) {
      console.error('❌ [SHARE] Failed to share file:', error);
      return false;
    }
  };

  const handleUnshareFile = (id: string, recipientEmail: string): boolean => {
    if (!ensureUser('handleUnshareFile')) return false;
    
    const file = files.find((f) => f.id === id);
    if (!file) return false;
    
    console.log('🚫 [UNSHARE] Unsharing:', { id, name: file.name, type: file.type, recipientEmail });
    
    // Helper to get all descendants
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
    
    // Collect all items to unshare
    let itemsToUnshare: FileItem[] = [file];
    if (file.type === 'folder') {
      const descendants = getAllDescendants(file.id);
      itemsToUnshare = itemsToUnshare.concat(descendants);
      console.log(`🚫 [UNSHARE] Unsharing folder with ${descendants.length} items inside`);
    }
    
    // Unshare each item
    let allSuccess = true;
    for (const item of itemsToUnshare) {
      const success = sharedFilesManager.unshareFile(item.id, recipientEmail);
      if (!success) {
        console.warn(`⚠️ [UNSHARE] Failed to unshare: ${item.name}`);
        allSuccess = false;
      }
    }
    
    return allSuccess;
  };

  const handleUnshareAll = (id: string): boolean => {
    if (!ensureUser('handleUnshareAll')) return false;
    
    const file = files.find((f) => f.id === id);
    if (!file) return false;
    
    console.log('🚫 [UNSHARE_ALL] Unsharing from all:', { id, name: file.name, type: file.type });
    
    // Helper to get all descendants
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
    
    // Collect all items to unshare
    let itemsToUnshare: FileItem[] = [file];
    if (file.type === 'folder') {
      const descendants = getAllDescendants(file.id);
      itemsToUnshare = itemsToUnshare.concat(descendants);
      console.log(`🚫 [UNSHARE_ALL] Unsharing folder with ${descendants.length} items inside from all users`);
    }
    
    // Unshare each item from all recipients
    let allSuccess = true;
    for (const item of itemsToUnshare) {
      const success = sharedFilesManager.removeAllSharesForFile(item.id);
      if (!success) {
        console.warn(`⚠️ [UNSHARE_ALL] Failed to unshare: ${item.name}`);
        allSuccess = false;
      }
    }
    
    return allSuccess;
  };

  // ─── bulk operations ────────────────────────────────────────────────
  const handleBulkDelete = () => {
    if (!ensureUser('handleBulkDelete')) return;
    
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

    // Handle shared files - temporarily hide from receivers
    uniqueFilesToDelete.forEach(file => {
      const isShared = sharedFilesManager.getShareRecipients(file.id).length > 0;
      
      if (isShared && file.owner === userEmail) {
        try {
          const recipients = sharedFilesManager.getShareRecipients(file.id);
          console.log('⏳ [BULK_DELETE] Marking file as temporarily deleted for receivers:', recipients);
          
          recipients.forEach(recipientEmail => {
            const key = `temp_deleted_shares_${recipientEmail}`;
            const existing = localStorage.getItem(key);
            const deletedList = existing ? JSON.parse(existing) : [];
            if (!deletedList.includes(file.id)) {
              deletedList.push(file.id);
              localStorage.setItem(key, JSON.stringify(deletedList));
              console.log(`⏳ [BULK_DELETE] Added ${file.id} to temp_deleted list for ${recipientEmail}`);
            }
          });
        } catch (e) {
          console.error('❌ [BULK_DELETE] Failed to mark shared file as temporarily deleted', e);
        }
      }
    });

    // Trigger sync for receivers
    try {
      sharedFilesManager.triggerSync();
    } catch (e) {
      console.error('Failed to trigger storage event', e);
    }

    // Create deleted items with unique names
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

    // Update state
    setDeletedFiles([...deletedFiles, ...deletedItems]);
    setFiles(files.filter((f) => !uniqueFilesToDelete.some(d => d.id === f.id)));
    setSelectedFiles(new Set());
    console.log('✅ [BULK_DELETE] Files moved to trash');
  };

  const handleBulkRestore = () => {
    const idsArray = Array.from(selectedFiles);
    handleRestoreFiles(idsArray);
  };

  const handleBulkPermanentDelete = async () => {
    if (!ensureUser('handleBulkPermanentDelete')) return;
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

    // ✅ FIX: Check if ANY of the files are receiver-deleted shared files
    const hasReceiverDeletedSharedFiles = uniqueFilesToDelete.some(item => 
      !!(item as any).sharedMeta ||
      !!(item as any).originalSharedId ||
      (item.isSharedFile && item.owner && item.owner !== userEmail)
    );

    // SCENARIO 1: Receiver permanently deleting shared items
    if (hasReceiverDeletedSharedFiles) {
      console.log('💥 [BULK_PERM_DELETE] RECEIVER permanently deleting shared files');
      
      try {
        const hiddenKey = `hidden_shares_${userEmail}`;
        const existingHidden = localStorage.getItem(hiddenKey);
        const hiddenList: string[] = existingHidden ? JSON.parse(existingHidden) : [];
        
        uniqueFilesToDelete.forEach(item => {
          const isSharedItem = 
            !!(item as any).sharedMeta ||
            !!(item as any).originalSharedId ||
            (item.isSharedFile && item.owner && item.owner !== userEmail);
          
          if (isSharedItem) {
            const itemId = (item as any).originalSharedId || item.id;
            if (!hiddenList.includes(itemId)) {
              hiddenList.push(itemId);
              console.log(`   ✅ Added ${itemId} ("${item.name}") to permanent hidden list`);
            }
          }
        });
        
        localStorage.setItem(hiddenKey, JSON.stringify(hiddenList));
        
        // Cleanup temp_deleted
        const tempDeletedKey = `temp_deleted_shares_${userEmail}`;
        const existingTempDeleted = localStorage.getItem(tempDeletedKey);
        if (existingTempDeleted) {
          const tempDeletedList = JSON.parse(existingTempDeleted);
          const idsToRemove = uniqueFilesToDelete.map(item => (item as any).originalSharedId || item.id);
          const filtered = tempDeletedList.filter((id: string) => !idsToRemove.includes(id));
          
          if (filtered.length > 0) {
            localStorage.setItem(tempDeletedKey, JSON.stringify(filtered));
          } else {
            localStorage.removeItem(tempDeletedKey);
          }
        }
        
        // ✅ NEW FIX: Remove share entries from registry when receiver permanently deletes
        console.log('🗑️ [BULK_PERM_DELETE] Removing share entries from registry...');
        uniqueFilesToDelete.forEach(item => {
          const isSharedItem = 
            !!(item as any).sharedMeta ||
            !!(item as any).originalSharedId ||
            (item.isSharedFile && item.owner && item.owner !== userEmail);
          
          if (isSharedItem) {
            const shareId = (item as any).originalSharedId || item.id;
            const recipients = sharedFilesManager.getShareRecipients(shareId);
            
            if (recipients.includes(userEmail)) {
              console.log(`   🗑️ Unsharing ${item.name} (${shareId}) from ${userEmail}`);
              sharedFilesManager.unshareFile(shareId, userEmail);
            }
          }
        });
        console.log('✅ [BULK_PERM_DELETE] Share entries removed from registry');
        
        window.dispatchEvent(new Event(SHARED_FILES_EVENT));
        sharedFilesManager.triggerSync();
        console.log('✅ [BULK_PERM_DELETE] Receiver shared items permanently hidden');
      } catch (e) {
        console.error('❌ [BULK_PERM_DELETE] Failed to hide shared items', e);
      }
      
      setDeletedFiles(deletedFiles.filter((f) => !uniqueFilesToDelete.some((d) => d.id === f.id)));
      setSelectedFiles(new Set());
      return;
    }

    // SCENARIO 2: Sender permanently deleting - remove all shares
    uniqueFilesToDelete.forEach(item => {
      try {
        if (item.owner === userEmail) {
          const recipients = sharedFilesManager.getShareRecipients(item.id);
          
          if (recipients.length > 0) {
            console.log('💥 [BULK_PERM_DELETE] SENDER permanently deleting shared file:', item.name);
            
            // ✅ FIX: Get ALL descendants to clean temp_deleted properly
            const getAllIds = (items: FileItem[], currentId: string): string[] => {
              const result = [currentId];
              const children = items.filter(f => f.parentFolderId === currentId);
              children.forEach(child => {
                result.push(...getAllIds(items, child.id));
              });
              return result;
            };
            
            const allIdsToClean = getAllIds(uniqueFilesToDelete, item.id);
            
            recipients.forEach(recipientEmail => {
              const key = `temp_deleted_shares_${recipientEmail}`;
              const existing = localStorage.getItem(key);
              
              if (existing) {
                const deletedList = JSON.parse(existing);
                const filtered = deletedList.filter((fileId: string) => !allIdsToClean.includes(fileId));
                
                if (filtered.length > 0) {
                  localStorage.setItem(key, JSON.stringify(filtered));
                } else {
                  localStorage.removeItem(key);
                }
              }
            });
            
            sharedFilesManager.removeAllSharesForFile(item.id);
            console.log('✅ [BULK_PERM_DELETE] All share entries removed for', item.id);
          }
        }
      } catch (e) {
        console.error('❌ [BULK_PERM_DELETE] Failed to remove shares on permanent delete', e);
      }
    });

    // Trigger sync for receivers
    try {
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
    } catch (e) {
      console.error('Failed to trigger sync event', e);
    }

    // Delete file data
    for (const item of uniqueFilesToDelete) {
      if (item.type === 'file') {
        try {
          await fileStorage.deleteFile(item.id);
          console.log('🗑️ [BULK_PERM_DELETE] Deleted file data from storage:', item.id);
        } catch (error) {
          console.error('❌ [BULK_PERM_DELETE] Failed to delete file from storage:', error);
        }
      }
    }

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
      setSortOrder('asc');
    }
  };

  // ─── filter / sort / display ────────────────────────────────────────
  const getFilteredFiles = () => {
    let baseFiles: FileItem[] = [];

    switch (currentTab) {
      case 'vault':
        // ✅ FIX: Include both YOUR files AND shared folders/files so you can drag into them
        baseFiles = files.filter((f) =>
          currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId
        );
        break;

      // ✅ FIX 1: Folder navigation for shared files
      case 'shared':
        const tempDeletedKey = `temp_deleted_shares_${userEmail}`;
        const tempDeleted = localStorage.getItem(tempDeletedKey);
        const tempDeletedList: string[] = tempDeleted ? JSON.parse(tempDeleted) : [];
        
        const hiddenKey = `hidden_shares_${userEmail}`;
        const hiddenData = localStorage.getItem(hiddenKey);
        const hiddenList: string[] = hiddenData ? JSON.parse(hiddenData) : [];
        
        // 🔥 NEW: Get receiver's trashed shares
        const receiverTrashedKeyShared = `receiver_trashed_shares_${userEmail}`;
        const receiverTrashedDataShared = localStorage.getItem(receiverTrashedKeyShared);
        const receiverTrashedListShared: string[] = receiverTrashedDataShared ? JSON.parse(receiverTrashedDataShared) : [];
        
        console.log(`📂 [SHARED TAB] Current folder: ${currentFolderId || 'ROOT'}`);
        console.log(`   Temp deleted: ${tempDeletedList.length}, Hidden: ${hiddenList.length}, Receiver trashed: ${receiverTrashedListShared.length}`);
        
        // ✅ FIX: Respect currentFolderId for shared files (same logic as vault tab)
        baseFiles = files.filter((f) => {
          // Must be a shared file
          if (!f.isSharedFile) {
            return false;
          }
          
          // Must not be temp deleted
          if (tempDeletedList.includes(f.id)) {
            console.log(`   ⏳ Filtering out temp-deleted: ${f.name}`);
            return false;
          }
          
          // Must not be permanently hidden
          if (hiddenList.includes(f.id)) {
            console.log(`   🚫 Filtering out permanently hidden: ${f.name}`);
            return false;
          }
          
          // 🔥 NEW: Must not be in receiver's trash
          if (receiverTrashedListShared.includes(f.id)) {
            console.log(`   🗑️ Filtering out receiver-trashed: ${f.name}`);
            return false;
          }
          
          // 🔥 NEW: If file has a parent folder, check if parent is in receiver's trash
          if (f.parentFolderId && receiverTrashedListShared.includes(f.parentFolderId)) {
            console.log(`   🗑️ Filtering out (parent folder in receiver's trash): ${f.name}`);
            return false;
          }
          
          // ✅ NEW: Filter by current folder (same logic as vault tab)
          if (currentFolderId) {
            const matches = f.parentFolderId === currentFolderId;
            console.log(`   📁 "${f.name}" parent=${f.parentFolderId}, current=${currentFolderId}, matches=${matches}`);
            return matches;
          } else {
            const isRoot = !f.parentFolderId;
            console.log(`   📁 "${f.name}" parent=${f.parentFolderId}, at root=${isRoot}`);
            return isRoot;
          }
        });
        
        console.log(`📊 [SHARED TAB] Showing ${baseFiles.length} shared files`);
        break;

      case 'favorites':
        if (currentFolderId) {
          baseFiles = files.filter((f) => f.parentFolderId === currentFolderId);
        } else {
          baseFiles = files.filter((f) => {
            if (!f.isFavorite) return false;
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
        baseFiles = files.filter((f) => new Date(f.createdAt) >= sevenDaysAgo);
        baseFiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;

      case 'trash':
        // ✅ NEW FIX: Get receiver's trashed shared items
        const receiverTrashedKey = `receiver_trashed_shares_${userEmail}`;
        const receiverTrashedData = localStorage.getItem(receiverTrashedKey);
        const receiverTrashedList: string[] = receiverTrashedData ? JSON.parse(receiverTrashedData) : [];
        
        console.log(`🗑️ [TRASH TAB] Receiver trashed shares: ${receiverTrashedList.length}`);
        
        // Get shared items that are in receiver's trash (still in files array, not deletedFiles)
        const receiverTrashedSharedItems = files.filter(f => {
          if (!receiverTrashedList.includes(f.id)) return false;
          
          // Respect folder hierarchy
          const matchesFolder = currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId;
          if (!matchesFolder) return false;
          
          console.log(`🗑️ [TRASH TAB] Including receiver-trashed shared item: "${f.name}"`);
          return true;
        });
        
        console.log(`🗑️ [TRASH TAB] Found ${receiverTrashedSharedItems.length} receiver-trashed shared items`);
        
        // ✅ FIX: Filter out shared items when both sender AND receiver have in trash
        const tombstones = deletedFiles.filter((f) => {
          // First, check folder hierarchy
          const matchesFolder = currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId;
          if (!matchesFolder) return false;
          
          // Check if this is a received shared file tombstone
          const isReceivedShareTombstone = !!(f as any).sharedMeta || !!(f as any).originalSharedId;
          
          if (isReceivedShareTombstone) {
            // Get the original file ID
            const fileId = (f as any).originalSharedId || f.id;
            
            // Check if sender has it in their trash (temp_deleted)
            const tempDeletedKey = `temp_deleted_shares_${userEmail}`;
            try {
              const tempDeletedData = localStorage.getItem(tempDeletedKey);
              if (tempDeletedData) {
                const tempDeletedList: string[] = JSON.parse(tempDeletedData);
                const senderHasInTrash = tempDeletedList.includes(fileId);
                
                if (senderHasInTrash) {
                  console.log(`🗑️ [TRASH TAB] Hiding "${f.name}" - both sender and receiver have in trash`);
                  return false; // Hide when both have in trash
                }
              }
            } catch (e) {
              console.error('❌ [TRASH TAB] Error checking temp_deleted:', e);
            }
          }
          
          return true;
        });
        
        // ✅ NEW: Combine tombstones with receiver-trashed shared items
        baseFiles = [...tombstones, ...receiverTrashedSharedItems];
        console.log(`🗑️ [TRASH TAB] Total items in trash: ${baseFiles.length} (${tombstones.length} tombstones + ${receiverTrashedSharedItems.length} receiver-trashed)`);
        break;

      default:
        baseFiles = files.filter((f) =>
          currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId
        );
    }

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

  const displayFiles = getFilteredFiles();

  const getSharedFilesCount = (): number => {
    try {
      const all = sharedFilesManager.getSharedWithMe(userEmail);
      
      const tempDeletedKey = `temp_deleted_shares_${userEmail}`;
      const tempDeleted = localStorage.getItem(tempDeletedKey);
      const tempDeletedList: string[] = tempDeleted ? JSON.parse(tempDeleted) : [];
      
      const filtered = all.filter((s) => {
        try {
          if (tempDeletedList.includes(s.fileId)) return false;
          
          if (deletedFiles.some((d) => d.id === s.fileId || (d as any).sharedMeta?.fileId === s.fileId || (d as any).originalSharedId === s.fileId)) {
            return false;
          }
          try {
            const raw = localStorage.getItem(`trash_${userEmail}`);
            if (raw) {
              const parsed = JSON.parse(raw) as any[];
              if (parsed.some((d) => d && (d.id === s.fileId || (d.sharedMeta && d.sharedMeta.fileId === s.fileId) || d.originalSharedId === s.fileId))) {
                return false;
              }
            }
          } catch (e) {
            // ignore
          }
          return true;
        } catch (e) {
          return true;
        }
      });
      return filtered.length;
    } catch (e) {
      return 0;
    }
  };

  const handleCleanupGlitchedFiles = () => {
    if (!ensureUser('handleCleanupGlitchedFiles')) return;
    
    try {
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
      
      const cleanedFiles = files.filter(f => {
        if (!f.parentFolderId) return true;
        if (f.isSharedFile) return true;
        
        const parentExists = files.some(p => p.id === f.parentFolderId && p.type === 'folder');
        if (!parentExists) {
          console.log(`🧹 Removing orphaned file: ${f.name}`);
          return false;
        }
        return true;
      });
      
      setFiles(cleanedFiles);
      
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
    handleCleanupGlitchedFiles,
  };
}