/**
 * BULLETPROOF Shared Files Manager - PRODUCTION VERSION WITH IndexedDB
 * ✅ Fixed: Uses IndexedDB for file storage (no more quota exceeded errors!)
 * ✅ Fixed: Proper cross-tab sync trigger
 * ✅ Fixed: Preserves folder hierarchy for shared files
 * ✅ Added: Comprehensive debug logging
 */

import { fileStorage } from '@/components/pdf/fileStorage';

export interface SharedFileEntry {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: 'file' | 'folder';
  ownerId: string;
  ownerName: string;
  recipientEmail: string;
  sharedAt: Date;
  originalCreatedAt: Date;
  parentFolderId?: string | null;
  sharedFileDataKey?: string;
}

export const SHARED_FILES_KEY = 'shared_files_global';
export const SHARED_FILES_DATA_PREFIX = 'shared_file_data_';
export const SHARED_FILES_EVENT = 'shared-files-updated';
export const SHARED_FILES_SYNC_TRIGGER = 'shared_files_sync_trigger';

// Micro-timestamp sequence generator to help trace ordering across writes
let __sfm_seq = 0;
function microStamp(): string {
  __sfm_seq = (__sfm_seq + 1) || 1;
  const t = new Date().toISOString();
  const p = (typeof performance !== 'undefined' && performance.now) ? performance.now().toFixed(2) : Date.now();
  return `${t}|${p}|#${__sfm_seq}`;
}

function uniqueBy<T>(items: T[], keyFn: (t: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const k = keyFn(item);
    // keep the most recent by replacing existing entry if present and newer
    map.set(k, item);
  }
  return Array.from(map.values());
}

/** Helper – notify the current tab that shared data changed. */
function notifyUpdate() {
  if (typeof window !== 'undefined') {
    console.log('🔔 [MANAGER] Dispatching SHARED_FILES_EVENT');
    window.dispatchEvent(new Event(SHARED_FILES_EVENT));
  }
}

/**
 * 🛡️ CRITICAL: Validate and sanitize shared_files_global
 */
function ensureValidStorage(): SharedFileEntry[] {
  try {
    const raw = localStorage.getItem(SHARED_FILES_KEY);
    
    if (!raw) {
      localStorage.setItem(SHARED_FILES_KEY, JSON.stringify([]));
      console.log('🆕 [STORAGE] Initialized shared_files_global as empty array');
      return [];
    }
    
    const parsed = JSON.parse(raw);
    
    if (!Array.isArray(parsed)) {
      console.warn('⚠️ [SHARED_FILES] Corrupted shared_files_global data (not an array), resetting');
      console.warn('   Old value type:', typeof parsed);
      localStorage.setItem(SHARED_FILES_KEY, JSON.stringify([]));
      return [];
    }
    
    let entries = parsed.map((entry: any) => ({
      ...entry,
      sharedAt: new Date(entry.sharedAt),
      originalCreatedAt: new Date(entry.originalCreatedAt),
    }));

    // Deduplicate obvious exact-duplicate share records (same fileId + recipient)
    try {
      const seen = new Set<string>();
      const deduped: typeof entries = [];
      for (const e of entries) {
        const key = `${e.fileId}:${e.recipientEmail}`;
        if (seen.has(key)) {
          console.warn(`⚠️ [STORAGE] Removing duplicate share entry for ${key}`);
          continue;
        }
        seen.add(key);
        deduped.push(e);
      }
      if (deduped.length !== entries.length) {
        console.log(`🧹 [STORAGE] Deduped share entries: ${entries.length} -> ${deduped.length}`);
        entries = deduped;
        // Persist the cleaned list back so duplicates don't reappear
        try { localStorage.setItem(SHARED_FILES_KEY, JSON.stringify(entries)); } catch (e) { console.warn('⚠️ [STORAGE] Failed to persist deduped shared_files_global', e); }
      }
    } catch (e) {
      console.warn('⚠️ [STORAGE] Deduplication step failed', e);
    }

    console.log(`📦 [STORAGE] Loaded ${entries.length} share entries from storage`);
    return entries;
    
  } catch (error) {
    console.error('❌ [STORAGE] Failed to read shared_files_global:', error);
    localStorage.setItem(SHARED_FILES_KEY, JSON.stringify([]));
    return [];
  }
}

