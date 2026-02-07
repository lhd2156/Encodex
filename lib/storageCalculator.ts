// lib/storageCalculator.ts
// CORRECTED: Storage calculation that INCLUDES received shares on receiver side

/**
 * Calculate total storage used by a user
 * INCLUDES:
 * - Files owned by the user
 * - Files shared WITH the user (received shares)
 * 
 * This gives users a complete view of all storage they're using
 */
export function calculateUserStorage(userEmail: string, files: any[]): number {
  let totalSize = 0;
  
  console.log('📊 [STORAGE] Calculating storage for:', userEmail);
  console.log('📊 [STORAGE] Total files in vault:', files.length);
  
  for (const file of files) {
    // Skip folders (they don't have size)
    if (file.type === 'folder') {
      console.log(`  📁 Skipping folder: ${file.name}`);
      continue;
    }
    
    // Count ALL files (both owned and received shares)
    totalSize += file.size || 0;
    
    if (file.isReceivedShare || file.isSharedFile) {
      console.log(`  ✅ Counting received share: ${file.name} (${file.size} bytes) - Owner: ${file.owner || 'unknown'}`);
    } else {
      console.log(`  ✅ Counting owned file: ${file.name} (${file.size} bytes)`);
    }
  }
  
  console.log('📊 [STORAGE] Total calculated:', totalSize, 'bytes');
  console.log('📊 [STORAGE] Total calculated:', formatBytes(totalSize));
  return totalSize;
}

/**
 * Update storage in localStorage
 */
export function updateStorageInLocalStorage(userEmail: string, size: number): void {
  const storageKey = `storage_${userEmail}`;
  localStorage.setItem(storageKey, String(size));
  console.log('💾 [STORAGE] Updated storage in localStorage:', formatBytes(size));
}

/**
 * Get storage from localStorage
 */
export function getStorageFromLocalStorage(userEmail: string): number {
  const storageKey = `storage_${userEmail}`;
  const stored = localStorage.getItem(storageKey);
  return stored ? parseInt(stored, 10) : 0;
}

/**
 * Recalculate and sync storage
 * Call this after any file operation (upload, delete, share receive)
 */
export function recalculateStorage(userEmail: string, files: any[]): number {
  const newSize = calculateUserStorage(userEmail, files);
  updateStorageInLocalStorage(userEmail, newSize);
  return newSize;
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;
  const KB = 1024;
  
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${bytes} B`;
}