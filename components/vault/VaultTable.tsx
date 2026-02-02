'use client';

import React from 'react';

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: 'file' | 'folder';
  createdAt: Date;
  parentFolderId?: string | null;
  isFavorite?: boolean;
}

interface VaultTableProps {
  files: FileItem[];
  draggedFileId: string | null;
  renameId: string | null;
  renameName: string;
  currentTab: string;
  selectedFiles: Set<string>;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, folderId: string) => void;
  onContextMenu: (e: React.MouseEvent, fileId: string) => void;
  onOpenFolder: (folderId: string) => void;
  onRenameStart: (id: string, name: string) => void;
  onRenameSave: (id: string) => void;
  setRenameName: (name: string) => void;
  onRestoreFile: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onRequestPermanentDelete?: (id: string) => void;
  onMenuClick: (e: React.MouseEvent, fileId: string) => void;
  onSelectFile: (fileId: string) => void;
  onSelectAll: (ids: Set<string>) => void;
  onBulkDelete?: () => void;
  onBulkRestore?: () => void;
  onBulkPermanentDelete?: () => void;
  onDownloadFile?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onShareFile?: (id: string) => void;
  onOpenFile?: (id: string) => void;
  sortBy: 'name' | 'modified' | null;
  sortOrder: 'asc' | 'desc' | null;
  onSortChange: (column: 'name' | 'modified') => void;
  allFiles?: FileItem[];
}

