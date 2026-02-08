/**
 * Shared Files Manager - API-Based Version
 * 
 * This is a simplified API-based version that replaces the localStorage-based
 * implementation. All operations now go through the backend API.
 */

// Event constants for cross-component communication
export const SHARED_FILES_KEY = 'shared_files_global';
export const SHARED_FILES_DATA_PREFIX = 'shared_file_data_';
export const SHARED_FILES_EVENT = 'shared-files-updated';
export const SHARED_FILES_SYNC_TRIGGER = 'shared_files_sync_trigger';

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

// Helper to get auth token
const getAuthToken = () => typeof window !== 'undefined' ? sessionStorage.getItem('auth_token') : null;

// API call helper - returns null if no auth token (graceful handling for fresh signups)
const apiCall = async (endpoint: string, options: RequestInit = {}): Promise<any | null> => {
  const token = getAuthToken();
  if (!token) {
    // Return null instead of throwing - caller should handle this gracefully
    return null;
  }
  
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
    } catch { /* ignore */ }
    throw new Error(errorMsg);
  }
  
  try {
    return await response.json();
  } catch {
    return { success: true };
  }
};

class SharedFilesManager {
  
  /**
   * Trigger a sync event for all listeners
   */
  triggerSync(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SHARED_FILES_EVENT));
    }
  }

  /**
   * Get files shared WITH a user (user is recipient)
   * Now uses API instead of localStorage
   */
  async getSharedWithMeAsync(currentUserEmail: string): Promise<SharedFileEntry[]> {
    try {
      const response = await apiCall('/api/shares');
      // Handle no auth token (returns null) or empty response
      if (!response) return [];
      const allShares = response.data || [];
      
      // Normalize email for case-insensitive comparison
      const normalizedEmail = currentUserEmail.toLowerCase();
      
      const sharedWithMe = allShares
        .filter((share: any) => share.recipientEmail?.toLowerCase() === normalizedEmail)
        .map((share: any) => ({
          fileId: share.fileId,
          fileName: share.fileName,
          fileSize: share.fileSize || 0,
          fileType: share.fileType,
          ownerId: share.file?.ownerEmail || '',
          ownerName: share.file?.ownerName || '',
          recipientEmail: share.recipientEmail,
          sharedAt: new Date(share.createdAt || Date.now()),
          originalCreatedAt: new Date(share.file?.createdAt || Date.now()),
          parentFolderId: share.parentFolderId || null,
        }));
      
      return sharedWithMe;
    } catch (error) {
      
      return [];
    }
  }

  /**
   * Synchronous version that returns cached data or empty array
   * For backwards compatibility - prefer using async version
   */
  getSharedWithMe(currentUserEmail: string): SharedFileEntry[] {
    // Return empty array synchronously - components should use async version
    // or rely on state management
    return [];
  }

  /**
   * Get files shared BY a user (user is owner)
   */
  async getSharedByMeAsync(currentUserEmail: string): Promise<SharedFileEntry[]> {
    try {
      const response = await apiCall('/api/shares');
      // Handle no auth token (returns null) or empty response
      if (!response) return [];
      const allShares = response.data || [];
      
      // Normalize email for case-insensitive comparison
      const normalizedEmail = currentUserEmail.toLowerCase();
      
      const sharedByMe = allShares
        .filter((share: any) => share.file?.ownerEmail?.toLowerCase() === normalizedEmail)
        .map((share: any) => ({
          fileId: share.fileId,
          fileName: share.fileName,
          fileSize: share.fileSize || 0,
          fileType: share.fileType,
          ownerId: currentUserEmail,
          ownerName: share.file?.ownerName || '',
          recipientEmail: share.recipientEmail,
          sharedAt: new Date(share.createdAt || Date.now()),
          originalCreatedAt: new Date(share.file?.createdAt || Date.now()),
          parentFolderId: share.parentFolderId || null,
        }));
      
      return sharedByMe;
    } catch (error) {
      
      return [];
    }
  }

  getSharedByMe(currentUserEmail: string): SharedFileEntry[] {
    return [];
  }

  /**
   * Get list of recipients for a specific file
   */
  async getShareRecipientsAsync(fileId: string): Promise<string[]> {
    try {
      const response = await apiCall('/api/shares/recipients', {
        method: 'POST',
        body: JSON.stringify({ fileId })
      });
      // Handle no auth token (returns null)
      if (!response) return [];
      return response.recipients || [];
    } catch (error) {
      
      return [];
    }
  }

  /**
   * Synchronous version for backwards compatibility
   */
  getShareRecipients(fileId: string): string[] {
    // Return empty immediately - callers should update to use async version
    return [];
  }

  /**
   * Share a file with a recipient
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
    parentFolderId?: string | null,
    fileData?: Blob
  ): Promise<boolean> {
    try {
      const response = await apiCall('/api/shares', {
        method: 'POST',
        body: JSON.stringify({
          fileId,
          fileName,
          fileSize,
          fileType,
          recipientEmail,
          parentFolderId,
        })
      });

      // Handle no auth token (returns null)
      if (!response) return false;
      if (response.success || response.id) {
        this.triggerSync();
        return true;
      }
      return false;
    } catch (error) {
      
      return false;
    }
  }

  /**
   * Unshare a file from a specific recipient
   */
  async unshareFile(fileId: string, recipientEmail: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/shares?fileId=${fileId}&recipientEmail=${encodeURIComponent(recipientEmail)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      });

      if (response.ok) {
        this.triggerSync();
        return true;
      }
      return false;
    } catch (error) {
      
      return false;
    }
  }

  /**
   * Remove all shares for a file
   */
  async removeAllSharesForFile(fileId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/shares/all?fileId=${fileId}&recursive=true`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      });

      if (response.ok) {
        this.triggerSync();
        return true;
      }
      return false;
    } catch (error) {
      
      return false;
    }
  }

  /**
   * Update the name/location of a shared file
   */
  async updateShareEntry(
    fileId: string,
    newFileName?: string,
    newParentFolderId?: string | null
  ): Promise<boolean> {
    try {
      const response = await apiCall('/api/shares', {
        method: 'PATCH',
        body: JSON.stringify({
          fileId,
          fileName: newFileName,
          parentFolderId: newParentFolderId,
        })
      });

      // Handle no auth token (returns null)
      if (!response) return false;
      if (response.success) {
        this.triggerSync();
        return true;
      }
      return false;
    } catch (error) {
      
      return false;
    }
  }
}

// Export singleton instance
export const sharedFilesManager = new SharedFilesManager();
