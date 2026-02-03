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
    
    const entries = parsed.map((entry: any) => ({
      ...entry,
      sharedAt: new Date(entry.sharedAt),
      originalCreatedAt: new Date(entry.originalCreatedAt),
    }));
    
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
    
    localStorage.setItem(SHARED_FILES_KEY, JSON.stringify(entries));
    console.log(`💾 [STORAGE] Saved ${entries.length} share(s) to storage`);
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
      console.log(`📦 [BLOB] Storing shared file data in IndexedDB: ${sharedKey} (${fileData.size} bytes)`);
      
      // Store the blob directly in IndexedDB - no conversion needed!
      await fileStorage.storeFile(sharedKey, fileData);
      
      console.log(`✅ [BLOB] Stored shared file data in IndexedDB: ${sharedKey} (${fileData.size} bytes)`);
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
          console.log(`✅ [BLOB] Stored in localStorage fallback: ${sharedKey}`);
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
      console.log(`📥 [BLOB] Retrieving shared file data: ${sharedKey}`);
      
      // Try IndexedDB first
      const idbBlob = await fileStorage.getFile(sharedKey);
      if (idbBlob) {
        console.log(`✅ [BLOB] Retrieved from IndexedDB: ${sharedKey} (${idbBlob.size} bytes)`);
        return idbBlob;
      }
      
      console.log(`📥 [BLOB] Not in IndexedDB, checking localStorage fallback...`);
      
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
      
      console.log(`✅ [BLOB] Retrieved from localStorage: ${sharedKey} (${blob.size} bytes)`);
      
      // Migrate to IndexedDB for future use
      try {
        await fileStorage.storeFile(sharedKey, blob);
        localStorage.removeItem(sharedKey);
        console.log(`🔄 [MIGRATION] Migrated ${sharedKey} from localStorage to IndexedDB`);
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
    const shared = entries.filter((e) => e.recipientEmail === currentUserEmail);
    console.log(`📥 [QUERY] Found ${shared.length} files shared with ${currentUserEmail}`);
    
    shared.forEach((entry, index) => {
      console.log(`  ${index + 1}. "${entry.fileName}" (${entry.fileType}) - Parent: ${entry.parentFolderId || 'ROOT'}`);
    });
    
    return shared;
  }

  getSharedByMe(currentUserEmail: string): SharedFileEntry[] {
    console.log(`🔍 [QUERY] Getting files shared by: ${currentUserEmail}`);
    const entries = ensureValidStorage();
    const shared = entries.filter((e) => e.ownerId === currentUserEmail);
    console.log(`📤 [QUERY] Found ${shared.length} files shared by ${currentUserEmail}`);
    
    shared.forEach((entry, index) => {
      console.log(`  ${index + 1}. "${entry.fileName}" → ${entry.recipientEmail}`);
    });
    
    return shared;
  }

  async unshareFile(fileId: string, recipientEmail: string): Promise<boolean> {
    try {
      console.log(`🗑️ [UNSHARE] Attempting to unshare file ${fileId} from ${recipientEmail}`);
      const entries = ensureValidStorage();
      const entry = entries.find(
        (e) => e.fileId === fileId && e.recipientEmail === recipientEmail
      );

      if (entry && entry.sharedFileDataKey) {
        // Remove from IndexedDB
        try {
          await fileStorage.deleteFile(entry.sharedFileDataKey);
          console.log('🗑️ [UNSHARE] Removed from IndexedDB:', entry.sharedFileDataKey);
        } catch (idbError) {
          console.warn('⚠️ [UNSHARE] IndexedDB delete failed, trying localStorage:', idbError);
          localStorage.removeItem(entry.sharedFileDataKey);
        }
      }

      const filtered = entries.filter(
        (e) => !(e.fileId === fileId && e.recipientEmail === recipientEmail)
      );
      
      const saved = saveEntries(filtered);
      if (saved) {
        console.log(`✅ [UNSHARE] Unshared file ${fileId} from ${recipientEmail}`);
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
      }
      
      return saved;
    } catch (error) {
      console.error('❌ [UNSHARE_ALL] Failed to remove shares:', error);
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
      localStorage.setItem(SHARED_FILES_SYNC_TRIGGER, Date.now().toString());
      console.log('✅ [SYNC] Cross-tab sync triggered successfully');
      return true;
    } catch (error) {
      console.error('❌ [SYNC] Failed to trigger sync:', error);
      return false;
    }
  }

  getAllShares(): SharedFileEntry[] {
    const entries = ensureValidStorage();
    console.log(`📊 [QUERY] Total shares in system: ${entries.length}`);
    return entries;
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