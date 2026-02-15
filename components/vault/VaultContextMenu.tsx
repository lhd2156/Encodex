'use client';

import React from 'react';
import Image from 'next/image';

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: 'file' | 'folder';
  createdAt: Date;
  parentFolderId?: string | null;
  isFavorite?: boolean;
}

interface VaultContextMenuProps {
  contextMenu: { x: number; y: number; fileId: string } | null;
  files: FileItem[];
  onContextMenuClose: () => void;
  onRenameStart: (id: string, name: string) => void;
  onDeleteFile: (id: string) => void;
  onMoveToFolderStart?: (fileId: string) => void;
  onShareFile?: (fileId: string) => void;
  onDownloadFile?: (fileId: string) => void;
  onToggleFavorite?: (fileId: string) => void;
}

export default function VaultContextMenu({
  contextMenu,
  files,
  onContextMenuClose,
  onRenameStart,
  onDeleteFile,
  onMoveToFolderStart,
  onShareFile,
  onDownloadFile,
  onToggleFavorite,
}: VaultContextMenuProps) {
  if (!contextMenu) return null;

  const item = files.find((f) => f.id === contextMenu.fileId);

  // Position menu to the LEFT of the click point
  const menuWidth = 180; // approximate width of menu
  const leftPosition = contextMenu.x - menuWidth;

  return (
    <>
      {/* Click-away backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onContextMenuClose}
      />

      {/* Menu - positioned to the LEFT */}
      <div
        className="fixed z-50 bg-blue-900 border border-blue-700/50 rounded-lg shadow-xl overflow-hidden min-w-[180px]"
        style={{
          left: leftPosition,
          top: contextMenu.y,
        }}
      >
        {/* Share */}
        {onShareFile && (
          <button
            onClick={() => {
              onShareFile(contextMenu.fileId);
              onContextMenuClose();
            }}
            className="w-full text-left px-4 py-2 text-white hover:bg-blue-800 transition-colors text-sm flex items-center gap-2"
          >
            <Image src="/encodex-users.svg" alt="Share" width={16} height={16} />
            Share
          </button>
        )}

        {/* Download */}
        {onDownloadFile && (
          <button
            onClick={() => {
              onDownloadFile(contextMenu.fileId);
              onContextMenuClose();
            }}
            className="w-full text-left px-4 py-2 text-white hover:bg-blue-800 transition-colors text-sm flex items-center gap-2 border-t border-blue-700/30"
          >
            <Image src="/encodex-download.svg" alt="Download" width={16} height={16} />
            {item?.type === 'folder' ? 'Download as ZIP' : 'Download'}
          </button>
        )}

        {/* Rename */}
        <button
          onClick={() => {
            if (item) onRenameStart(item.id, item.name);
            onContextMenuClose();
          }}
          className="w-full text-left px-4 py-2 text-white hover:bg-blue-800 transition-colors text-sm flex items-center gap-2 border-t border-blue-700/30"
        >
          <Image src="/encodex-edit.svg" alt="Rename" width={16} height={16} />
          Rename
        </button>

        {/* Favorite */}
        {onToggleFavorite && (
          <button
            onClick={() => {
              onToggleFavorite(contextMenu.fileId);
              onContextMenuClose();
            }}
            className="w-full text-left px-4 py-2 text-white hover:bg-blue-800 transition-colors text-sm flex items-center gap-2 border-t border-blue-700/30"
          >
            <Image 
              src={item?.isFavorite ? '/encodex-heart-filled.svg' : '/encodex-heart-outline.svg'} 
              alt="Favorite" 
              width={16} 
              height={16} 
            />
            {item?.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
          </button>
        )}

        {/* Move to folder */}
        <button
          onClick={() => {
            onContextMenuClose();
            onMoveToFolderStart?.(contextMenu.fileId);
          }}
          className="w-full text-left px-4 py-2 text-white hover:bg-blue-800 transition-colors text-sm border-t border-blue-700/30 flex items-center gap-2"
        >
          <Image src="/encodex-folder.svg" alt="Move" width={16} height={16} />
          Move to folder
        </button>

        {/* Move to trash */}
        <button
          onClick={() => {
            onDeleteFile(contextMenu.fileId);
            onContextMenuClose();
          }}
          className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-900/30 transition-colors text-sm border-t border-blue-700/30 flex items-center gap-2"
        >
          <Image src="/encodex-trash.svg" alt="Trash" width={16} height={16} />
          Move to trash
        </button>
      </div>
    </>
  );
}