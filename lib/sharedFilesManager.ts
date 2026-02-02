/**
 * Enhanced Shared Files Manager
 *
 * Now manages both metadata AND actual file data sharing between users.
 * When a file is shared, both the metadata and the encrypted file data
 * are made accessible to the recipient.
 */

export interface SharedFileEntry {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: 'file' | 'folder';
  ownerId: string;       // Email of owner
  ownerName: string;     // Display name of owner
  recipientEmail: string; // Email of recipient
  sharedAt: Date;
  originalCreatedAt: Date;
  // New: Store the actual file data reference
  sharedFileDataKey?: string; // Key to access the shared file data
}

export const SHARED_FILES_KEY = 'shared_files_global';
export const SHARED_FILES_DATA_PREFIX = 'shared_file_data_';

/** Event name dispatched on `window` after every write. */
export const SHARED_FILES_EVENT = 'shared-files-updated';

/** Helper – notify the current tab that shared data changed. */
function notifyUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SHARED_FILES_EVENT));
  }
}

class SharedFilesManager {
  // ─── reads ──────────────────────────────────────────────────────────

  private getAllSharedEntries(): SharedFileEntry[] {
    try {
      const data = localStorage.getItem(SHARED_FILES_KEY);
      if (!data) return [];

      const parsed = JSON.parse(data);
      return parsed.map((entry: any) => ({
        ...entry,
        sharedAt: new Date(entry.sharedAt),
        originalCreatedAt: new Date(entry.originalCreatedAt),
      }));
    } catch (error) {
      console.error('Failed to load shared files:', error);
      return [];
    }
  }

  // ─── writes ─────────────────────────────────────────────────────────

  private saveAllSharedEntries(entries: SharedFileEntry[]) {
    try {
      localStorage.setItem(SHARED_FILES_KEY, JSON.stringify(entries));
      notifyUpdate();
    } catch (error) {
      console.error('Failed to save shared files:', error);
    }
  }

  // ─── file data sharing ──────────────────────────────────────────────

  /**
   * Store shared file data in a way that the recipient can access it.
   * Uses a special key format that includes both owner and recipient info.
   */
  private async storeSharedFileData(
    fileId: string,
    ownerEmail: string,
    recipientEmail: string,
    fileData: Blob
  ): Promise<string> {
    // Create a unique key for this shared file
    const sharedKey = `${SHARED_FILES_DATA_PREFIX}${ownerEmail}_to_${recipientEmail}_${fileId}`;
    
    try {
      // Convert blob to base64 for localStorage storage
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
      
      // Store in localStorage with metadata
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
      console.log('✅ Stored shared file data:', sharedKey);
      
      return sharedKey;
    } catch (error) {
      console.error('Failed to store shared file data:', error);
      throw error;
    }
  }

