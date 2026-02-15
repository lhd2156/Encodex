'use client';

import React, { useRef, useEffect } from 'react';
import Image from 'next/image';

interface VaultUploadMenuProps {
  showUploadMenu: boolean;
  setShowUploadMenu: React.Dispatch<React.SetStateAction<boolean>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  folderInputRef: React.RefObject<HTMLInputElement | null>;
  onCreateFolder: () => void;
  onFilesSelected: (files: File[], folderId?: string | null) => void;
  currentFolderId?: string | null;
}

export default function VaultUploadMenu({
  showUploadMenu,
  setShowUploadMenu,
  fileInputRef,
  folderInputRef,
  onCreateFolder,
  onFilesSelected,
  currentFolderId,
}: VaultUploadMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showUploadMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setShowUploadMenu(false);
      }
    };

    // Add a small delay to prevent immediate closing
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUploadMenu, setShowUploadMenu]);

  return (
    <div className="flex gap-3 items-center relative" ref={containerRef}>
      {/* New Folder Button */}
      <button
        onClick={onCreateFolder}
        className="px-4 py-2 rounded-lg bg-blue-800/40 hover:bg-blue-800/60 text-white text-sm font-semibold transition-colors flex items-center gap-2"
      >
        <Image src="/encodex-plus.svg" alt="New" width={20} height={20} className="brightness-0 invert" /> New folder
      </button>

      {/* Upload Button */}
      <button
        onClick={() => setShowUploadMenu(!showUploadMenu)}
        className="px-4 py-2 rounded-lg bg-orange-500/90 hover:bg-orange-500 text-white text-sm font-semibold flex items-center gap-2 transition-colors"
      >
        <Image src="/encodex-upload.svg" alt="Upload" width={20} height={20} className="brightness-0 invert" /> Upload
        <span className="text-xs">{showUploadMenu ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown Menu - Positioned Absolutely */}
      {showUploadMenu && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-2 z-[101] bg-blue-900 border border-blue-700/50 rounded-lg shadow-2xl overflow-hidden min-w-[180px]"
        >
          <button
            onClick={() => {
              setShowUploadMenu(false);
              fileInputRef.current?.click();
            }}
            className="w-full text-left px-4 py-3 hover:bg-blue-800 text-sm text-white transition-colors flex items-center gap-2"
          >
            <Image src="/encodex-file.svg" alt="File" width={18} height={18} />
            <span>Upload file</span>
          </button>

          <button
            onClick={() => {
              setShowUploadMenu(false);
              folderInputRef.current?.click();
            }}
            className="w-full text-left px-4 py-3 hover:bg-blue-800 text-sm text-white transition-colors border-t border-blue-700/30 flex items-center gap-2"
          >
            <Image src="/encodex-folder.svg" alt="Folder" width={18} height={18} />
            <span>Upload folder</span>
          </button>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(Array.from(e.target.files), currentFolderId);
            e.target.value = '';
          }
        }}
      />

      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(Array.from(e.target.files), currentFolderId);
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}