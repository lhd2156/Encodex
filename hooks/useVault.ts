'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fileStorage } from '@/components/pdf/fileStorage';
import { sharedFilesManager, SHARED_FILES_EVENT } from '@/lib/sharedFilesManager';

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

  // ─── FIX: guard flag ────────────────────────────────────────────────
  // This ref is set to true ONLY after the initial load effect has run
  // and populated state from localStorage. The persist effects check this
  // flag and skip writing until it is true — otherwise they would
  // overwrite localStorage with the empty initial state on the very first
  // render, silently destroying all saved data.
  const hasLoaded = useRef(false);

  // ─── shared-files sync ──────────────────────────────────────────────
  const syncSharedFiles = useCallback(() => {
    const sharedWithMe = sharedFilesManager.getSharedWithMe(userEmail);
    const sharedFileItems: FileItem[] = sharedWithMe.map((share) => ({
      id: share.fileId,
      name: share.fileName,
      size: share.fileSize,
      type: share.fileType,
      createdAt: share.originalCreatedAt,
      parentFolderId: null,
      sharedBy: share.ownerId,
      sharedByName: share.ownerName,
      owner: share.ownerId,
      ownerName: share.ownerName,
      isSharedFile: true,
      isFavorite: false,
    }));

    setFiles((prev) => {
      const ownFiles = prev.filter((f) => !f.isSharedFile);
      return [...ownFiles, ...sharedFileItems];
    });
  }, [userEmail]);

  // 1) Initial load (own files + shared files)
  useEffect(() => {
    // Guard: only load for a valid email
    if (!userEmail) return;

    const savedFiles = localStorage.getItem(`vault_${userEmail}`);
    const savedTrash = localStorage.getItem(`trash_${userEmail}`);
    const savedStorage = localStorage.getItem(`storage_${userEmail}`);

    let loadedFiles: FileItem[] = [];
    if (savedFiles) {
      const parsed = JSON.parse(savedFiles);
      loadedFiles = parsed.map((f: any) => ({ ...f, createdAt: new Date(f.createdAt) }));
    }

    setFiles(loadedFiles);

    if (savedTrash) {
      const parsed = JSON.parse(savedTrash);
      setDeletedFiles(parsed.map((f: any) => ({ ...f, createdAt: new Date(f.createdAt) })));
    }
    if (savedStorage) {
      setStorageUsed(parseInt(savedStorage, 10));
    }

    // Mark that the initial load is done — persist effects are now safe to run.
    hasLoaded.current = true;

    syncSharedFiles();
  }, [userEmail, syncSharedFiles]);

  // 2) Listen for the custom same-tab event
  useEffect(() => {
    const handler = () => syncSharedFiles();
    window.addEventListener(SHARED_FILES_EVENT, handler);
    return () => window.removeEventListener(SHARED_FILES_EVENT, handler);
  }, [syncSharedFiles]);

  // 3) Listen for the native cross-tab `storage` event
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'shared_files_global') {
        syncSharedFiles();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [syncSharedFiles]);

  // ─── persist own files (GUARDED) ────────────────────────────────────
  useEffect(() => {
    if (!hasLoaded.current || !userEmail) return; // ← skip until initial load is done and require userEmail
    const ownFiles = files.filter((f) => !f.isSharedFile);
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
    if (!hasLoaded.current || !userEmail) return; // ← skip until initial load is done and require userEmail
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
    if (!hasLoaded.current || !userEmail) return; // ← skip until initial load is done and require userEmail
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
  // Ensure operations that mutate persistent state only run when a valid userEmail
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
    checkInTrash: boolean = false
  ) => {
    const siblings = checkInTrash ? deletedFiles : files;

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

    let idx = 1;
    let name = isFolder ? `${baseName} (${idx})` : `${nameWithoutExt} (${idx})${extension}`;
    while (exists(name)) {
      idx += 1;
      name = isFolder ? `${baseName} (${idx})` : `${nameWithoutExt} (${idx})${extension}`;
    }

    return name;
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
    const filesArray = Array.from(fileList);
    console.debug('[useVault] handleFilesSelected start', { userEmail, parentId, count: filesArray.length });
    const newProgress: UploadProgress[] = [];
    const folderMap = new Map<string, string>();
    const newFiles: FileItem[] = [];

    for (const file of filesArray) {
      const webkitPath = (file as any).webkitRelativePath || '';
      const parts = webkitPath ? webkitPath.split('/') : [file.name];
      let currentParent = parentId;

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

      const uniqueFileName = makeUniqueName(file.name, currentParent, false, false);
      const fileId = Math.random().toString(36).substring(2, 11);
      newFiles.push({
        id: fileId,
        name: uniqueFileName,
        size: file.size,
        type: 'file',
        createdAt: new Date(),
        parentFolderId: currentParent,
        owner: userEmail,
      });

      newProgress.push({ fileId, fileName: uniqueFileName, progress: 0 });
    }

    setFiles((prev) => {
      const combined = [...prev, ...newFiles];
      try {
        console.log('[useVault] Added uploaded entries', {
          userEmail,
          addedCount: newFiles.length,
          addedNames: newFiles.map((n) => ({ id: n.id, name: n.name, type: n.type })),
        });
      } catch (e) {
        console.debug('[useVault] log failed', e);
      }

      // Dispatch a visible event for easy inspection in Console/UI
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vault-uploaded', { detail: { userEmail, newFiles } }));
        }
      } catch (e) {
        console.debug('[useVault] event dispatch failed', e);
      }

      return combined;
    });

    setUploadProgress(newProgress);

    const totalSize = filesArray.reduce((sum, f) => sum + f.size, 0);
    console.debug('[useVault] appending new files', { newFilesCount: newFiles.length, totalSize });
    setStorageUsed((prev) => prev + totalSize);

    // Store each file blob via fileStorage, keyed by the matching newFiles entry
    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      // Find the corresponding FileItem for this raw File.
      // newFiles are appended in the same order as filesArray (one entry per file,
      // after any folder entries), so we match by scanning for the right file entry.
      const fileItem = newFiles.find(
        (nf) => nf.type === 'file' && nf.size === file.size && nf.name.startsWith(file.name.split('.')[0])
      );

      if (fileItem) {
        try {
          console.debug('[useVault] storing blob -> fileStorage', { fileId: fileItem.id, name: fileItem.name, size: file.size });
          await fileStorage.storeFile(fileItem.id, file);
          console.debug('[useVault] stored blob -> fileStorage', { fileId: fileItem.id });
          // Confirm stored by dispatching event
          try {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('vault-file-stored', { detail: { fileId: fileItem.id, name: fileItem.name } }));
            }
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

    setTimeout(() => setUploadProgress([]), 500);
  };

  // ─── folder ─────────────────────────────────────────────────────────
  const handleCreateFolder = (folderName: string) => {
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
    setFiles([...files, newFolder]);
  };

  // ─── rename ─────────────────────────────────────────────────────────
  const handleRenameFile = (id: string, newName: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;
    if (file.isSharedFile) {
      console.log('Cannot rename shared files');
      return;
    }

    if (!ensureUser('handleRenameFile')) return;

    const uniqueName = makeUniqueName(
      newName,
      file.parentFolderId ?? null,
      file.type === 'folder',
      false
    );

    setFiles(files.map((f) => (f.id === id ? { ...f, name: uniqueName } : f)));
  };

  // ─── delete ─────────────────────────────────────────────────────────
  const handleDeleteFile = (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;
    if (file.isSharedFile) {
      console.log('Cannot delete shared files');
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

    setFiles(files.filter((f) => !toDelete.some((d) => d.id === f.id)));
    setDeletedFiles([...deletedFiles, ...deletedItems]);

    const totalSize = toDelete.filter((f) => f.type === 'file').reduce((sum, f) => sum + f.size, 0);
    setStorageUsed(Math.max(0, storageUsed - totalSize));

    sharedFilesManager.removeAllSharesForFile(id);
  };

  // ─── restore ────────────────────────────────────────────────────────
  const handleRestoreFile = (id: string) => {
    const file = deletedFiles.find((f) => f.id === id);
    if (!file) return;
    if (!ensureUser('handleRestoreFile')) return;
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

    const restoredItems = toRestore.map((item) => ({
      ...item,
      parentFolderId: item.originalParentId ?? null,
      originalParentId: undefined,
    }));

    setDeletedFiles(deletedFiles.filter((f) => !toRestore.some((r) => r.id === f.id)));
    setFiles([...files, ...restoredItems]);

    const totalSize = toRestore.filter((f) => f.type === 'file').reduce((sum, f) => sum + f.size, 0);
    setStorageUsed(storageUsed + totalSize);
  };

  // ─── permanent delete ───────────────────────────────────────────────
  const handlePermanentDelete = async (id: string) => {
    const file = deletedFiles.find((f) => f.id === id);
    if (!file) return;
    if (!ensureUser('handlePermanentDelete')) return;
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

    for (const item of toDelete) {
      if (item.type === 'file') {
        try {
          await fileStorage.deleteFile(item.id);
        } catch (error) {
          console.error('Failed to delete file from storage:', error);
        }
      }
    }

    setDeletedFiles(deletedFiles.filter((f) => !toDelete.some((d) => d.id === f.id)));
  };

  // ─── move ───────────────────────────────────────────────────────────
  const handleMoveToFolder = (fileId: string, targetFolderId: string | null) => {
    if (!ensureUser('handleMoveToFolder')) return;
    setFiles(
      files.map((f) => (f.id === fileId ? { ...f, parentFolderId: targetFolderId } : f))
    );
  };

  // ─── download ───────────────────────────────────────────────────────
  const handleDownloadFile = async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;

    try {
      if (file.type === 'file') {
        const blob = await fileStorage.getFile(id);
        if (!blob) {
          console.error('File not found in storage');
          alert('File not found. It may not have been uploaded properly.');
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 100);

        console.log('Downloaded:', file.name);
      } else {
        // Folder → ZIP
        console.log('Starting folder download for:', file.name);

        const getAllFilesInFolder = (folderId: string, folderPath: string = ''): Array<{file: FileItem, path: string}> => {
          const results: Array<{file: FileItem, path: string}> = [];
          const children = files.filter(f => f.parentFolderId === folderId);

          for (const child of children) {
            if (child.type === 'folder') {
              const subfolderPath = folderPath ? `${folderPath}/${child.name}` : child.name;
              results.push(...getAllFilesInFolder(child.id, subfolderPath));
            } else {
              const filePath = folderPath ? `${folderPath}/${child.name}` : child.name;
              results.push({ file: child, path: filePath });
            }
          }

          return results;
        };

        const filesToZip = getAllFilesInFolder(file.id);
        console.log('Files to zip:', filesToZip.length);

        if (filesToZip.length === 0) {
          alert('This folder is empty.');
          return;
        }

        let JSZip;
        try {
          JSZip = (await import('jszip')).default;
        } catch (error) {
          console.error('Failed to load JSZip:', error);
          alert('Failed to load ZIP library. Make sure jszip is installed: npm install jszip');
          return;
        }

        const zip = new JSZip();
        let addedFiles = 0;

        for (const { file: fileItem, path } of filesToZip) {
          try {
            const blob = await fileStorage.getFile(fileItem.id);
            if (blob) {
              zip.file(path, blob);
              addedFiles++;
            } else {
              console.warn(`File not found in storage: ${fileItem.name}`);
            }
          } catch (error) {
            console.error(`Error getting file ${fileItem.name}:`, error);
          }
        }

        if (addedFiles === 0) {
          alert('No files could be added to the ZIP. They may not have been uploaded properly.');
          return;
        }

        const zipBlob = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        });

        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.name}.zip`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 100);

        console.log('Downloaded folder as ZIP:', file.name);
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert(`Failed to download: ${(error as Error).message || 'Unknown error'}`);
    }
  };

  // ─── favourites ─────────────────────────────────────────────────────
  const handleToggleFavorite = (id: string) => {
    if (!ensureUser('handleToggleFavorite')) return;
    setFiles(files.map((f) => (f.id === id ? { ...f, isFavorite: !f.isFavorite } : f)));
  };

  // ─── sharing ────────────────────────────────────────────────────────
  const handleShareFile = (fileId: string, recipientEmail: string, ownerName: string): boolean => {
    const file = files.find((f) => f.id === fileId);
    if (!file) {
      console.error('File not found');
      return false;
    }

    if (file.isSharedFile) {
      console.log('Cannot share a file that was shared with you');
      return false;
    }

    if (!ensureUser('handleShareFile')) return false;

    const success = sharedFilesManager.shareFile(
      file.id,
      file.name,
      file.size,
      file.type,
      userEmail,
      ownerName || userEmail,
      recipientEmail,
      file.createdAt
    );

    if (success) {
      console.log(`Successfully shared ${file.name} with ${recipientEmail}`);
    }

    return success;
  };

  const handleUnshareFile = (fileId: string, recipientEmail: string) => {
    if (!ensureUser('handleUnshareFile')) return false;
    return sharedFilesManager.unshareFile(fileId, recipientEmail);
  };

  // ─── bulk delete ────────────────────────────────────────────────────
  const handleBulkDelete = () => {
    if (!ensureUser('handleBulkDelete')) return;
    const filesToDelete: FileItem[] = [];

    selectedFiles.forEach((id) => {
      const file = files.find((f) => f.id === id);
      if (!file || file.isSharedFile) return;

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

      filesToDelete.push(...toDelete);
    });

    const uniqueFilesToDelete = Array.from(
      new Map(filesToDelete.map((f) => [f.id, f])).values()
    );

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

    setFiles(files.filter((f) => !uniqueFilesToDelete.some((d) => d.id === f.id)));
    setDeletedFiles([...deletedFiles, ...deletedItems]);

    const totalSize = uniqueFilesToDelete
      .filter((f) => f.type === 'file')
      .reduce((sum, f) => sum + f.size, 0);
    setStorageUsed(Math.max(0, storageUsed - totalSize));

    uniqueFilesToDelete.forEach((file) => {
      sharedFilesManager.removeAllSharesForFile(file.id);
    });

    setSelectedFiles(new Set());
  };

  // ─── bulk restore ───────────────────────────────────────────────────
  const handleBulkRestore = () => {
    if (!ensureUser('handleBulkRestore')) return;
    const filesToRestore: FileItem[] = [];

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

      let toRestore = [file];
      if (file.type === 'folder') {
        toRestore = toRestore.concat(getAllDescendants(file.id));
      }

      filesToRestore.push(...toRestore);
    });

    const uniqueFilesToRestore = Array.from(
      new Map(filesToRestore.map((f) => [f.id, f])).values()
    );

    const restoredItems = uniqueFilesToRestore.map((item) => ({
      ...item,
      parentFolderId: item.originalParentId ?? null,
      originalParentId: undefined,
    }));

    setDeletedFiles(deletedFiles.filter((f) => !uniqueFilesToRestore.some((r) => r.id === f.id)));
    setFiles([...files, ...restoredItems]);

    const totalSize = uniqueFilesToRestore
      .filter((f) => f.type === 'file')
      .reduce((sum, f) => sum + f.size, 0);
    setStorageUsed(storageUsed + totalSize);

    setSelectedFiles(new Set());
  };

  // Restore a set of files by id (used by page-level "Recover all" flows)
  const handleRestoreFiles = (ids: string[]) => {
    if (!ensureUser('handleRestoreFiles')) return;
    const filesToRestore: FileItem[] = [];

    ids.forEach((id) => {
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

      let toRestore = [file];
      if (file.type === 'folder') {
        toRestore = toRestore.concat(getAllDescendants(file.id));
      }

      filesToRestore.push(...toRestore);
    });

    const uniqueFilesToRestore = Array.from(
      new Map(filesToRestore.map((f) => [f.id, f])).values()
    );

    const restoredItems = uniqueFilesToRestore.map((item) => ({
      ...item,
      parentFolderId: item.originalParentId ?? null,
      originalParentId: undefined,
    }));

    setDeletedFiles(deletedFiles.filter((f) => !uniqueFilesToRestore.some((r) => r.id === f.id)));
    setFiles([...files, ...restoredItems]);

    const totalSize = uniqueFilesToRestore
      .filter((f) => f.type === 'file')
      .reduce((sum, f) => sum + f.size, 0);
    setStorageUsed(storageUsed + totalSize);
  };

  // Unshare a file for all recipients (owner action)
  const handleUnshareAll = (fileId: string) => {
    if (!ensureUser('handleUnshareAll')) return false;
    try {
      sharedFilesManager.removeAllSharesForFile(fileId);
      return true;
    } catch (e) {
      console.error('[useVault] handleUnshareAll failed', e);
      return false;
    }
  };

  // ─── bulk permanent delete ──────────────────────────────────────────
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

    for (const item of uniqueFilesToDelete) {
      if (item.type === 'file') {
        try {
          await fileStorage.deleteFile(item.id);
        } catch (error) {
          console.error('Failed to delete file from storage:', error);
        }
      }
    }

    setDeletedFiles(deletedFiles.filter((f) => !uniqueFilesToDelete.some((d) => d.id === f.id)));
    setSelectedFiles(new Set());
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
        baseFiles = files.filter((f) =>
          currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId
        );
        baseFiles = baseFiles.filter((f) => !f.isSharedFile);
        break;

      case 'shared':
        baseFiles = files.filter((f) => f.isSharedFile);
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
        baseFiles = deletedFiles.filter((f) =>
          currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId
        );
        break;

      default:
        baseFiles = files.filter((f) =>
          currentFolderId ? f.parentFolderId === currentFolderId : !f.parentFolderId
        );
    }

    // Type filter
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

    // Modified filter
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

    // Sorting
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
      const filtered = all.filter((s) => {
        try {
          // check in-memory trash
          if (deletedFiles.some((d) => d.id === s.fileId || (d as any).sharedMeta?.fileId === s.fileId || (d as any).originalSharedId === s.fileId)) {
            return false;
          }
          // check persisted trash (other tab)
          try {
            const raw = localStorage.getItem(`trash_${userEmail}`);
            if (raw) {
              const parsed = JSON.parse(raw) as any[];
              if (parsed.some((d) => d && (d.id === s.fileId || (d.sharedMeta && d.sharedMeta.fileId === s.fileId) || d.originalSharedId === s.fileId))) {
                return false;
              }
            }
          } catch (e) {
            // ignore parse errors
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
  };
}