  /**
   * Retrieve shared file data that was shared with the current user.
   */
  async getSharedFileData(
    fileId: string,
    ownerEmail: string,
    recipientEmail: string
  ): Promise<Blob | null> {
    const sharedKey = `${SHARED_FILES_DATA_PREFIX}${ownerEmail}_to_${recipientEmail}_${fileId}`;
    
    try {
      const storedData = localStorage.getItem(sharedKey);
      if (!storedData) {
        console.error('❌ Shared file data not found:', sharedKey);
        return null;
      }
      
      const parsed = JSON.parse(storedData);
      
      // Convert base64 back to blob
      const byteCharacters = atob(parsed.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: parsed.mimeType });
      
      console.log('✅ Retrieved shared file data:', sharedKey);
      return blob;
    } catch (error) {
      console.error('Failed to retrieve shared file data:', error);
      return null;
    }
  }

  // ─── public API ─────────────────────────────────────────────────────

  /**
   * Share a file with another user.
   * Now also shares the actual file data!
   */
  async shareFile(
    fileId: string,
    fileName: string,
    fileSize: number,
    fileType: 'file' | 'folder',
    ownerEmail: string,
    ownerName: string,
    recipientEmail: string,
    originalCreatedAt: Date,
    fileData?: Blob // Optional: the actual file data to share
  ): Promise<boolean> {
    try {
      const entries = this.getAllSharedEntries();

      // Duplicate guard
      if (entries.some((e) => e.fileId === fileId && e.recipientEmail === recipientEmail)) {
        console.log('⚠️ File already shared with this user');
        return false;
      }

      // Store the file data if provided
      let sharedFileDataKey: string | undefined;
      if (fileData && fileType === 'file') {
        try {
          sharedFileDataKey = await this.storeSharedFileData(
            fileId,
            ownerEmail,
            recipientEmail,
            fileData
          );
          console.log('📦 Shared file data stored');
        } catch (error) {
          console.error('Failed to store shared file data:', error);
          // Continue anyway - at least share the metadata
        }
      }

      // Add the share entry
      entries.push({
        fileId,
        fileName,
        fileSize,
        fileType,
        ownerId: ownerEmail,
        ownerName,
        recipientEmail,
        sharedAt: new Date(),
        originalCreatedAt,
        sharedFileDataKey,
      });

      this.saveAllSharedEntries(entries);
      console.log(`✅ File ${fileName} shared with ${recipientEmail}`);
      return true;
    } catch (error) {
      console.error('Failed to share file:', error);
      return false;
    }
  }

  getSharedWithMe(currentUserEmail: string): SharedFileEntry[] {
    const shared = this.getAllSharedEntries().filter(
      (e) => e.recipientEmail === currentUserEmail
    );
    console.log(`📥 Found ${shared.length} files shared with ${currentUserEmail}`);
    return shared;
  }

  getSharedByMe(currentUserEmail: string): SharedFileEntry[] {
    return this.getAllSharedEntries().filter(
      (e) => e.ownerId === currentUserEmail
    );
  }

  unshareFile(fileId: string, recipientEmail: string): boolean {
    try {
      const entries = this.getAllSharedEntries();
      const entry = entries.find(
        (e) => e.fileId === fileId && e.recipientEmail === recipientEmail
      );

      // Also remove the shared file data
      if (entry && entry.sharedFileDataKey) {
        localStorage.removeItem(entry.sharedFileDataKey);
        console.log('🗑️ Removed shared file data');
      }

      this.saveAllSharedEntries(
        entries.filter(
          (e) => !(e.fileId === fileId && e.recipientEmail === recipientEmail)
        )
      );
      return true;
    } catch (error) {
      console.error('Failed to unshare file:', error);
      return false;
    }
  }

  removeAllSharesForFile(fileId: string): boolean {
    try {
      const entries = this.getAllSharedEntries();
      const toRemove = entries.filter((e) => e.fileId === fileId);

      // Remove all shared file data
      toRemove.forEach((entry) => {
        if (entry.sharedFileDataKey) {
          localStorage.removeItem(entry.sharedFileDataKey);
        }
      });

      this.saveAllSharedEntries(entries.filter((e) => e.fileId !== fileId));
      console.log(`🗑️ Removed all shares for file ${fileId}`);
      return true;
    } catch (error) {
      console.error('Failed to remove shares:', error);
      return false;
    }
  }

  isSharedWith(fileId: string, recipientEmail: string): boolean {
    return this.getAllSharedEntries().some(
      (e) => e.fileId === fileId && e.recipientEmail === recipientEmail
    );
  }

  getShareRecipients(fileId: string): string[] {
    return this.getAllSharedEntries()
      .filter((e) => e.fileId === fileId)
      .map((e) => e.recipientEmail);
  }

  /** Debug helper */
  getAllShares(): SharedFileEntry[] {
    return this.getAllSharedEntries();
  }

  /** Debug / dev helper */
  clearAllShares() {
    // Remove all shared file data
    const entries = this.getAllSharedEntries();
    entries.forEach((entry) => {
      if (entry.sharedFileDataKey) {
        localStorage.removeItem(entry.sharedFileDataKey);
      }
    });

    // Also scan and remove any orphaned shared file data
    Object.keys(localStorage)
      .filter((key) => key.startsWith(SHARED_FILES_DATA_PREFIX))
      .forEach((key) => localStorage.removeItem(key));

    localStorage.removeItem(SHARED_FILES_KEY);
    notifyUpdate();
    console.log('🧹 Cleared all shares and shared file data');
  }
}

export const sharedFilesManager = new SharedFilesManager();