/**
 * 🛡️ CRITICAL: Save entries with validation
 */
function saveEntries(entries: SharedFileEntry[]): boolean {
  try {
    if (!Array.isArray(entries)) {
      console.error('❌ [STORAGE] Attempted to save non-array data! Blocking save.');
      return false;
    }
    const payload = JSON.stringify(entries);
    localStorage.setItem(SHARED_FILES_KEY, payload);
    try {
      const stamp = microStamp();
      console.log(`💾 [STORAGE] Saved ${entries.length} share(s) to storage — ${stamp} — bytes:${payload.length}`);
    } catch (e) {
      console.log(`💾 [STORAGE] Saved ${entries.length} share(s) to storage`);
    }
    notifyUpdate();
    return true;
    
  } catch (error) {
    console.error('❌ [STORAGE] Failed to save shared files:', error);
    return false;
  }
}

class SharedFilesManager {
  // ─── File Data Sharing (IndexedDB) ──────────────────────────────────────────

  /**
   * ✅ FIXED: Store file data in IndexedDB instead of localStorage
   * This eliminates quota exceeded errors for large files
   */
  private async storeSharedFileData(
    fileId: string,
    ownerEmail: string,
    recipientEmail: string,
    fileData: Blob
  ): Promise<string> {
    const sharedKey = `${SHARED_FILES_DATA_PREFIX}${ownerEmail}_to_${recipientEmail}_${fileId}`;
    
    try {
      console.log(`📦 [BLOB] Storing shared file data in IndexedDB: ${sharedKey} (${fileData.size} bytes) — ${microStamp()}`);
      
      // Store the blob directly in IndexedDB - no conversion needed!
      await fileStorage.storeFile(sharedKey, fileData);
      
      console.log(`✅ [BLOB] Stored shared file data in IndexedDB: ${sharedKey} (${fileData.size} bytes) — ${microStamp()}`);
      return sharedKey;
      
    } catch (error) {
      console.error('❌ [BLOB] Failed to store shared file data in IndexedDB:', error);
      
      // Fallback to localStorage for small files only (< 1MB)
      if (fileData.size < 1024 * 1024) {
        console.log('⚠️ [BLOB] Attempting localStorage fallback for small file...');
        try {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(fileData);
          });
          
          const base64Data = await base64Promise;
          
          const storageData = {
            fileId,
            ownerEmail,
            recipientEmail,
            mimeType: fileData.type,
            size: fileData.size,
            data: base64Data,
            sharedAt: new Date().toISOString(),
          };
          
          localStorage.setItem(sharedKey, JSON.stringify(storageData));
          console.log(`✅ [BLOB] Stored in localStorage fallback: ${sharedKey} — ${microStamp()}`);
          return sharedKey;
        } catch (fallbackError) {
          console.error('❌ [BLOB] localStorage fallback also failed:', fallbackError);
          throw fallbackError;
        }
      }
      
