'use client';

import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import VaultUploadMenu from '@/components/vault/VaultUploadMenu';
import VaultMegaEmpty from '@/components/vault/VaultMegaEmpty';
import VaultTable from '@/components/vault/VaultTable';
import VaultContextMenu from '@/components/vault/VaultContextMenu';
import MoveToFolderModal from '@/components/vault/MoveToFolderModal';
import FolderModal from '@/components/vault/FolderModal';
import ConfirmModal from '@/components/vault/ConfirmModal';
import RenameModal from '@/components/vault/RenameModal';
import ShareModal from '@/components/vault/ShareModal';
import FilterBar from '@/components/vault/FilterBar';
import UploadProgressPopup from '@/components/vault/UploadProgressPopup';
import SearchBar from '@/components/vault/SearchBar';
import ProfileDropdown from '@/components/vault/ProfileDropdown';
import FileViewer from '@/components/pdf/FileViewer';
import UnlockVaultModal from '@/components/vault/UnlockVaultModal';
import { fileStorage } from '@/components/pdf/fileStorage';
import { downloadRecoveryKey } from '@/lib/recoveryKey';
import { useVault } from '@/hooks/useVault';
import { useVaultContext } from '@/lib/vault/vault-context';
import { sharedFilesManager } from '@/lib/sharedFilesManager';
import { getSession, isSessionValid, clearSession } from '@/lib/session';

const DynamicStorageStats = dynamic(
  () => import('@/components/storage/StorageStats'),
  { ssr: false }
);

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: 'file' | 'folder';
  createdAt: Date;
  parentFolderId?: string | null;
  isFavorite?: boolean;
  sharedBy?: string;
  owner?: string;
  ownerName?: string;
  isReceivedShare?: boolean;
}

// Helper function to get file icon based on file extension
const getFileIcon = (fileName: string): string => {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return '/encodex-image.svg';
  }
  // Videos
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'].includes(ext)) {
    return '/encodex-video.svg';
  }
  // Audio
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'].includes(ext)) {
    return '/encodex-audio.svg';
  }
  // Spreadsheets
  if (['xls', 'xlsx', 'csv', 'ods', 'tsv'].includes(ext)) {
    return '/encodex-spreadsheet.svg';
  }
  // Code
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'md', 'sql'].includes(ext)) {
    return '/encodex-code.svg';
  }
  // PDF
  if (ext === 'pdf') {
    return '/encodex-pdf.svg';
  }
  // Default file
  return '/encodex-file.svg';
};

