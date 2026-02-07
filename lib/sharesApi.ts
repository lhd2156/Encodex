// FILE LOCATION: lib/sharesApi.ts
// Client-side library for sharing operations (replaces localStorage)

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('auth_token');
}

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No auth token found');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (response.status === 401) {
    // Session expired
    throw new Error('Unauthorized');
  }

  return response;
}

// ========================================================================
// TYPES
// ========================================================================

export interface ShareEntry {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: 'file' | 'folder';
  ownerId: string;
  ownerName: string;
  recipientEmail: string;
  sharedAt: string;
  originalCreatedAt: string;
  parentFolderId?: string | null;
  sharedFileDataKey?: string;
}

// ========================================================================
// EVENT CONSTANTS (for compatibility with existing code)
// ========================================================================

export const SHARED_FILES_EVENT = 'shared-files-updated';

/**
 * Trigger sync across tabs
 */
export function triggerSync() {
  if (typeof window !== 'undefined') {
    console.log('🔔 [API] Dispatching SHARED_FILES_EVENT');
    window.dispatchEvent(new Event(SHARED_FILES_EVENT));
  }
}

// ========================================================================
// GET OPERATIONS
// ========================================================================

/**
 * Get all shares (both sent and received)
 */
export async function getAllShares(): Promise<ShareEntry[]> {
  try {
    const response = await apiRequest('/api/shares');
    const data = await response.json();
    return data.shares || [];
  } catch (error) {
    console.error('Failed to get all shares:', error);
    return [];
  }
}

/**
 * Get shares sent to the current user
 */
export async function getSharedWithMe(email: string): Promise<ShareEntry[]> {
  try {
    const allShares = await getAllShares();
    return allShares.filter(share => share.recipientEmail === email);
  } catch (error) {
    console.error('Failed to get shared with me:', error);
    return [];
  }
}

/**
 * Get shares sent by the current user
 */
export async function getSharedByMe(email: string): Promise<ShareEntry[]> {
  try {
    const allShares = await getAllShares();
    return allShares.filter(share => share.ownerId === email || share.ownerName === email);
  } catch (error) {
    console.error('Failed to get shared by me:', error);
    return [];
  }
}

/**
 * Get list of recipients for a specific file
 */
export async function getShareRecipients(fileId: string): Promise<string[]> {
  try {
    const response = await apiRequest('/api/shares/recipients', {
      method: 'POST',
      body: JSON.stringify({ fileId })
    });
    const data = await response.json();
    return data.recipients || [];
  } catch (error) {
    console.error('Failed to get share recipients:', error);
    return [];
  }
}

/**
 * Check if file is shared with a specific recipient
 */
export async function isSharedWith(fileId: string, recipientEmail: string): Promise<boolean> {
  try {
    const recipients = await getShareRecipients(fileId);
    return recipients.includes(recipientEmail);
  } catch (error) {
    console.error('Failed to check if shared:', error);
    return false;
  }
}

// ========================================================================
// CREATE OPERATIONS
// ========================================================================

export interface CreateShareParams {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: 'file' | 'folder';
  ownerName: string;
  recipientEmail: string;
  originalCreatedAt: string | Date;
  parentFolderId?: string | null;
  sharedFileDataKey?: string;
}

/**
 * Create a new share
 */
export async function createShare(params: CreateShareParams): Promise<boolean> {
  try {
    const response = await apiRequest('/api/shares', {
      method: 'POST',
      body: JSON.stringify({
        fileId: params.fileId,
        fileName: params.fileName,
        fileSize: params.fileSize || 0,
        fileType: params.fileType || 'file',
        ownerName: params.ownerName,
        recipientEmail: params.recipientEmail,
        originalCreatedAt: params.originalCreatedAt instanceof Date 
          ? params.originalCreatedAt.toISOString() 
          : params.originalCreatedAt,
        parentFolderId: params.parentFolderId,
        sharedFileDataKey: params.sharedFileDataKey
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to create share:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to create share:', error);
    return false;
  }
}

// ========================================================================
// DELETE OPERATIONS
// ========================================================================

/**
 * Delete a specific share (unshare with one recipient)
 */
export async function deleteShare(fileId: string, recipientEmail: string): Promise<boolean> {
  try {
    const response = await apiRequest('/api/shares', {
      method: 'DELETE',
      body: JSON.stringify({ fileId, recipientEmail })
    });

    if (!response.ok) {
      console.error('Failed to delete share');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to delete share:', error);
    return false;
  }
}

/**
 * Delete all shares for a file (unshare with everyone)
 */
export async function deleteAllSharesForFile(fileId: string): Promise<boolean> {
  try {
    const response = await apiRequest('/api/shares', {
      method: 'DELETE',
      body: JSON.stringify({ fileId })
    });

    if (!response.ok) {
      console.error('Failed to delete all shares');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to delete all shares:', error);
    return false;
  }
}

// ========================================================================
// UPDATE OPERATIONS
// ========================================================================

/**
 * Update share file name
 */
export async function updateShareName(fileId: string, fileName: string): Promise<boolean> {
  try {
    const response = await apiRequest('/api/shares', {
      method: 'PATCH',
      body: JSON.stringify({ fileId, fileName })
    });

    if (!response.ok) {
      console.error('Failed to update share name');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to update share name:', error);
    return false;
  }
}

/**
 * Update share parent folder
 */
export async function updateShareParent(fileId: string, parentFolderId: string | null): Promise<boolean> {
  try {
    const response = await apiRequest('/api/shares', {
      method: 'PATCH',
      body: JSON.stringify({ fileId, parentFolderId })
    });

    if (!response.ok) {
      console.error('Failed to update share parent');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to update share parent:', error);
    return false;
  }
}