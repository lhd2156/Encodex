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

interface MoveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileItem[];
  excludeId?: string | null; // file/folder being moved (exclude from target list)
  onConfirm: (targetFolderId: string | null) => void; // null = root (Vault)
}

export default function MoveToFolderModal({ isOpen, onClose, files, excludeId, onConfirm }: MoveToFolderModalProps) {
  if (!isOpen) return null;

  const folders = files.filter((f) => f.type === 'folder');

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-900 border border-blue-700/50 rounded-lg shadow-xl p-4 w-[420px]">
        <h3 className="text-lg font-semibold mb-2">Move to folder</h3>
        <p className="text-sm text-gray-300 mb-4">Choose a destination folder in your vault.</p>
        <div className="space-y-2 max-h-64 overflow-auto mb-4">
          <button
            onClick={() => { onConfirm(null); onClose(); }}
            className="w-full text-left px-3 py-2 bg-blue-800/20 rounded hover:bg-blue-800/40"
          >
            Vault (root)
          </button>
          {folders.map((f) => {
            if (f.id === excludeId) return null;
            return (
              <button
                key={f.id}
                onClick={() => { onConfirm(f.id); onClose(); }}
                className="w-full text-left px-3 py-2 bg-blue-800/10 rounded hover:bg-blue-800/30"
              >
                📁 {f.name}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded bg-blue-800/30">Cancel</button>
        </div>
      </div>
    </>
  );
}