export default function VaultPage() {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const initializedRef = React.useRef(false);
  const [userName, setUserName] = React.useState('');
  const [userEmail, setUserEmail] = React.useState('');
  const [userLastName, setUserLastName] = React.useState('');
  const [profileImage, setProfileImage] = React.useState<string | null>(null);

  // Get master key from vault context for encryption
  const { masterKey, unlocked, unlock } = useVaultContext();

  // SIDEBAR STATE
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [sidebarWidth, setSidebarWidth] = React.useState(350);
  const [isResizing, setIsResizing] = React.useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = React.useState(false);
  const profileRef = React.useRef<HTMLDivElement>(null);
  
  // RECOVERY KEY MODAL STATE - AT PAGE LEVEL
  const [showRecoveryKeyModal, setShowRecoveryKeyModal] = React.useState(false);
  const [recoveryKey, setRecoveryKey] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  
  const collapsedWidth = 100;
  const minExpandedWidth = 270;
  const maxSidebarWidth = 450;

  // Use the vault hook
  const {
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
    handlePermanentDelete,
    handleMoveToFolder,
    handleDownloadFile,
    handleToggleFavorite,
    handleShareFile,
    handleBulkDelete,
    handleBulkRestore,
    handleBulkPermanentDelete,
    handleSortChange,
    getSharedFilesCount,
    getVisibleTrashCount,
  } = useVault(userEmail, userName, masterKey ?? undefined);

  const [showUploadMenu, setShowUploadMenu] = React.useState(false);
  const [showFolderModal, setShowFolderModal] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; fileId: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmTargetId, setConfirmTargetId] = React.useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = React.useState(false);
  const [moveTargetId, setMoveTargetId] = React.useState<string | null>(null);
  const [bulkMoveTargetIds, setBulkMoveTargetIds] = React.useState<string[]>([]);
  const [renameModalOpen, setRenameModalOpen] = React.useState(false);
  const [renameTargetId, setRenameTargetId] = React.useState<string | null>(null);
  const [renameTargetName, setRenameTargetName] = React.useState('');
  const [completedUploads, setCompletedUploads] = React.useState<string[]>([]);
  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [shareTargetId, setShareTargetId] = React.useState<string | null>(null);
  const [currentShareRecipients, setCurrentShareRecipients] = React.useState<string[]>([]);
  const [viewingFile, setViewingFile] = React.useState<{ 
    url: string; 
    name: string; 
    type: string;
    fileId: string;
    isFavorite: boolean;
  } | null>(null);

  // Track completed uploads
  React.useEffect(() => {
    uploadProgress.forEach((item) => {
      if (item.progress === 100 && !completedUploads.includes(item.fileName)) {
        setCompletedUploads((prev) => [...prev, item.fileName]);
      }
    });
  }, [uploadProgress, completedUploads]);

  // Click outside profile dropdown
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Session init (client-only) — run in effect to avoid SSR/CSR mismatch
  React.useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (!isSessionValid()) {
      router.push('/register');
      return;
    }

    const session = getSession();
    if (session) {
      // Auth token is in sessionStorage (tab-specific!)
      const authToken = sessionStorage.getItem('auth_token');
      
      // Use auth token to get email (it's tab-specific, unlike localStorage)
      let finalEmail = session.userEmail;
      
      if (authToken) {
        // Decode JWT payload to get the correct email for THIS tab
        try {
          const payload = JSON.parse(atob(authToken.split('.')[1]));
          if (payload.email) {
            finalEmail = payload.email.toLowerCase();
          }
        } catch (e) {
          
        }
      }
      
      // Set email immediately (from token - accurate)
      setUserEmail(finalEmail);
      // Fetch user's ACTUAL name from database (not shared localStorage!)
      // The auth token is tab-specific, so this gets the correct user's profile
      const fetchProfile = async () => {
        if (!authToken) {
          // Fallback to session data if no token
          setUserName(session.firstName);
          setUserLastName(session.lastName || '');
          return;
        }
        
        try {
          const response = await fetch('/api/auth/profile', {
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
              setUserName(data.user.firstName);
              setUserLastName(data.user.lastName || '');
              return;
            }
          }
        } catch (e) {
          
        }
        
        // Fallback to session data
        setUserName(session.firstName);
        setUserLastName(session.lastName || '');
      };
      
      fetchProfile();
      
      // Load profile image using LOWERCASE email for consistency
      const normalizedEmail = finalEmail.toLowerCase();
      let savedImage = localStorage.getItem(`profile_image_${normalizedEmail}`);
      
      // Fallback: try session email casing (for backwards compatibility)
      if (!savedImage && session.userEmail !== normalizedEmail) {
        savedImage = localStorage.getItem(`profile_image_${session.userEmail}`);
        if (savedImage) {
          // Migrate to normalized key
          localStorage.setItem(`profile_image_${normalizedEmail}`, savedImage);
          localStorage.removeItem(`profile_image_${session.userEmail}`);
          }
      }
      
      if (savedImage) {
        setProfileImage(savedImage);
      }
    }
  }, [router]);

  // Listen for profile image changes (for real-time updates from settings)
  React.useEffect(() => {
    if (!userEmail) return;
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `profile_image_${userEmail}`) {
        setProfileImage(e.newValue);
      }
    };
    
    // Also check for changes via custom event (for same-tab updates)
    const handleProfileImageUpdate = () => {
      const savedImage = localStorage.getItem(`profile_image_${userEmail}`);
      setProfileImage(savedImage);
    };
    
    // Also listen for name changes from settings
    const handleProfileUpdate = () => {
      const savedImage = localStorage.getItem(`profile_image_${userEmail}`);
      setProfileImage(savedImage);
      
      // Re-read session/user data for updated name
      const session = getSession();
      const storedUser = localStorage.getItem('user');
      
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          if (user.firstName) setUserName(user.firstName);
          if (user.lastName !== undefined) setUserLastName(user.lastName || '');
        } catch (e) {
          
        }
      } else if (session) {
        setUserName(session.firstName);
        setUserLastName(session.lastName || '');
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('profileImageUpdated', handleProfileImageUpdate);
    window.addEventListener('profileUpdated', handleProfileUpdate);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('profileImageUpdated', handleProfileImageUpdate);
      window.removeEventListener('profileUpdated', handleProfileUpdate);
    };
  }, [userEmail]);

  // Clear selection when files are no longer visible (tab change, folder navigation, etc.)
  const displayFileIdsRef = React.useRef<string>('');
  React.useEffect(() => {
    const currentFileIdsStr = displayFiles.map(f => f.id).sort().join(',');
    
    // Only check selection when the visible file list actually changed
    if (displayFileIdsRef.current !== currentFileIdsStr) {
      displayFileIdsRef.current = currentFileIdsStr;
      
      if (selectedFiles.size > 0) {
        const currentFileIds = new Set(displayFiles.map(f => f.id));
        const updatedSelection = new Set(
          Array.from(selectedFiles).filter(id => currentFileIds.has(id))
        );
        // Only update state if selection actually changed
        if (updatedSelection.size !== selectedFiles.size) {
          setSelectedFiles(updatedSelection);
        }
      }
    }
  }, [displayFiles, selectedFiles, setSelectedFiles]);

  // Toggle sidebar collapse/expand
  const toggleSidebar = () => {
    if (sidebarCollapsed) {
      setSidebarWidth(350);
      setSidebarCollapsed(false);
    } else {
      setSidebarWidth(collapsedWidth);
      setSidebarCollapsed(true);
    }
  };

  // RESIZE HANDLERS
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      e.preventDefault();
      const newWidth = e.clientX;
      
      if (newWidth >= collapsedWidth && newWidth <= maxSidebarWidth) {
        setSidebarWidth(newWidth);
        const snapThreshold = (minExpandedWidth + collapsedWidth) / 2;
        if (newWidth > snapThreshold) {
          setSidebarCollapsed(false);
        }
      } else if (newWidth > maxSidebarWidth) {
        setSidebarWidth(maxSidebarWidth);
        setSidebarCollapsed(false);
      }
    };

    const handleMouseUp = () => {
      if (!isResizing) return;
      
      const snapThreshold = (minExpandedWidth + collapsedWidth) / 2;
      
      if (sidebarWidth < snapThreshold) {
        setSidebarWidth(collapsedWidth);
        setSidebarCollapsed(true);
      } else if (sidebarWidth < minExpandedWidth) {
        setSidebarWidth(minExpandedWidth);
        setSidebarCollapsed(false);
      }
      
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isResizing, sidebarWidth, sidebarCollapsed]);

  const handleSignOut = () => {
    clearSession();
    router.push('/login');
  };

  const handleSettings = () => {
    router.push('/settings');
    setShowProfileDropdown(false);
  };

  // MODIFIED: handleRecoveryKey now shows page-level modal
  const handleRecoveryKey = () => {
    setShowProfileDropdown(false);
    
    // Get existing recovery key from localStorage
    const keyStorageKey = `recovery_key_${userEmail}`;
    const key = localStorage.getItem(keyStorageKey) || '';
    
    if (!key) {
      alert('No recovery key found. Recovery keys are generated during account registration.');
      return;
    }
    
    setRecoveryKey(key);
    setCopied(false);
    setShowRecoveryKeyModal(true);
  };

  const requestPermanentDelete = (id: string) => {
    setConfirmTargetId(id);
    setConfirmOpen(true);
  };

  const startMoveToFolder = (fileId: string) => {
    setMoveTargetId(fileId);
    setBulkMoveTargetIds([]);
    setMoveModalOpen(true);
  };

  const startBulkMoveToFolder = () => {
    const selectedIds = Array.from(selectedFiles);
    if (selectedIds.length === 0) return;
    setMoveTargetId(null);
    setBulkMoveTargetIds(selectedIds);
    setMoveModalOpen(true);
  };

  const handleBulkMoveToFolder = async (targetFolderId: string | null) => {
    const idsToMove = bulkMoveTargetIds.length > 0 ? bulkMoveTargetIds : (moveTargetId ? [moveTargetId] : []);
    if (idsToMove.length === 0) return;
    
    // Move each file sequentially
    for (const fileId of idsToMove) {
      await handleMoveToFolder(fileId, targetFolderId);
    }
    
    // Clear selection and state
    setSelectedFiles(new Set());
    setBulkMoveTargetIds([]);
    setMoveTargetId(null);
  };

  const startRename = (fileId: string, fileName: string) => {
    setRenameTargetId(fileId);
    setRenameTargetName(fileName);
    setRenameModalOpen(true);
  };

  const handleUploadFile = () => {
    fileInputRef.current?.click();
  };

  const handleUploadFolder = () => {
    folderInputRef.current?.click();
  };

  const handleSelectFile = (fileId: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const openShareModal = async (id: string) => {
    setShareTargetId(id);
    setCurrentShareRecipients([]);
    setShareModalOpen(true);
    // Fetch recipients asynchronously
    try {
      const recipients = await sharedFilesManager.getShareRecipientsAsync(id);
      setCurrentShareRecipients(recipients);
    } catch (e) {
      
    }
  };

  const openFolderModal = () => {
    setShowFolderModal(true);
  };

  const createFolderWithName = (folderName: string) => {
    handleCreateFolder(folderName);
    setShowFolderModal(false);
  };

  const handleRemoveCompletedUpload = (fileName: string) => {
    setCompletedUploads((prev) => prev.filter((name) => name !== fileName));
  };

  const handleSelectUploadedFile = (fileName: string) => {
    const file = files.find((f) => f.name === fileName && f.type !== 'folder');
    if (file) {
      const newSelected = new Set(selectedFiles);
      newSelected.add(file.id);
      setSelectedFiles(newSelected);
    }
  };

  const handleUnselectAll = () => {
    setSelectedFiles(new Set());
  };

  const handleOpenFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || file.type === 'folder') return;
    
    try {
      const url = await fileStorage.getFileURL(fileId);
      if (url) {
        setViewingFile({ 
          url, 
          name: file.name, 
          type: file.name,
          fileId: file.id,
          isFavorite: file.isFavorite || false
        });
      } else {
        alert('File not found. It may not have been uploaded properly.');
      }
    } catch (error) {
      
      alert('Failed to open file. Please try again.');
    }
  };

  const handleSearchSelectFile = (fileId: string) => {
    setCurrentTab('vault');
    
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    
    if (file.parentFolderId) {
      setCurrentFolderId(file.parentFolderId);
    } else {
      setCurrentFolderId(null);
    }
    
    const newSelected = new Set<string>();
    newSelected.add(fileId);
    setSelectedFiles(newSelected);
    
    setTimeout(() => {
      const element = document.querySelector(`[data-file-id="${fileId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleSearchOpenFolder = (folderId: string) => {
    setCurrentTab('vault');
    setCurrentFolderId(folderId);
  };

  // Helper functions for Recents view
  const formatDate = (date: Date): string => {
    const d = new Date(date);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${hours}:${minutesStr} ${ampm}`;
  };

  const formatSize = (bytes: number): string => {
    const GB = 1024 ** 3;
    const MB = 1024 ** 2;
    if (bytes >= 0.1 * GB) return `${(bytes / GB).toFixed(2)} GB`;
    if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const getLocationPath = (file: FileItem): string => {
    const pathSegments: string[] = [];
    let currentId: string | null | undefined = file.parentFolderId;

    while (currentId) {
      const folder = files.find((f) => f.id === currentId && f.type === 'folder');
      if (!folder) break;
      pathSegments.unshift(folder.name);
      currentId = folder.parentFolderId;
    }

    if (pathSegments.length > 0) {
      return pathSegments.join(' > ');
    }
    
    return 'My Drive';
  };

  // RECOVERY KEY MODAL HANDLERS
  const handleCopyRecoveryKey = () => {
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadRecoveryKey = () => {
    downloadRecoveryKey(recoveryKey, userEmail);
  };

  const closeRecoveryModal = () => {
    setShowRecoveryKeyModal(false);
    setCopied(false);
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
      {/* UNLOCK VAULT MODAL - Show if vault is locked */}
      {!unlocked && (
        <UnlockVaultModal onUnlock={unlock} />
      )}
      
      {/* SIDEBAR */}
      <div
        className="relative border-r border-slate-700/30 bg-slate-900/50 backdrop-blur-sm flex flex-col transition-all duration-300 ease-out"
        style={{ 
          width: sidebarCollapsed ? collapsedWidth : sidebarWidth,
          transition: isResizing ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {/* SIDEBAR HEADER */}
        <div className="h-16 flex items-center justify-between px-5 mt-10">
          {sidebarWidth > 305 ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-orange-500">
                  <Image src="/encodex-logo-lock.svg" alt="Encodex" width={38} height={38} />
                </div>
                <span className="text-2xl font-bold text-white">Encodex</span>
              </div>
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors text-gray-400 hover:text-white flex-shrink-0"
                title="Collapse sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center w-full gap-6 py-2">
              <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center bg-orange-500">
                <Image src="/encodex-logo-lock.svg" alt="Encodex" width={38} height={38} />
              </div>
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 transition-colors text-gray-400 hover:text-white"
                title="Expand sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 overflow-y-auto pt-8 pb-6 px-3">
          <div className="space-y-2">
            {/* Cloud Drive */}
            <button
              onClick={() => {
                setCurrentTab('vault');
                setCurrentFolderId(null);
              }}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-lg transition-all ${
                currentTab === 'vault'
                  ? 'bg-blue-600/20 text-blue-400 border-l-4 border-blue-500'
                  : 'text-gray-400 hover:bg-slate-800/50 hover:text-white'
              } ${sidebarWidth <= 305 ? 'justify-center px-3' : ''}`}
              title={sidebarWidth <= 305 ? 'Cloud drive' : ''}
            >
              <svg className="w-7 h-7 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
              </svg>
              {sidebarWidth > 305 && <span className="text-lg font-medium">Cloud drive</span>}
            </button>

            {/* Shared */}
            <button
              onClick={() => {
                setCurrentTab('shared');
                setCurrentFolderId(null);
              }}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-lg transition-all ${
                currentTab === 'shared'
                  ? 'bg-blue-600/20 text-blue-400 border-l-4 border-blue-500'
                  : 'text-gray-400 hover:bg-slate-800/50 hover:text-white'
              } ${sidebarWidth <= 305 ? 'justify-center px-3' : ''}`}
              title={sidebarWidth <= 305 ? 'Shared items' : ''}
            >
              <svg className="w-7 h-7 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              {sidebarWidth > 305 && (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-lg font-medium">Shared items</span>
                  {getSharedFilesCount() > 0 && (
                    <span className="bg-slate-700/50 px-2.5 py-0.5 rounded text-sm text-gray-300">
                      {getSharedFilesCount()}
                    </span>
                  )}
                </div>
              )}
            </button>

            {/* Recents */}
            <button
              onClick={() => {
                setCurrentTab('recent');
                setCurrentFolderId(null);
              }}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-lg transition-all ${
                currentTab === 'recent'
                  ? 'bg-blue-600/20 text-blue-400 border-l-4 border-blue-500'
                  : 'text-gray-400 hover:bg-slate-800/50 hover:text-white'
              } ${sidebarWidth <= 305 ? 'justify-center px-3' : ''}`}
              title={sidebarWidth <= 305 ? 'Recents' : ''}
            >
              <svg className="w-7 h-7 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              {sidebarWidth > 305 && <span className="text-lg font-medium">Recents</span>}
            </button>

            {/* Favourites */}
            <button
              onClick={() => {
                setCurrentTab('favorites');
                setCurrentFolderId(null);
              }}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-lg transition-all ${
                currentTab === 'favorites'
                  ? 'bg-blue-600/20 text-blue-400 border-l-4 border-blue-500'
                  : 'text-gray-400 hover:bg-slate-800/50 hover:text-white'
              } ${sidebarWidth <= 305 ? 'justify-center px-3' : ''}`}
              title={sidebarWidth <= 305 ? 'Favourites' : ''}
            >
              <svg className="w-7 h-7 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
              {sidebarWidth > 305 && (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-lg font-medium">Favourites</span>
                  {files.filter(f => f.isFavorite).length > 0 && (
                    <span className="bg-slate-700/50 px-2.5 py-0.5 rounded text-sm text-gray-300">
                      {files.filter(f => f.isFavorite).length}
                    </span>
                  )}
                </div>
              )}
            </button>

            {/* Recycle Bin */}
            <button
              onClick={() => {
                setCurrentTab('trash');
                setCurrentFolderId(null);
              }}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-lg transition-all mt-6 ${
                currentTab === 'trash'
                  ? 'bg-blue-600/20 text-blue-400 border-l-4 border-blue-500'
                  : 'text-gray-400 hover:bg-slate-800/50 hover:text-white'
              } ${sidebarWidth <= 305 ? 'justify-center px-3' : ''}`}
              title={sidebarWidth <= 305 ? 'Recycle bin' : ''}
            >
              <svg className="w-7 h-7 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {sidebarWidth > 305 && (
                <div className="flex items-center justify-between flex-1">
                  <span className="text-lg font-medium">Rubbish bin</span>
                  {getVisibleTrashCount() > 0 && (
                    <span className="bg-slate-700/50 px-2.5 py-0.5 rounded text-sm text-gray-300">
                      {getVisibleTrashCount()}
                    </span>
                  )}
                </div>
              )}
            </button>
          </div>
        </nav>

        {/* STORAGE STATS */}
        {sidebarWidth > 305 && (
          <div className="p-5">
            <DynamicStorageStats used={storageUsed} />
          </div>
        )}

        {/* RESIZE HANDLE */}
        <div
          onMouseDown={startResizing}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-0 right-0 w-1 h-full cursor-ew-resize z-10 bg-slate-700/40 hover:bg-blue-400/60 transition-colors"
        />
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER WITH SEARCH BAR */}
        <div className="h-16 border-b border-slate-700/30 bg-slate-900/30 backdrop-blur-sm px-6 flex items-center justify-between gap-4 relative z-50">
          <SearchBar
            files={files}
            onSelectFile={handleSearchSelectFile}
            onOpenFolder={handleSearchOpenFolder}
          />
          
          <div className="relative flex-shrink-0" ref={profileRef}>
            <button
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className={`p-1.5 rounded-lg transition-all ${
                showProfileDropdown 
                  ? 'bg-slate-600' 
                  : 'hover:bg-slate-800/50'
              }`}
            >
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                  {(userName && userName.length > 0) ? userName.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
            </button>

            {showProfileDropdown && (
              <ProfileDropdown
                userName={userName}
                userLastName={userLastName}
                userEmail={userEmail}
                profileImage={profileImage}
                storageUsed={storageUsed}
                storageTotal={20 * 1024 ** 3}
                onSettings={handleSettings}
                onRecoveryKey={handleRecoveryKey}
                onSignOut={handleSignOut}
              />
            )}
          </div>
        </div>

        {/* UPLOAD MENU BAR */}
        <div className="border-b border-slate-700/30 bg-slate-900/20 backdrop-blur-sm px-8 py-4 relative">
          <h2 className="text-lg font-semibold text-white">
            {currentTab === 'vault' ? 'My Drive' : 
             currentTab === 'shared' ? 'Shared with me' :
             currentTab === 'favorites' ? 'Favourites' :
             currentTab === 'recent' ? 'Recent files' : 
             'Recycle Bin'}
          </h2>

          {/* Show upload menu in vault, or when inside a shared folder */}
          {(currentTab === 'vault' || (currentTab === 'shared' && currentFolderId)) && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2">
              <VaultUploadMenu
                showUploadMenu={showUploadMenu}
                setShowUploadMenu={setShowUploadMenu}
                fileInputRef={fileInputRef}
                folderInputRef={folderInputRef}
                onCreateFolder={openFolderModal}
                onFilesSelected={(files) => handleFilesSelected(files, currentFolderId)}
                currentFolderId={currentFolderId}
              />
            </div>
          )}
        </div>

        {/* BREADCRUMB */}
        <div className="border-b border-slate-700/20 px-8 py-3 bg-slate-900/10">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setCurrentFolderId(null)}
              className={`hover:text-orange-400 transition-colors ${
                currentFolderId ? 'text-gray-400' : 'text-white font-semibold'
              }`}
            >
              {currentTab === 'vault' ? 'Vault' : 
               currentTab === 'shared' ? 'Shared' :
               currentTab === 'favorites' ? 'Favourites' :
               currentTab === 'recent' ? 'Recent' : 
               'Recycle Bin'}
            </button>

            {currentFolderId && (() => {
              const segments: { id: string; name: string }[] = [];
              let id: string | null = currentFolderId;
              
              // Use appropriate file array based on tab
              const fileArray = currentTab === 'trash' ? deletedFiles : files;

              while (id) {
                const f = fileArray.find((x) => x.id === id && x.type === 'folder');
                if (!f) break;
                segments.unshift({ id: f.id, name: f.name });
                id = f.parentFolderId || null;
              }

              return segments.map((seg) => (
                <React.Fragment key={seg.id}>
                  <span className="text-gray-500">/</span>
                  <button
                    onClick={() => setCurrentFolderId(seg.id)}
                    className="text-orange-400 font-semibold hover:underline"
                  >
                    {seg.name}
                  </button>
                </React.Fragment>
              ));
            })()}
          </div>
        </div>

        {/* FILTER BAR / BULK ACTIONS */}
        {selectedFiles.size === 0 ? (
          <FilterBar 
            onFilterChange={setFilters}
            activeFilters={filters}
            currentTab={currentTab}
            onSelectAll={() => {
              const allFileIds = new Set(displayFiles.map(f => f.id));
              setSelectedFiles(allFileIds);
            }}
            onRecoverAll={() => {
              if (currentTab === 'trash' && displayFiles.length > 0) {
                const toRestore = [...displayFiles];
                toRestore.forEach(f => handleRestoreFile(f.id));
              }
            }}
            onDeleteAll={() => {
              if (currentTab === 'trash') {
                const allFileIds = new Set(displayFiles.map(f => f.id));
                setSelectedFiles(allFileIds);
                setConfirmTargetId('BULK');
                setConfirmOpen(true);
              }
            }}
            hasFiles={displayFiles.length > 0}
          />
        ) : (
          <>
            {(currentTab === 'vault' || currentTab === 'favorites' || currentTab === 'shared' || currentTab === 'recent') ? (
              <div className="px-8 py-4 border-b border-slate-700/20 bg-slate-800/40 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-base text-gray-300">
                    <span className="font-semibold text-orange-400">{selectedFiles.size}</span> item{selectedFiles.size > 1 ? 's' : ''} selected
                  </div>
                  <button
                    onClick={handleUnselectAll}
                    className="px-3 py-1.5 rounded-lg bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 text-sm font-semibold transition-colors"
                  >
                    Unselect all
                  </button>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={startBulkMoveToFolder}
                    className="px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <Image src="/encodex-folder.svg" alt="Folder" width={16} height={16} />
                    Move to folder
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <Image src="/encodex-trash.svg" alt="Trash" width={16} height={16} />
                    Move to trash
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-8 py-4 border-b border-slate-700/20 bg-slate-800/40 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-base text-gray-300">
                    <span className="font-semibold text-orange-400">{selectedFiles.size}</span> item{selectedFiles.size > 1 ? 's' : ''} selected
                  </div>
                  <button
                    onClick={handleUnselectAll}
                    className="px-3 py-1.5 rounded-lg bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 text-sm font-semibold transition-colors"
                  >
                    Unselect all
                  </button>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleBulkRestore}
                    className="px-4 py-2 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <Image src="/encodex-restore.svg" alt="Restore" width={16} height={16} />
                    Restore
                  </button>
                  <button
                    onClick={() => {
                      setConfirmTargetId('BULK');
                      setConfirmOpen(true);
                    }}
                    className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <Image src="/encodex-close.svg" alt="Delete" width={16} height={16} />
                    Delete permanently
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* FILES */}
        <div
          className="flex-1 overflow-auto p-8 flex flex-col"
          onDragOver={(e) => {
            if (currentTab === 'vault') e.preventDefault();
          }}
          onDrop={(e) => {
            if (currentTab === 'vault') {
              e.preventDefault();
              handleFilesSelected(
                Array.from(e.dataTransfer.files),
                currentFolderId
              );
            }
          }}
        >
          {displayFiles.length === 0 ? (
            <VaultMegaEmpty
              onUploadFile={handleUploadFile}
              onUploadFolder={handleUploadFolder}
              activeFilter={filters.type}
              showUploadButtons={currentTab === 'vault'}
            />
          ) : currentTab === 'recent' ? (
            // ─── RECENTS VIEW WITH TABLE STRUCTURE ───
            (() => {
              const now = new Date();
              const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
              const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
              const thisWeekStart = new Date(todayStart.getTime() - todayStart.getDay() * 24 * 60 * 60 * 1000);
              const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
              const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
              const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

              const getTimeGroup = (date: Date): string => {
                const d = new Date(date);
                if (d >= oneHourAgo) return 'Last hour';
                if (d >= todayStart) return 'Today';
                if (d >= yesterdayStart) return 'Yesterday';
                if (d >= thisWeekStart) return 'This week';
                if (d >= lastWeekStart) return 'Last week';
                if (d >= thisMonthStart) return 'This month';
                if (d >= lastMonthStart) return 'Last month';
                return 'Older';
              };

              const groups: { label: string; files: typeof displayFiles }[] = [];
              const groupOrder = ['Last hour', 'Today', 'Yesterday', 'This week', 'Last week', 'This month', 'Last month', 'Older'];

              displayFiles.forEach(file => {
                const label = getTimeGroup(new Date(file.createdAt));
                const existing = groups.find(g => g.label === label);
                if (existing) {
                  existing.files.push(file);
                } else {
                  groups.push({ label, files: [file] });
                }
              });

              groups.sort((a, b) => groupOrder.indexOf(a.label) - groupOrder.indexOf(b.label));

              return (
                <div className="flex flex-col gap-4">
                  <div className="border border-blue-700/30 rounded-lg overflow-hidden">
                    {/* TABLE HEADER - FIXED */}
                    <div className="grid grid-cols-12 gap-4 bg-blue-900/30 px-6 font-semibold text-sm text-gray-300 border-b border-blue-700/30 h-[60px] items-center sticky top-0 z-10">
                      <div className="col-span-1 flex items-center justify-center"></div>
                      <div className="col-span-3 flex items-center">Name</div>
                      <div className="col-span-2 flex items-center">Owner</div>
                      <div className="col-span-2 flex items-center">Modified</div>
                      <div className="col-span-2 flex items-center">Location</div>
                      <div className="col-span-1 flex items-center">Size</div>
                      <div className="col-span-1"></div>
                    </div>

                    {/* TIME GROUPS WITH FILES */}
                    {groups.map((group, groupIndex) => (
                      <React.Fragment key={group.label}>
                        {/* Time Period Header */}
                        <div className="bg-slate-800/50 border-b border-blue-700/20 px-6 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-5 bg-orange-400 rounded-full"></div>
                            <span className="text-base font-bold text-orange-400">{group.label}</span>
                          </div>
                        </div>

                        {/* Files in this time group */}
                        {group.files.map((item, fileIndex) => {
                          const isLast = groupIndex === groups.length - 1 && fileIndex === group.files.length - 1;
                          return (
                            <div
                              key={item.id}
                              data-file-id={item.id}
                              className={`grid grid-cols-12 gap-4 px-6 hover:bg-blue-800/30 transition-all group items-center h-[68px] ${
                                selectedFiles.has(item.id) ? 'bg-blue-800/30' : ''
                              } ${!isLast ? 'border-b border-blue-700/20' : ''}`}
                              onClick={() => {
                                if (item.type === 'folder') {
                                  setCurrentTab('vault');
                                  setCurrentFolderId(item.id);
                                } else {
                                  handleOpenFile(item.id);
                                }
                              }}
                            >
                              {/* Checkbox + Paperclip Area */}
                              <div className="col-span-1 flex items-center justify-end gap-2 h-full pr-1">
                                <input
                                  type="checkbox"
                                  checked={selectedFiles.has(item.id)}
                                  onChange={() => handleSelectFile(item.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-gray-500 text-orange-400 cursor-pointer flex-shrink-0"
                                />
                                {/* Paperclip indicator for shared files - right next to the Name column */}
                                <span className="flex-shrink-0 w-[16px] flex items-center justify-center leading-none">
                                  {(item as any).isReceivedShare && (
                                    <span className="opacity-70">
                                      <Image src="/encodex-paperclip.svg" alt="Shared" width={14} height={14} />
                                    </span>
                                  )}
                                </span>
                              </div>

                              {/* Name with HEART for favorites - Paper icon starts here */}
                              <div className="col-span-3 flex items-center min-w-0 max-w-full overflow-hidden h-full">
                                <div
                                  className="flex items-center w-full cursor-pointer min-w-0 overflow-hidden"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* File icon: ALWAYS 32px wide, aligned to start of Name column */}
                                  <span className="flex-shrink-0 w-[32px] flex items-center justify-center leading-none">
                                    <Image 
                                      src={item.type === 'folder' ? '/encodex-folder.svg' : getFileIcon(item.name)} 
                                      alt={item.type === 'folder' ? 'Folder' : 'File'} 
                                      width={28} 
                                      height={28} 
                                    />
                                  </span>
                                  {/* 12px fixed spacer between icon and text */}
                                  <span className="flex-shrink-0 w-[12px]" />
                                  {/* File name - takes remaining space */}
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    <span className="text-sm text-white font-medium block truncate leading-tight hover:underline">
                                      {item.name}
                                    </span>
                                  </div>
                                  {/* Heart icon shows for ALL favorited items regardless of tab */}
                                  {item.isFavorite && (
                                    <span className="flex-shrink-0 leading-none ml-2">
                                      <Image src="/encodex-heart-filled.svg" alt="Favorite" width={18} height={18} />
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Owner - shows actual owner for shared files */}
                              <div className="col-span-2 flex items-center min-w-0 h-full">
                                <div className="flex items-center gap-2 min-w-0">
                                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                  </svg>
                                  <span className="text-xs text-gray-400 truncate leading-tight">
                                    {(() => {
                                      if ((item as any).isReceivedShare) {
                                        if ((item as any).ownerName && (item as any).owner) {
                                          // only show "Name (email)" when name ≠ email
                                          if ((item as any).ownerName !== (item as any).owner) {
                                            return `${(item as any).ownerName} (${(item as any).owner})`;
                                          }
                                          return (item as any).owner;
                                        }
                                        if ((item as any).ownerName) return (item as any).ownerName;
                                        if ((item as any).owner) return (item as any).owner;
                                      }
                                      return 'me';
                                    })()}
                                  </span>
                                </div>
                              </div>

                              {/* Modified */}
                              <div className="col-span-2 flex items-center text-gray-400 text-sm truncate h-full">
                                {formatDate(item.createdAt)}
                              </div>

                              {/* Location */}
                              <div className="col-span-2 flex items-center gap-2 text-gray-400 text-sm min-w-0 h-full">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentTab('vault');
                                    setCurrentFolderId(item.parentFolderId || null);
                                  }}
                                  className="text-blue-400 hover:text-blue-300 hover:underline transition-colors truncate"
                                >
                                  {getLocationPath(item)}
                                </button>
                              </div>

                              {/* Size */}
                              <div className="col-span-1 flex items-center text-gray-400 text-sm h-full">
                                {item.type === 'folder' ? '—' : formatSize(item.size)}
                              </div>

                              {/* Action Buttons */}
                              <div className="col-span-1 flex items-center justify-end h-full">
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {/* Share */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openShareModal(item.id);
                                    }}
                                    className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                                    title="Share"
                                  >
                                    <Image src="/encodex-users.svg" alt="Share" width={18} height={18} />
                                  </button>

                                  {/* Download */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadFile(item.id);
                                    }}
                                    className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                                    title="Download"
                                  >
                                    <Image src="/encodex-download.svg" alt="Download" width={18} height={18} />
                                  </button>

                                  {/* Rename */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startRename(item.id, item.name);
                                    }}
                                    className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                                    title="Rename"
                                  >
                                    <Image src="/encodex-edit.svg" alt="Rename" width={18} height={18} />
                                  </button>

                                  {/* Favorite */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleFavorite(item.id);
                                    }}
                                    className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                                    title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
                                  >
                                    <Image 
                                      src={item.isFavorite ? '/encodex-heart-filled.svg' : '/encodex-heart-outline.svg'} 
                                      alt={item.isFavorite ? "Remove from favorites" : "Add to favorites"} 
                                      width={18} 
                                      height={18} 
                                    />
                                  </button>

                                  {/* Menu */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setContextMenu({ x: e.clientX, y: e.clientY, fileId: item.id });
                                    }}
                                    className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors text-gray-400 hover:text-white"
                                    title="More actions"
                                  >
                                    <span className="leading-none">⋮</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })()
          ) : (
            <VaultTable
              files={displayFiles}
              draggedFileId={draggedFileId}
              renameId={null}
              renameName=""
              currentTab={currentTab}
              selectedFiles={selectedFiles}
              onDragStart={setDraggedFileId}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {}}
              onDrop={(e, folderId) => {
                if (draggedFileId) {
                  handleMoveToFolder(draggedFileId, folderId);
                  setDraggedFileId(null);
                }
              }}
              onOpenFolder={setCurrentFolderId}
              onRenameStart={(id, name) => startRename(id, name)}
              onRenameSave={(id) => {}}
              setRenameName={() => {}}
              onRestoreFile={handleRestoreFile}
              onPermanentDelete={handlePermanentDelete}
              onRequestPermanentDelete={requestPermanentDelete}
              onContextMenu={(e, fileId) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, fileId });
              }}
              onMenuClick={(e, fileId) => {
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY, fileId });
              }}
              onSelectFile={handleSelectFile}
              onSelectAll={(ids) => setSelectedFiles(ids)}
              onBulkDelete={handleBulkDelete}
              onBulkRestore={handleBulkRestore}
              onBulkPermanentDelete={() => {
                setConfirmTargetId('BULK');
                setConfirmOpen(true);
              }}
              onDownloadFile={handleDownloadFile}
              onToggleFavorite={handleToggleFavorite}
              onShareFile={openShareModal}
              onOpenFile={handleOpenFile}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              allFiles={currentTab === 'trash' ? deletedFiles : files}
              currentUserEmail={userEmail}
              currentUserName={userName}
              currentUserProfileImage={profileImage}
            />
          )}
        </div>

        <UploadProgressPopup
          uploadProgress={uploadProgress}
          completedUploads={completedUploads}
          onClose={() => {
            setCompletedUploads([]);
          }}
          onRemoveCompleted={handleRemoveCompletedUpload}
          onSelectFile={handleSelectUploadedFile}
        />
      </div>

      {/* RECOVERY KEY MODAL - PAGE LEVEL - MATCHING REFERENCE LAYOUT */}
      {showRecoveryKeyModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={closeRecoveryModal}
          />

          {/* Modal Container */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              pointerEvents: 'none',
            }}
          >
            {/* Modal */}
            <div
              style={{
                width: '1050px',
                maxWidth: '95vw',
                height: '650px',
                maxHeight: '90vh',
                background: 'linear-gradient(to bottom, rgb(30 58 138), rgb(23 37 84))',
                borderRadius: '0.5rem',
                border: '1px solid rgba(29 78 216 / 0.5)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                position: 'relative',
                pointerEvents: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={closeRecoveryModal}
                style={{
                  position: 'absolute',
                  top: '1.5rem',
                  right: '1.5rem',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(30 58 138 / 0.3)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#9ca3af';
                }}
              >
                <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Content Container */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  padding: '3rem 4rem',
                }}
              >
                {/* Icon */}
                <div style={{ marginBottom: '2rem' }}>
                  <div
                    style={{
                      width: '8rem',
                      height: '8rem',
                      background: 'linear-gradient(to bottom right, rgba(59 130 246 / 0.2), rgba(37 99 235 / 0.2))',
                      borderRadius: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(59 130 246 / 0.3)',
                    }}
                  >
                    <svg style={{ width: '4rem', height: '4rem', color: '#fbbf24' }} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.65 10C11.7 7.31 8.9 5.5 5.77 6.12c-2.29.46-4.15 2.29-4.63 4.58C.32 14.57 3.26 18 7 18c2.61 0 4.83-1.67 5.65-4H17v2c0 1.1.9 2 2 2s2-.9 2-2v-2c1.1 0 2-.9 2-2s-.9-2-2-2h-8.35zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                    </svg>
                  </div>
                </div>

                {/* Title */}
                <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>
                  Account recovery
                </h2>
                
                {/* Description */}
                <p style={{ textAlign: 'center', color: '#d1d5db', marginBottom: '3rem', maxWidth: '42rem', lineHeight: '1.625' }}>
                  Export and save your recovery key to avoid your data becoming inaccessible should you ever lose your password or authenticator.{' '}
                  <span style={{ color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer' }}>Learn more.</span>
                </p>

                {/* Recovery Key Box */}
                <div
                  style={{
                    width: '100%',
                    maxWidth: '48rem',
                    background: 'rgba(23 37 84 / 0.5)',
                    border: '1px solid rgba(29 78 216 / 0.3)',
                    borderRadius: '0.5rem',
                    padding: '2rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'white', marginBottom: '0.75rem' }}>
                        Export your recovery key
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Image src="/encodex-key.svg" alt="Key" width={24} height={24} />
                        <code style={{ color: '#fbbf24', fontSize: '1.25rem', fontFamily: 'monospace', letterSpacing: '0.05em', userSelect: 'all' }}>
                          {recoveryKey}
                        </code>
                      </div>
                    </div>
                    
                    {/* Download Button */}
                    <button
                      onClick={handleDownloadRecoveryKey}
                      style={{
                        marginLeft: '2rem',
                        padding: '0.75rem 2rem',
                        backgroundColor: '#f97316',
                        color: 'white',
                        borderRadius: '0.5rem',
                        fontWeight: '600',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 10px 15px -3px rgba(249 115 22 / 0.2)',
                        fontSize: '1rem',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#ea580c';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f97316';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      Download
                    </button>
                  </div>
                  
                  {/* Copy Button */}
                  <button
                    onClick={handleCopyRecoveryKey}
                    style={{
                      marginTop: '1rem',
                      fontSize: '0.875rem',
                      color: copied ? '#34d399' : '#60a5fa',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: 0,
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!copied) e.currentTarget.style.color = '#93c5fd';
                    }}
                    onMouseLeave={(e) => {
                      if (!copied) e.currentTarget.style.color = '#60a5fa';
                    }}
                  >
                    {copied ? (
                      <>
                        <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Copied to clipboard!</span>
                      </>
                    ) : (
                      <>
                        <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy to clipboard</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      <VaultContextMenu
        contextMenu={contextMenu}
        files={files}
        onContextMenuClose={() => setContextMenu(null)}
        onRenameStart={(id, name) => startRename(id, name)}
        onDeleteFile={handleDeleteFile}
        onMoveToFolderStart={startMoveToFolder}
        onShareFile={openShareModal}
        onDownloadFile={handleDownloadFile}
        onToggleFavorite={handleToggleFavorite}
      />

      <FolderModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        onSubmit={createFolderWithName}
      />

      <ConfirmModal
        isOpen={confirmOpen}
        title={confirmTargetId === 'EMPTY_TRASH' ? 'Empty recycle bin?' : 'Permanently delete?'}
        description={
          confirmTargetId === 'EMPTY_TRASH' 
            ? 'This will permanently delete all items in the recycle bin. This cannot be undone.'
            : 'This will permanently delete the item and its contents. This cannot be undone.'
        }
        confirmLabel={confirmTargetId === 'EMPTY_TRASH' ? 'Empty recycle bin' : 'Delete permanently'}
        cancelLabel="Cancel"
        onConfirm={() => {
          if (confirmTargetId === 'BULK') handleBulkPermanentDelete();
          else if (confirmTargetId === 'EMPTY_TRASH') handleBulkPermanentDelete();
          else if (confirmTargetId) handlePermanentDelete(confirmTargetId);
          setConfirmTargetId(null);
        }}
        onClose={() => setConfirmOpen(false)}
      />

      <MoveToFolderModal
        isOpen={moveModalOpen}
        onClose={() => {
          setMoveModalOpen(false);
          setMoveTargetId(null);
          setBulkMoveTargetIds([]);
        }}
        files={files}
        excludeId={moveTargetId}
        excludeIds={bulkMoveTargetIds}
        onConfirm={(targetId) => {
          handleBulkMoveToFolder(targetId);
        }}
      />

      <RenameModal
        isOpen={renameModalOpen}
        onClose={() => {
          setRenameModalOpen(false);
          setRenameTargetId(null);
          setRenameTargetName('');
        }}
        currentName={renameTargetName}
        onRename={(newName) => {
          if (renameTargetId) {
            handleRenameFile(renameTargetId, newName);
          }
        }}
        itemType={renameTargetId ? (files.find(f => f.id === renameTargetId)?.type || 'file') : 'file'}
      />

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => {
          setShareModalOpen(false);
          setShareTargetId(null);
          setCurrentShareRecipients([]);
        }}
        currentUserName={userName}
        currentUserEmail={userEmail}
        currentUserProfileImage={profileImage}
        fileName={shareTargetId ? files.find(f => f.id === shareTargetId)?.name || '' : ''}
        fileId={shareTargetId}
        currentSharedWith={currentShareRecipients}
        onShare={(recipientEmail) => {
          if (!shareTargetId) return false;
          return handleShareFile(shareTargetId, recipientEmail, userName);
        }}
        onUnshare={async (recipientEmail: string) => {
          if (!shareTargetId) return false;
          try {
            const ok = await sharedFilesManager.unshareFile(shareTargetId, recipientEmail);
            if (ok) {
              // Update local state immediately
              setCurrentShareRecipients(prev => prev.filter(e => e !== recipientEmail));
            }
            // Trigger a sync so UI updates immediately
            sharedFilesManager.triggerSync();
            return ok;
          } catch (e) {
            
            return false;
          }
        }}
      />

      {/* File Viewer */}
      {viewingFile && (
        <FileViewer
          fileUrl={viewingFile.url}
          fileName={viewingFile.name}
          fileType={viewingFile.type}
          fileId={viewingFile.fileId}
          isFavorite={viewingFile.isFavorite}
          allFiles={displayFiles}
          currentFolderId={currentFolderId}
          onClose={() => {
            if (viewingFile.url.startsWith('blob:')) {
              URL.revokeObjectURL(viewingFile.url);
            }
            setViewingFile(null);
          }}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDeleteFile}
          onRename={(fileId, newName) => {
            handleRenameFile(fileId, newName);
            setViewingFile(prev => prev ? { ...prev, name: newName } : null);
          }}
          onNavigate={async (newFileId) => {
            if (viewingFile.url.startsWith('blob:')) {
              URL.revokeObjectURL(viewingFile.url);
            }
            await handleOpenFile(newFileId);
          }}
        />
      )}
    </div>
  );
}