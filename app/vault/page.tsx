'use client';

import React from 'react';
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
import { fileStorage } from '@/components/pdf/fileStorage';
import { useVault } from '@/hooks/useVault';
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
}

export default function VaultPage() {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const initializedRef = React.useRef(false);
  const [userName, setUserName] = React.useState('');
  const [userEmail, setUserEmail] = React.useState('');
  const [userLastName, setUserLastName] = React.useState('');

  // SIDEBAR STATE
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [sidebarWidth, setSidebarWidth] = React.useState(600);
  const [isResizing, setIsResizing] = React.useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = React.useState(false);
  const profileRef = React.useRef<HTMLDivElement>(null);
  
  const collapsedWidth = 100;
  const minExpandedWidth = 270;
  const maxSidebarWidth = 600;

  // Use the vault hook
  // FIX 1: Added handleShareFile to the destructuring so we actually get
  //         the hook's 3-argument share function into scope.
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
    handleRestoreFiles,
    handlePermanentDelete,
    handleMoveToFolder,
    handleDownloadFile,
    handleToggleFavorite,
    handleShareFile,           // <-- THIS was missing. It's the real share logic.
    handleUnshareAll,
    handleBulkDelete,
    handleBulkRestore,
    handleBulkPermanentDelete,
    handleSortChange,
    getSharedFilesCount,
  } = useVault(userEmail);

  const [showUploadMenu, setShowUploadMenu] = React.useState(false);
  const [showFolderModal, setShowFolderModal] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; fileId: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmTargetId, setConfirmTargetId] = React.useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = React.useState(false);
  const [moveTargetId, setMoveTargetId] = React.useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = React.useState(false);
  const [renameTargetId, setRenameTargetId] = React.useState<string | null>(null);
  const [renameTargetName, setRenameTargetName] = React.useState('');
  const [completedUploads, setCompletedUploads] = React.useState<string[]>([]);
  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [shareTargetId, setShareTargetId] = React.useState<string | null>(null);
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
      setUserName(session.firstName);
      setUserLastName(session.lastName || '');
      setUserEmail(session.userEmail);
    }
  }, [router]);

  // Clear selection when switching tabs
  const previousTabRef = React.useRef(currentTab);
  React.useEffect(() => {
    if (previousTabRef.current !== currentTab) {
      const newViewFileIds = new Set(displayFiles.map(f => f.id));
      const updatedSelection = new Set(
        Array.from(selectedFiles).filter(id => newViewFileIds.has(id))
      );
      setSelectedFiles(updatedSelection);
      previousTabRef.current = currentTab;
    }
  }, [currentTab, displayFiles, selectedFiles, setSelectedFiles]);

  // Toggle sidebar collapse/expand
  const toggleSidebar = () => {
    if (sidebarCollapsed) {
      setSidebarWidth(600);
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
    console.log('Open settings');
    setShowProfileDropdown(false);
  };

  const handleRecoveryKey = () => {
    console.log('Show recovery key');
    setShowProfileDropdown(false);
  };

  const handle2FA = () => {
    console.log('Setup 2FA');
    setShowProfileDropdown(false);
  };

  const requestPermanentDelete = (id: string) => {
    setConfirmTargetId(id);
    setConfirmOpen(true);
  };

  const startMoveToFolder = (fileId: string) => {
    setMoveTargetId(fileId);
    setMoveModalOpen(true);
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

  // FIX 2: Renamed from handleShareFile → openShareModal.
  //         The old name shadowed the hook's handleShareFile, so the modal's
  //         onShare was calling THIS (which just re-opens the modal and returns
  //         undefined) instead of the hook's actual share logic.
  const openShareModal = (id: string) => {
    setShareTargetId(id);
    setShareModalOpen(true);
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
      console.error('Error opening file:', error);
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

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
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
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-lg">E</span>
                </div>
                <span className="text-xl font-semibold text-white">Encodex</span>
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
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <span className="text-white font-bold text-lg">E</span>
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
                  {deletedFiles.length > 0 && (
                    <span className="bg-slate-700/50 px-2.5 py-0.5 rounded text-sm text-gray-300">
                      {deletedFiles.length}
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
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
            </button>

            {showProfileDropdown && (
              <ProfileDropdown
                userName={userName}
                userLastName={userLastName}
                userEmail={userEmail}
                storageUsed={storageUsed}
                storageTotal={20 * 1024 ** 3}
                onSettings={handleSettings}
                onRecoveryKey={handleRecoveryKey}
                on2FA={handle2FA}
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

          {currentTab === 'vault' && (
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
              className={`hover:text-teal-400 transition-colors ${
                currentFolderId ? 'text-gray-400' : 'text-white font-semibold'
              }`}
            >
              {currentTab === 'vault' ? 'Vault' : 
               currentTab === 'shared' ? 'Shared' :
               currentTab === 'favorites' ? 'Favourites' :
               currentTab === 'recent' ? 'Recent' : 
               'Recycle Bin'}
            </button>

            {currentFolderId && (currentTab === 'vault' || currentTab === 'favorites') && (() => {
              const segments: { id: string; name: string }[] = [];
              let id: string | null = currentFolderId;
              
              const fileArray = currentTab === 'vault' || currentTab === 'favorites' ? files : deletedFiles;

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
                    className="text-teal-400 font-semibold hover:underline"
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
                const ids = displayFiles.map((f) => f.id);
                handleRestoreFiles(ids);
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
                    <span className="font-semibold text-teal-400">{selectedFiles.size}</span> item{selectedFiles.size > 1 ? 's' : ''} selected
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
                    onClick={handleBulkDelete}
                    className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    🗑️ Move to trash
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-8 py-4 border-b border-slate-700/20 bg-slate-800/40 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-base text-gray-300">
                    <span className="font-semibold text-teal-400">{selectedFiles.size}</span> item{selectedFiles.size > 1 ? 's' : ''} selected
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
                    className="px-4 py-2 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    ↩️ Restore
                  </button>
                  <button
                    onClick={() => {
                      setConfirmTargetId('BULK');
                      setConfirmOpen(true);
                    }}
                    className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    ❌ Delete permanently
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
                            <div className="w-1 h-5 bg-teal-400 rounded-full"></div>
                            <span className="text-base font-bold text-teal-400">{group.label}</span>
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
                              <div className="col-span-1 flex items-center h-full">
                                <input
                                  type="checkbox"
                                  checked={selectedFiles.has(item.id)}
                                  onChange={() => handleSelectFile(item.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-gray-500 text-teal-400 cursor-pointer flex-shrink-0"
                                />
                                {/* Spacer to push paperclip to the right, closer to paper icon */}
                                <div className="flex-1" />
                                {/* Paperclip indicator for shared files - right next to the Name column */}
                                <span className="flex-shrink-0 w-[16px] flex items-center justify-center leading-none">
                                  {(item as any).isReceivedShare && (
                                    <span className="text-sm opacity-70">📎</span>
                                  )}
                                </span>
                              </div>

                              {/* Name with HEART for favorites - Paper icon starts here */}
                              <div className="col-span-3 flex items-center min-w-0 max-w-full overflow-hidden h-full">
                                <div
                                  className="flex items-center w-full cursor-pointer min-w-0 overflow-hidden"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* Paper icon: ALWAYS 32px wide, aligned to start of Name column */}
                                  <span className="flex-shrink-0 w-[32px] flex items-center justify-center leading-none text-2xl">
                                    {item.type === 'folder' ? '📁' : '📄'}
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
                                    <span className="text-base flex-shrink-0 leading-none ml-2">❤️</span>
                                  )}
                                </div>
                              </div>

                              {/* Owner */}
                              <div className="col-span-2 flex items-center min-w-0 h-full">
                                <div className="flex items-center gap-2 min-w-0">
                                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                  </svg>
                                  <span className="text-xs text-gray-400 truncate leading-tight">
                                    {(() => {
                                      if ((item as any).isReceivedShare) {
                                        if ((item as any).ownerName && (item as any).owner) {
                                          return `${(item as any).ownerName} (${(item as any).owner})`;
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
                                    // After navigating to the parent folder, also select the file
                                    // so it becomes checked in the destination view.
                                    setTimeout(() => {
                                      handleSelectFile(item.id);
                                    }, 100);
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
                                  {/* Share — FIX 2: calls openShareModal, not handleShareFile */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openShareModal(item.id);
                                    }}
                                    className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                                    title="Share"
                                  >
                                    <span className="text-base leading-none">👥</span>
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
                                    <span className="text-base leading-none">⬇️</span>
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
                                    <span className="text-base leading-none">✏️</span>
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
                                    <span className="text-base leading-none">
                                      {item.isFavorite ? '❤️' : '🤍'}
                                    </span>
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
              onUnshareFile={(fileId) => handleUnshareAll(fileId)}
              onOpenFile={handleOpenFile}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              allFiles={currentTab === 'trash' ? deletedFiles : files}
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

      {/* MODALS */}
      <VaultContextMenu
        contextMenu={contextMenu}
        files={files}
        onContextMenuClose={() => setContextMenu(null)}
        onRenameStart={(id, name) => startRename(id, name)}
        onDeleteFile={handleDeleteFile}
        onMoveToFolderStart={startMoveToFolder}
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
        }}
        files={files}
        excludeId={moveTargetId}
        onConfirm={(targetId) => {
          if (moveTargetId) handleMoveToFolder(moveTargetId, targetId);
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

      {/* FIX 3: onShare now calls the hook's handleShareFile (the real one).
          It returns a boolean — true = success, false = failure.
          The ShareModal uses that boolean to show its own success/error state
          and auto-closes itself after 2 seconds on success. */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => {
          setShareModalOpen(false);
          setShareTargetId(null);
        }}
        currentUserName={userName}
        currentUserEmail={userEmail}
        fileName={shareTargetId ? files.find(f => f.id === shareTargetId)?.name || '' : ''}
        onShare={(recipientEmail) => {
          if (!shareTargetId) return false;
          return handleShareFile(shareTargetId, recipientEmail, userName);
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