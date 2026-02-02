'use client';

import React from 'react';

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: 'file' | 'folder';
  createdAt: Date;
  parentFolderId?: string | null;
}

interface VaultContextMenuProps {
  contextMenu: { x: number; y: number; fileId: string } | null;
  files: FileItem[];
  onContextMenuClose: () => void;
  onRenameStart: (id: string, name: string) => void;
  onDeleteFile: (id: string) => void;
  onMoveToFolderStart?: (fileId: string) => void;
}

export default function VaultContextMenu({
  contextMenu,
  files,
  onContextMenuClose,
  onRenameStart,
  onDeleteFile,
  onMoveToFolderStart,
}: VaultContextMenuProps) {
  if (!contextMenu) return null;

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
        <button
          onClick={() => {
            const item = files.find((f) => f.id === contextMenu.fileId);
            if (item) onRenameStart(item.id, item.name);
            onContextMenuClose();
          }}
          className="block w-full text-left px-4 py-2 text-white hover:bg-blue-800 transition-colors text-sm"
        >
          ✏️ Rename
        </button>

        <button
          onClick={() => {
            onContextMenuClose();
            onMoveToFolderStart?.(contextMenu.fileId);
          }}
          className="block w-full text-left px-4 py-2 text-white hover:bg-blue-800 transition-colors text-sm border-t border-blue-700/30"
        >
          📁 Move to folder
        </button>

        <button
          onClick={() => {
            onDeleteFile(contextMenu.fileId);
            onContextMenuClose();
          }}
          className="block w-full text-left px-4 py-2 text-red-400 hover:bg-red-900/30 transition-colors text-sm border-t border-blue-700/30"
        >
          🗑️ Move to trash
        </button>
      </div>
    </>
  );
}