export default function VaultTable({
  files,
  draggedFileId,
  renameId,
  renameName,
  currentTab,
  selectedFiles,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  onOpenFolder,
  onRenameStart,
  onRenameSave,
  setRenameName,
  onRestoreFile,
  onPermanentDelete,
  onRequestPermanentDelete,
  onMenuClick,
  onSelectFile,
  onSelectAll,
  onBulkDelete,
  onBulkRestore,
  onBulkPermanentDelete,
  onDownloadFile,
  onToggleFavorite,
  onShareFile,
  onOpenFile,
  sortBy,
  sortOrder,
  onSortChange,
  allFiles,
}: VaultTableProps) {
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);

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

  const getLocationPath = (file: FileItem, allFiles: FileItem[]): string => {
    const pathSegments: string[] = [];
    let currentId: string | null | undefined = file.parentFolderId;

    while (currentId) {
      const folder = allFiles.find((f) => f.id === currentId && f.type === 'folder');
      if (!folder) break;
      pathSegments.unshift(folder.name);
      currentId = folder.parentFolderId;
    }

    if (pathSegments.length > 0) {
      return pathSegments.join(' > ');
    }
    
    return currentTab === 'trash' ? 'Recycle Bin' : 'My Drive';
  };

  const getFolderItemCount = (folderId: string, allFiles: FileItem[]): number => {
    return allFiles.filter((f) => f.parentFolderId === folderId).length;
  };

  const SortIcon = ({ column }: { column: 'name' | 'modified' }) => {
    if (sortBy !== column) {
      return null;
    }
    return (
      <span className="ml-1 text-teal-400">
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const selectedCount = selectedFiles.size;

  return (
    <div className="flex flex-col gap-4">
      {/* TABLE */}
      <div className="border border-blue-700/30 rounded-lg overflow-hidden">
        {/* HEADER */}
        <div className="grid grid-cols-12 gap-4 bg-blue-900/30 px-6 font-semibold text-sm text-gray-300 border-b border-blue-700/30 h-[60px] items-center">
          <div className="col-span-1 flex items-center justify-center">
          </div>
          
          {/* Name - Sortable */}
          <button
            onClick={() => onSortChange('name')}
            className="col-span-3 flex items-center hover:text-white transition-colors text-left"
          >
            Name
            <SortIcon column="name" />
          </button>
          
          <div className="col-span-2 flex items-center">Owner</div>
          
          {/* Modified - Sortable */}
          <button
            onClick={() => onSortChange('modified')}
            className="col-span-2 flex items-center hover:text-white transition-colors text-left"
          >
            Modified
            <SortIcon column="modified" />
          </button>
          
          <div className="col-span-2 flex items-center">Location</div>
          <div className="col-span-1 flex items-center">Size</div>
          <div className="col-span-1"></div>
        </div>

        {/* ROWS */}
        {files.map((item) => {
          const isMenuOpen = openMenuId === item.id;
          const isDragOver = dragOverId === item.id;
          const isFolder = item.type === 'folder';
          const canDropHere = isFolder && draggedFileId && draggedFileId !== item.id;

          return (
            <div
              key={item.id}
              data-file-id={item.id}
              className={`grid grid-cols-12 gap-4 px-6 border-b border-blue-700/20 hover:bg-blue-800/30 transition-all group items-center h-[68px] ${
                isDragOver && canDropHere ? 'bg-teal-500/20 ring-2 ring-teal-400 shadow-lg' : ''
              } ${selectedFiles.has(item.id) ? 'bg-blue-800/30' : ''}`}
              draggable={currentTab === 'vault'}
              onDragStart={(e) => {
                onDragStart(item.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.id);
              }}
              onDragOver={(e) => {
                if (canDropHere) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverId(item.id);
                }
              }}
              onDragEnter={(e) => {
                if (canDropHere) {
                  e.preventDefault();
                  setDragOverId(item.id);
                }
              }}
              onDragLeave={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;
                
                if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
                  if (dragOverId === item.id) {
                    setDragOverId(null);
                  }
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverId(null);
                
                if (canDropHere) {
                  onDrop(e, item.id);
                }
              }}
              onDragEnd={() => {
                setDragOverId(null);
              }}
              onContextMenu={(e) => onContextMenu(e, item.id)}
              onClick={(e) => {
                // Single click anywhere (except name or buttons) selects the file
                const target = e.target as HTMLElement;
                
                // Check if click was on checkbox, buttons, or name
                const isCheckbox = target.closest('input[type="checkbox"]');
                const isButton = target.closest('button');
                const isNameArea = target.closest('[data-name-click-area]');
                
                if (!isCheckbox && !isButton && !isNameArea) {
                  onSelectFile(item.id);
                }
              }}
              onDoubleClick={(e) => {
                // Double click anywhere opens the file/folder
                const target = e.target as HTMLElement;
                
                // Don't trigger if double-clicking on checkbox or buttons
                const isCheckbox = target.closest('input[type="checkbox"]');
                const isButton = target.closest('button');
                
                if (!isCheckbox && !isButton) {
                  if (item.type === 'folder') {
                    onOpenFolder(item.id);
                  } else if (onOpenFile) {
                    onOpenFile(item.id);
                  }
                }
              }}
            >
              <div className="col-span-1 flex items-center justify-center h-full">
                <input
                  type="checkbox"
                  checked={selectedFiles.has(item.id)}
                  onChange={() => onSelectFile(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-gray-500 text-teal-400 cursor-pointer"
                />
              </div>

              {/* Name with HEART for favorites */}
              <div className="col-span-3 flex items-center gap-3 min-w-0 max-w-full overflow-hidden h-full">
                <div
                  data-name-click-area
                  className="flex items-center gap-3 w-full cursor-pointer min-w-0 overflow-hidden"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.type === 'folder') {
                      onOpenFolder(item.id);
                    } else if (onOpenFile) {
                      onOpenFile(item.id);
                    }
                  }}
                >
                  <span className="text-2xl flex-shrink-0 leading-none">
                    {item.type === 'folder' 
                      ? '📁' 
                      : item.name.toLowerCase().endsWith('.pdf')
                        ? '📄'
                        : '📄'}
                  </span>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className="text-sm text-white font-medium block truncate leading-tight hover:underline">
                      {item.name}
                    </span>
                  </div>
                  {/* Heart icon shows for ALL favorited items regardless of tab */}
                  {item.isFavorite && (
                    <span className="text-base flex-shrink-0 leading-none">❤️</span>
                  )}
                </div>
              </div>

              {/* Owner */}
              <div className="col-span-2 flex items-center min-w-0 h-full">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                  <span className="text-xs text-gray-400 truncate leading-tight">me</span>
                </div>
              </div>
              
              {/* Modified */}
              <div className="col-span-2 flex items-center text-gray-400 text-sm truncate h-full leading-tight">
                {formatDate(item.createdAt)}
              </div>
              
              {/* Location */}
              <div className="col-span-2 flex items-center gap-2 text-gray-400 text-sm min-w-0 h-full">
                <span className="text-base flex-shrink-0 leading-none">{currentTab === 'trash' ? '🗑️' : '📁'}</span>
                <span className="truncate leading-tight">
                  {getLocationPath(item, allFiles || files)}
                </span>
              </div>

              {/* Size */}
              <div className="col-span-1 flex items-center text-gray-400 text-sm h-full leading-tight">
                {item.type === 'folder' ? '—' : formatSize(item.size)}
              </div>

              {/* ACTION BUTTONS */}
              <div className="col-span-1 flex items-center justify-end h-full">
                {(currentTab === 'vault' || currentTab === 'favorites' || currentTab === 'shared' || currentTab === 'recent') && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Share */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onShareFile?.(item.id);
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
                        onDownloadFile?.(item.id);
                      }}
                      className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                      title={item.type === 'folder' ? 'Download as ZIP' : 'Download'}
                    >
                      <span className="text-base leading-none">⬇️</span>
                    </button>

                    {/* Rename */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRenameStart(item.id, item.name);
                      }}
                      className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                      title="Rename"
                    >
                      <span className="text-base leading-none">✏️</span>
                    </button>

                    {/* Favorite - HEART ICONS */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite?.(item.id);
                      }}
                      className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                      title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      <span className="text-base leading-none">
                        {item.isFavorite ? '❤️' : '🤍'}
                      </span>
                    </button>

                    {/* Three-dot Menu */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === item.id ? null : item.id);
                        onMenuClick(e, item.id);
                      }}
                      className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors text-gray-400 hover:text-white"
                      title="More actions"
                    >
                      <span className="leading-none">⋮</span>
                    </button>
                  </div>
                )}

                {currentTab === 'trash' && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Restore */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestoreFile?.(item.id);
                      }}
                      className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                      title="Restore"
                    >
                      <span className="text-base leading-none">↩️</span>
                    </button>

                    {/* Delete Permanently */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestPermanentDelete?.(item.id);
                      }}
                      className="p-1.5 hover:bg-gray-700/50 rounded-full transition-colors"
                      title="Delete permanently"
                    >
                      <span className="text-base leading-none">❌</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}