      throw error;
    }
  }

  /**
   * ✅ FIXED: Retrieve file data from IndexedDB with localStorage fallback
   */
  async getSharedFileData(
    fileId: string,
    ownerEmail: string,
    recipientEmail: string
  ): Promise<Blob | null> {
    const sharedKey = `${SHARED_FILES_DATA_PREFIX}${ownerEmail}_to_${recipientEmail}_${fileId}`;
    
    try {
      console.log(`📥 [BLOB] Retrieving shared file data: ${sharedKey} — ${microStamp()}`);
      
      // Try IndexedDB first
      const idbBlob = await fileStorage.getFile(sharedKey);
      if (idbBlob) {
        console.log(`✅ [BLOB] Retrieved from IndexedDB: ${sharedKey} (${idbBlob.size} bytes) — ${microStamp()}`);
        return idbBlob;
      }
      
      console.log(`📥 [BLOB] Not in IndexedDB, checking localStorage fallback... — ${microStamp()}`);
      
      // Fallback to localStorage (legacy data)
      const storedData = localStorage.getItem(sharedKey);
      if (!storedData) {
        console.error('❌ [BLOB] Shared file data not found in IndexedDB or localStorage:', sharedKey);
        return null;
      }
      
      const parsed = JSON.parse(storedData);
      
      const byteCharacters = atob(parsed.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: parsed.mimeType });
      
      console.log(`✅ [BLOB] Retrieved from localStorage: ${sharedKey} (${blob.size} bytes) — ${microStamp()}`);
      
      // Migrate to IndexedDB for future use
      try {
        await fileStorage.storeFile(sharedKey, blob);
        localStorage.removeItem(sharedKey);
        console.log(`🔄 [MIGRATION] Migrated ${sharedKey} from localStorage to IndexedDB — ${microStamp()}`);
      } catch (migrationError) {
        console.warn('⚠️ [MIGRATION] Failed to migrate to IndexedDB:', migrationError);
      }
      
      return blob;
      
    } catch (error) {
      console.error('❌ [BLOB] Failed to retrieve shared file data:', error);
      return null;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async shareFile(
    fileId: string,
    fileName: string,
    fileSize: number,
    fileType: 'file' | 'folder',
    ownerEmail: string,
    ownerName: string,
    recipientEmail: string,
    originalCreatedAt: Date,
    parentFolderId?: string | null,
    fileData?: Blob
  ): Promise<boolean> {
    try {
      console.log(`📤 [SHARE] Attempting to share file:`, {
        fileId,
        fileName,
        fileType,
        ownerEmail,
        recipientEmail,
        parentFolderId,
        hasFileData: !!fileData,
        fileSize: fileData?.size
      });

      const entries = ensureValidStorage();

      // Prevent re-sharing while the recipient still has the previous share
      // present in their trash/tombstones. They must permanently delete it first.
      try {
        const rtKey = `receiver_trashed_shares_${recipientEmail}`;
        const rtRaw = localStorage.getItem(rtKey);
        const rtList: string[] = rtRaw ? JSON.parse(rtRaw) : [];

        if (rtList.includes(fileId)) {
          // If recipient marker exists, check recipient's trash tombstones.
          // If recipient no longer has a tombstone for this file (they permanently deleted it),
          // clear the stale marker and allow the reshare. Otherwise block.
          try {
            const trashKey = `trash_${recipientEmail}`;
            const trashRaw = localStorage.getItem(trashKey);
            let recipientHasTombstone = false;
            if (trashRaw) {
              const tombs = JSON.parse(trashRaw) as any[];
              if (Array.isArray(tombs)) {
                recipientHasTombstone = tombs.some(t => t.id === fileId || t.originalSharedId === fileId || t.id === parentFolderId || t.originalSharedId === parentFolderId);
              }
            }

            if (recipientHasTombstone) {
              console.warn(`🚫 [SHARE] Blocked: recipient ${recipientEmail} still has tombstone for ${fileId} or its parent — ${microStamp()}`);
              return false;
            }

            // Recipient does NOT have a tombstone — treat receiver marker as stale.
            // Remove it so reshare can proceed.
            try {
              const newRt = rtList.filter(id => id !== fileId);
              if (newRt.length > 0) localStorage.setItem(rtKey, JSON.stringify(newRt));
              else localStorage.removeItem(rtKey);
              console.log(`🧹 [SHARE] Cleared stale receiver_trashed_shares marker for ${recipientEmail} -> ${fileId} — ${microStamp()}`);
            } catch (cleanupErr) {
              console.warn('⚠️ [SHARE] Failed to clear stale receiver marker:', cleanupErr);
            }

          } catch (e) {
            console.warn('⚠️ [SHARE] Failed to inspect recipient trash for block check:', e);
            // Conservative default: block the share if we can't determine state
            return false;
          }
        }
      } catch (e) {
        console.warn('⚠️ [SHARE] Failed to inspect recipient trash for block check:', e);
      }

      if (entries.some((e) => e.fileId === fileId && e.recipientEmail === recipientEmail)) {
        console.log('⚠️ [SHARE] File already shared with this user');
        return false;
      }

      let sharedFileDataKey: string | undefined;
      if (fileData && fileType === 'file') {
        try {
          sharedFileDataKey = await this.storeSharedFileData(
            fileId,
            ownerEmail,
            recipientEmail,
            fileData
          );
          console.log('📦 [SHARE] Shared file data stored with key:', sharedFileDataKey);
        } catch (error) {
          console.error('❌ [SHARE] Failed to store shared file data:', error);
          // Continue anyway - the share entry will be created without the blob
          console.warn('⚠️ [SHARE] Continuing without file data blob...');
        }
      }

      const newEntry: SharedFileEntry = {
        fileId,
        fileName,
        fileSize,
        fileType,
        ownerId: ownerEmail,
        ownerName,
        recipientEmail,
        sharedAt: new Date(),
        originalCreatedAt,
        parentFolderId,
        sharedFileDataKey,
      };

      entries.push(newEntry);

      const saved = saveEntries(entries);
      if (saved) {
        console.log(`✅ [SHARE] File "${fileName}" shared with ${recipientEmail}`, {
          fileId,
          parentFolderId,
          totalShares: entries.length
        });
        try {
          const rtKey = `receiver_trashed_shares_${recipientEmail}`;
          const rtRaw = localStorage.getItem(rtKey);
          const rtList: string[] = rtRaw ? JSON.parse(rtRaw) : [];
          const fileInReceiverTrash = rtList.includes(fileId);
          let parentInReceiverTrash = parentFolderId ? rtList.includes(parentFolderId) : false;

          // Also check recipient's tombstones (`trash_{email}`) in case the
          // receiver moved the folder to Trash before we added the
          // receiver_trashed_shares marker. Treat a tombstone with the same
          // id as evidence the parent is in their trash.
          try {
            const trashKey = `trash_${recipientEmail}`;
            const trashRaw = localStorage.getItem(trashKey);
            if (trashRaw && parentFolderId && !parentInReceiverTrash) {
              const tombs = JSON.parse(trashRaw) as any[];
              if (Array.isArray(tombs)) {
                const found = tombs.some(t => t.id === parentFolderId || t.originalSharedId === parentFolderId);
                if (found) {
                  parentInReceiverTrash = true;
                  console.log(`🔍 [SHARE-INFO] Parent ${parentFolderId} found in recipient ${recipientEmail} trash_tombstones`);
                }
              }
            }
          } catch (e) {
            console.warn('⚠️ [SHARE-INFO] Failed to read recipient trash tombstones for debug:', e);
          }

          console.log(`🔍 [SHARE-INFO] Recipient receiver_trashed_shares for ${recipientEmail}:`, rtList);
          console.log(`   🔎 fileInReceiverTrash: ${fileInReceiverTrash}, parentInReceiverTrash: ${parentInReceiverTrash}`);

          if (fileInReceiverTrash || parentInReceiverTrash) {
            console.log(`🗑️ [SHARE-INFO] Recipient ${recipientEmail} has ${fileInReceiverTrash ? 'the file' : 'the parent folder'} in their trash.`);

            // Ensure the incoming share is reflected in the recipient's receiver_trashed_shares
            try {
              const current = localStorage.getItem(rtKey);
              let currentList: string[] = current ? JSON.parse(current) : rtList || [];
              if (!currentList.includes(fileId)) {
                currentList.push(fileId);
                try { console.log('🕒 [SHARE-INFO] Writing receiver_trashed_shares for', rtKey, 'adding', fileId, '—', microStamp()); } catch(e){}
                localStorage.setItem(rtKey, JSON.stringify(currentList));
                try { console.log(`✅ [SHARE-INFO] Wrote receiver_trashed_shares_${recipientEmail} — new count ${currentList.length} — ${microStamp()}`); } catch(e){}
              } else {
                console.log(`ℹ️ [SHARE-INFO] Incoming share ${fileId} already present in receiver_trashed_shares_${recipientEmail} — ${microStamp()}`);
              }
            } catch (e) {
              console.warn('⚠️ [SHARE-INFO] Failed to persist receiver_trashed_shares for recipient debug:', e);
            }

            console.log(`🗑️ [SHARE-INFO] The share will appear in recipient's trash view until they restore the item/folder.`);
          }
        } catch (e) {
          console.warn('⚠️ [SHARE-INFO] Could not read receiver_trashed_shares for debug:', e);
        }
      }
      return saved;
      
    } catch (error) {
      console.error('❌ [SHARE] Failed to share file:', error);
      return false;
    }
  }

  getSharedWithMe(currentUserEmail: string): SharedFileEntry[] {
    console.log(`🔍 [QUERY] Getting files shared with: ${currentUserEmail}`);
    const entries = ensureValidStorage();
    const rawShared = entries.filter((e) => e.recipientEmail === currentUserEmail);
    console.log(`📥 [QUERY] Raw entries found for ${currentUserEmail}: ${rawShared.length} — ${microStamp()}`);

    // Deduplicate by fileId for UI count / badge correctness
    const deduped = uniqueBy(rawShared, (e) => `${e.fileId}`);
    if (deduped.length !== rawShared.length) {
      console.log(`🧾 [QUERY] Deduped shared list for ${currentUserEmail}: ${rawShared.length} -> ${deduped.length} — ${microStamp()}`);
    }

    deduped.forEach((entry, index) => {
      console.log(`  ${index + 1}. "${entry.fileName}" (${entry.fileType}) - Parent: ${entry.parentFolderId || 'ROOT'} — ${microStamp()}`);
    });

    return deduped;
  }

  getSharedByMe(currentUserEmail: string): SharedFileEntry[] {
    console.log(`🔍 [QUERY] Getting files shared by: ${currentUserEmail}`);
    const entries = ensureValidStorage();
    const raw = entries.filter((e) => e.ownerId === currentUserEmail);
    console.log(`📤 [QUERY] Raw shares by ${currentUserEmail}: ${raw.length} — ${microStamp()}`);
    raw.forEach((entry, index) => {
      console.log(`  ${index + 1}. "${entry.fileName}" → ${entry.recipientEmail} — ${microStamp()}`);
    });
    return raw;
  }

  async unshareFile(fileId: string, recipientEmail: string): Promise<boolean> {
    try {
      console.log(`🗑️ [UNSHARE] Attempting to unshare file ${fileId} from ${recipientEmail}`);
      // Recursive unshare: if the target is a folder (or has children shared entries),
      // remove shares for that recipient for the file and any shared descendants.
      const entries = ensureValidStorage();

      // Build set of fileIds to remove for this recipient by walking shared entries
      const toRemove = new Set<string>();
      const queue: string[] = [fileId];

      while (queue.length > 0) {
        const current = queue.pop()!;
        if (toRemove.has(current)) continue;
        toRemove.add(current);

        // Find direct children (shared entries whose parentFolderId === current) for this recipient
        for (const e of entries) {
          if (e.recipientEmail === recipientEmail && e.parentFolderId === current) {
            if (!toRemove.has(e.fileId)) queue.push(e.fileId);
          }
        }
      }

      // Delete blob data for all matching entries for this recipient
      for (const e of entries) {
        if (e.recipientEmail === recipientEmail && toRemove.has(e.fileId) && e.sharedFileDataKey) {
          try {
            await fileStorage.deleteFile(e.sharedFileDataKey);
            console.log(`🗑️ [UNSHARE] Removed blob for ${e.fileId}: ${e.sharedFileDataKey}`);
          } catch (idbError) {
            console.warn('⚠️ [UNSHARE] IndexedDB delete failed, trying localStorage:', idbError);
            localStorage.removeItem(e.sharedFileDataKey);
          }
        }
      }

      const filtered = entries.filter(
        (e) => !(e.recipientEmail === recipientEmail && toRemove.has(e.fileId))
      );

      const saved = saveEntries(filtered);
      if (saved) {
        console.log(`✅ [UNSHARE] Unshared file(s) ${Array.from(toRemove).join(', ')} from ${recipientEmail}`);
        try {
          // Clean any receiver_trashed_shares markers for this recipient for removed IDs
          const rtKey = `receiver_trashed_shares_${recipientEmail}`;
          const rtRaw = localStorage.getItem(rtKey);
          if (rtRaw) {
            let rtList: string[] = JSON.parse(rtRaw);
            const beforeLen = rtList.length;
            rtList = rtList.filter(id => !toRemove.has(id));
            if (rtList.length !== beforeLen) {
              if (rtList.length > 0) localStorage.setItem(rtKey, JSON.stringify(rtList));
              else localStorage.removeItem(rtKey);
              console.log(`🧹 [UNSHARE] Cleaned receiver_trashed_shares_${recipientEmail} — ${microStamp()}`);
            }
          }
        } catch (e) {
          console.warn('⚠️ [UNSHARE] Failed to clean receiver_trashed_shares for recipient:', e);
        }

        // Trigger cross-tab sync so recipients update storage/UI immediately
        try { this.triggerSync(); } catch (e) { console.warn('⚠️ [UNSHARE] triggerSync failed', e); }
      }
      return saved;
    } catch (error) {
      console.error('❌ [UNSHARE] Failed to unshare file:', error);
      return false;
    }
  }

  async removeAllSharesForFile(fileId: string): Promise<boolean> {
    try {
      console.log(`🗑️ [UNSHARE_ALL] Removing all shares for file: ${fileId}`);
      const entries = ensureValidStorage();
      const toRemove = entries.filter((e) => e.fileId === fileId);

      console.log(`  Found ${toRemove.length} share(s) to remove`);
      
      for (const entry of toRemove) {
        if (entry.sharedFileDataKey) {
          try {
            await fileStorage.deleteFile(entry.sharedFileDataKey);
            console.log(`  🗑️ Removed from IndexedDB: ${entry.sharedFileDataKey}`);
          } catch (idbError) {
            console.warn('  ⚠️ IndexedDB delete failed, trying localStorage:', idbError);
            localStorage.removeItem(entry.sharedFileDataKey);
          }
        }
      }

      const filtered = entries.filter((e) => e.fileId !== fileId);
      const saved = saveEntries(filtered);
      
      if (saved) {
        console.log(`✅ [UNSHARE_ALL] Removed all shares for file ${fileId}`);
        try {
          // Clean receiver_trashed_shares for all affected recipients
          const affected = toRemove.map(r => r.recipientEmail);
          for (const recipient of affected) {
            try {
              const rtKey = `receiver_trashed_shares_${recipient}`;
              const rtRaw = localStorage.getItem(rtKey);
              if (rtRaw) {
                let rtList: string[] = JSON.parse(rtRaw);
                const beforeLen = rtList.length;
                rtList = rtList.filter(id => id !== fileId);
                if (rtList.length !== beforeLen) {
                  if (rtList.length > 0) localStorage.setItem(rtKey, JSON.stringify(rtList));
                  else localStorage.removeItem(rtKey);
                  console.log(`🧹 [UNSHARE_ALL] Cleaned receiver_trashed_shares_${recipient} — ${microStamp()}`);
                }
              }
            } catch (e) {
              console.warn('⚠️ [UNSHARE_ALL] Failed to clean receiver_trashed_shares for', recipient, e);
            }
          }
        } catch (e) {
          console.warn('⚠️ [UNSHARE_ALL] Error cleaning receiver_trashed_shares:', e);
        }

        try { this.triggerSync(); } catch (e) { console.warn('⚠️ [UNSHARE_ALL] triggerSync failed', e); }
      }

      return saved;
    } catch (error) {
      console.error('❌ [UNSHARE_ALL] Failed to remove shares:', error);
      return false;
    }
  }

  /**
   * Remove all shares for a file AND any shared descendants (recursively) across all recipients.
   */
  async removeAllSharesForFileRecursive(fileId: string): Promise<boolean> {
    try {
      console.log(`🗑️ [UNSHARE_ALL_RECURSIVE] Removing shares recursively for file: ${fileId}`);
      const entries = ensureValidStorage();

      const toRemove = new Set<string>();
      const queue: string[] = [fileId];

      while (queue.length > 0) {
        const current = queue.pop()!;
        if (toRemove.has(current)) continue;
        toRemove.add(current);

        for (const e of entries) {
          if (e.parentFolderId === current && !toRemove.has(e.fileId)) {
            queue.push(e.fileId);
          }
        }
      }

      const removedEntries = entries.filter(e => toRemove.has(e.fileId));

      for (const e of removedEntries) {
        if (e.sharedFileDataKey) {
          try {
            await fileStorage.deleteFile(e.sharedFileDataKey);
            console.log(`  🗑️ Removed blob: ${e.sharedFileDataKey}`);
          } catch (idbError) {
            console.warn('  ⚠️ IndexedDB delete failed, trying localStorage:', idbError);
            localStorage.removeItem(e.sharedFileDataKey);
          }
        }
      }

      const filtered = entries.filter(e => !toRemove.has(e.fileId));
      const saved = saveEntries(filtered);

      if (saved) {
        console.log(`✅ [UNSHARE_ALL_RECURSIVE] Removed ${toRemove.size} share(s) for file ${fileId}`);
        try {
          // Determine affected recipients and clean their receiver_trashed_shares
          const affectedRecipients = new Set<string>();
          for (const e of removedEntries) {
            if (e && e.recipientEmail) affectedRecipients.add(e.recipientEmail);
          }

          for (const recipient of affectedRecipients) {
            try {
              const rtKey = `receiver_trashed_shares_${recipient}`;
              const rtRaw = localStorage.getItem(rtKey);
              if (rtRaw) {
                let rtList: string[] = JSON.parse(rtRaw);
                const beforeLen = rtList.length;
                // Remove any ids that were removed
                rtList = rtList.filter(id => !toRemove.has(id));
                if (rtList.length !== beforeLen) {
                  if (rtList.length > 0) localStorage.setItem(rtKey, JSON.stringify(rtList));
                  else localStorage.removeItem(rtKey);
                  console.log(`🧹 [UNSHARE_ALL_RECURSIVE] Cleaned receiver_trashed_shares_${recipient} — ${microStamp()}`);
                }
              }
            } catch (e) {
              console.warn('⚠️ [UNSHARE_ALL_RECURSIVE] Failed to clean receiver_trashed_shares for', recipient, e);
            }
          }
        } catch (e) {
          console.warn('⚠️ [UNSHARE_ALL_RECURSIVE] Error cleaning receiver_trashed_shares:', e);
        }

        try { this.triggerSync(); } catch (e) { console.warn('⚠️ [UNSHARE_ALL_RECURSIVE] triggerSync failed', e); }
      }
      return saved;
    } catch (error) {
      console.error('❌ [UNSHARE_ALL_RECURSIVE] Failed to remove shares recursively:', error);
      return false;
    }
  }

  updateSharedFileName(fileId: string, newName: string): boolean {
    try {
      console.log(`✏️ [RENAME] Updating shared file name: ${fileId} → "${newName}"`);
      const entries = ensureValidStorage();
      let changed = false;
      
      const updated = entries.map((e) => {
        if (e.fileId === fileId) {
          changed = true;
          console.log(`  📝 Updating share: ${e.fileName} → ${newName} (recipient: ${e.recipientEmail})`);
          return { ...e, fileName: newName };
        }
        return e;
      });

      if (changed) {
        const saved = saveEntries(updated);
        if (saved) {
          console.log(`✅ [RENAME] Updated shared name for ${fileId} → ${newName}`);
        }
        return saved;
      }

      console.log(`⚠️ [RENAME] No shares found for file ${fileId}`);
      return false;
    } catch (error) {
      console.error('❌ [RENAME] Failed to update shared file name:', error);
      return false;
    }
  }

  isSharedWith(fileId: string, recipientEmail: string): boolean {
    const entries = ensureValidStorage();
    const isShared = entries.some(
      (e) => e.fileId === fileId && e.recipientEmail === recipientEmail
    );
    console.log(`🔍 [CHECK] File ${fileId} shared with ${recipientEmail}: ${isShared}`);
    return isShared;
  }

  updateSharedFileParent(fileId: string, newParentId: string | null): boolean {
    try {
      console.log(`📁 [UPDATE_PARENT] Updating parent for file ${fileId} → ${newParentId || 'ROOT'}`);
      const entries = ensureValidStorage();
      let changed = false;
      
      const updated = entries.map((e) => {
        if (e.fileId === fileId) {
          changed = true;
          console.log(`  📝 Updating parent for ${e.recipientEmail}: ${e.parentFolderId || 'ROOT'} → ${newParentId || 'ROOT'}`);
          return { ...e, parentFolderId: newParentId };
        }
        return e;
      });

      if (changed) {
        const saved = saveEntries(updated);
        if (saved) {
          console.log(`✅ [UPDATE_PARENT] Updated parent folder for ${fileId}`);
        }
        return saved;
      }

      console.log(`⚠️ [UPDATE_PARENT] No shares found for file ${fileId}`);
      return false;
    } catch (error) {
      console.error('❌ [UPDATE_PARENT] Failed to update shared file parent:', error);
      return false;
    }
  }

  getShareRecipients(fileId: string): string[] {
    const entries = ensureValidStorage();
    const recipients = entries
      .filter((e) => e.fileId === fileId)
      .map((e) => e.recipientEmail);
    console.log(`🔍 [RECIPIENTS] File ${fileId} shared with ${recipients.length} user(s):`, recipients);
    return recipients;
  }

  triggerSync(): boolean {
    try {
      console.log('🔔 [SYNC] Triggering cross-tab sync...');
      const stamp = microStamp();
      localStorage.setItem(SHARED_FILES_SYNC_TRIGGER, `${Date.now()}|${stamp}`);
      console.log('✅ [SYNC] Cross-tab sync triggered successfully —', stamp);
      return true;
    } catch (error) {
      console.error('❌ [SYNC] Failed to trigger sync:', error);
      return false;
    }
  }

  getAllShares(): SharedFileEntry[] {
    const entries = ensureValidStorage();
    const uniqueByFileRecipient = uniqueBy(entries, (e) => `${e.fileId}:${e.recipientEmail}`);
    if (uniqueByFileRecipient.length !== entries.length) {
      console.log(`📊 [QUERY] Total shares (raw -> deduped file:recipient): ${entries.length} -> ${uniqueByFileRecipient.length} — ${microStamp()}`);
    } else {
      console.log(`📊 [QUERY] Total shares in system: ${entries.length} — ${microStamp()}`);
    }
    return uniqueByFileRecipient;
  }

  async clearAllShares(): Promise<boolean> {
    try {
      console.log('🧹 [CLEAR] Clearing all shares and shared file data...');
      const entries = ensureValidStorage();
      
      // Clear IndexedDB
      for (const entry of entries) {
        if (entry.sharedFileDataKey) {
          try {
            await fileStorage.deleteFile(entry.sharedFileDataKey);
          } catch (error) {
            console.warn('⚠️ Failed to delete from IndexedDB:', entry.sharedFileDataKey);
          }
        }
      }

      // Clear localStorage fallback data
      Object.keys(localStorage)
        .filter((key) => key.startsWith(SHARED_FILES_DATA_PREFIX))
        .forEach((key) => localStorage.removeItem(key));

      localStorage.removeItem(SHARED_FILES_KEY);
      notifyUpdate();
      console.log('✅ [CLEAR] Cleared all shares and shared file data');
      return true;
    } catch (error) {
      console.error('❌ [CLEAR] Failed to clear shares:', error);
      return false;
    }
  }
}

export const sharedFilesManager = new SharedFilesManager();