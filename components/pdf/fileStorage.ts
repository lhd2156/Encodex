/**
 * File Storage using IndexedDB
 * Stores actual file content (blobs) for the vault
 */

const DB_NAME = 'VaultFileStorage';
const DB_VERSION = 1;
const STORE_NAME = 'files';

class FileStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      console.debug('[fileStorage] opening IndexedDB', { name: DB_NAME, version: DB_VERSION });
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[fileStorage] indexedDB open error', request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        console.debug('[fileStorage] indexedDB opened', request.result.name, request.result.version);
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.debug('[fileStorage] indexedDB onupgradeneeded - creating store if missing', STORE_NAME);
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Store a file blob in IndexedDB
   */
  async storeFile(fileId: string, file: File | Blob): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        console.debug('[fileStorage] putting file into store', { fileId, size: (file as any).size || 'unknown' });
        const request = store.put(file, fileId);

        request.onsuccess = () => {
          console.debug('[fileStorage] store.put onsuccess', fileId);
          resolve();
        };
        request.onerror = () => {
          console.error('[fileStorage] store.put onerror', fileId, request.error);
          reject(request.error);
        };
      } catch (e) {
        console.error('[fileStorage] storeFile transaction failed', e);
        reject(e);
      }
    });
  }

  /**
   * Alias for storeFile (for backward compatibility)
   */
  async saveFile(fileId: string, file: File | Blob): Promise<void> {
    return this.storeFile(fileId, file);
  }

  /**
   * Retrieve a file blob from IndexedDB
   */
  async getFile(fileId: string): Promise<Blob | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(fileId);

        request.onsuccess = () => {
          console.debug('[fileStorage] getFile onsuccess', fileId, !!request.result);
          resolve(request.result || null);
        };
        request.onerror = () => {
          console.error('[fileStorage] getFile onerror', fileId, request.error);
          reject(request.error);
        };
      } catch (e) {
        console.error('[fileStorage] getFile transaction failed', e);
        reject(e);
      }
    });
  }

  /**
   * Delete a file blob from IndexedDB
   */
  async deleteFile(fileId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        console.debug('[fileStorage] deleting file', fileId);
        const request = store.delete(fileId);

        request.onsuccess = () => {
          console.debug('[fileStorage] delete onsuccess', fileId);
          resolve();
        };
        request.onerror = () => {
          console.error('[fileStorage] delete onerror', fileId, request.error);
          reject(request.error);
        };
      } catch (e) {
        console.error('[fileStorage] deleteFile transaction failed', e);
        reject(e);
      }
    });
  }

  /**
   * Get a blob URL for a file
   */
  async getFileURL(fileId: string): Promise<string | null> {
    const blob = await this.getFile(fileId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    console.debug('[fileStorage] created object URL for', fileId, url);
    return url;
  }

  /**
   * Check if a file exists
   */
  async fileExists(fileId: string): Promise<boolean> {
    const file = await this.getFile(fileId);
    return file !== null;
  }

  /**
   * Return all file keys stored in the IndexedDB `files` store.
   */
  async getAllKeys(): Promise<string[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => {
          console.debug('[fileStorage] getAllKeys success', req.result?.length || 0);
          resolve(req.result as string[]);
        };
        req.onerror = () => {
          console.error('[fileStorage] getAllKeys error', req.error);
          reject(req.error);
        };
      } catch (e) {
        console.error('[fileStorage] getAllKeys transaction failed', e);
        reject(e);
      }
    });
  }
}

// Export singleton instance
export const fileStorage = new FileStorage();