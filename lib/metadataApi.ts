// FILE LOCATION: lib/metadataApi.ts
// Client-side library for metadata operations (replaces localStorage)

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
// TEMP DELETED SHARES (sender moved to trash)
// ========================================================================

export async function getTempDeletedShares(): Promise<string[]> {
  try {
    const response = await apiRequest('/api/metadata/temp-deleted');
    const data = await response.json();
    return data.fileIds || [];
  } catch (error) {
    console.error('Failed to get temp deleted shares:', error);
    return [];
  }
}

export async function addTempDeletedShares(fileIds: string[]): Promise<string[]> {
  try {
    const response = await apiRequest('/api/metadata/temp-deleted', {
      method: 'POST',
      body: JSON.stringify({ fileIds })
    });
    const data = await response.json();
    return data.fileIds || [];
  } catch (error) {
    console.error('Failed to add temp deleted shares:', error);
    return [];
  }
}

export async function removeTempDeletedShares(fileIds: string[]): Promise<string[]> {
  try {
    const response = await apiRequest('/api/metadata/temp-deleted', {
      method: 'DELETE',
      body: JSON.stringify({ fileIds })
    });
    const data = await response.json();
    return data.fileIds || [];
  } catch (error) {
    console.error('Failed to remove temp deleted shares:', error);
    return [];
  }
}

// ========================================================================
// RECEIVER TRASHED SHARES (receiver moved to trash)
// ========================================================================

export async function getReceiverTrashedShares(): Promise<string[]> {
  try {
    const response = await apiRequest('/api/metadata/receiver-trashed');
    const data = await response.json();
    return data.fileIds || [];
  } catch (error) {
    console.error('Failed to get receiver trashed shares:', error);
    return [];
  }
}

export async function addReceiverTrashedShares(fileIds: string[]): Promise<string[]> {
  try {
    const response = await apiRequest('/api/metadata/receiver-trashed', {
      method: 'POST',
      body: JSON.stringify({ fileIds })
    });
    const data = await response.json();
    return data.fileIds || [];
  } catch (error) {
    console.error('Failed to add receiver trashed shares:', error);
    return [];
  }
}

export async function removeReceiverTrashedShares(fileIds: string[]): Promise<string[]> {
  try {
    const response = await apiRequest('/api/metadata/receiver-trashed', {
      method: 'DELETE',
      body: JSON.stringify({ fileIds })
    });
    const data = await response.json();
    return data.fileIds || [];
  } catch (error) {
    console.error('Failed to remove receiver trashed shares:', error);
    return [];
  }
}

// ========================================================================
// HIDDEN SHARES (permanently hidden)
// ========================================================================

export async function getHiddenShares(): Promise<string[]> {
  try {
    const response = await apiRequest('/api/metadata/hidden');
    const data = await response.json();
    return data.fileIds || [];
  } catch (error) {
    console.error('Failed to get hidden shares:', error);
    return [];
  }
}

export async function addHiddenShares(fileIds: string[]): Promise<string[]> {
  try {
    const response = await apiRequest('/api/metadata/hidden', {
      method: 'POST',
      body: JSON.stringify({ fileIds })
    });
    const data = await response.json();
    return data.fileIds || [];
  } catch (error) {
    console.error('Failed to add hidden shares:', error);
    return [];
  }
}

export async function removeHiddenShares(fileIds: string[]): Promise<string[]> {
  try {
    const response = await apiRequest('/api/metadata/hidden', {
      method: 'DELETE',
      body: JSON.stringify({ fileIds })
    });
    const data = await response.json();
    return data.fileIds || [];
  } catch (error) {
    console.error('Failed to remove hidden shares:', error);
    return [];
  }
}

// ========================================================================
// HELPER: Get metadata for a specific user (for cross-user operations)
// ========================================================================

export async function getUserMetadata(userEmail: string, metadataType: 'temp-deleted' | 'receiver-trashed' | 'hidden'): Promise<string[]> {
  // This would require a new API endpoint that allows querying other users' metadata
  // For now, we'll need to handle this differently since users can't directly access
  // other users' metadata due to security
  console.warn('Cross-user metadata access not yet implemented');
  return [];
}