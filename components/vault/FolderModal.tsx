'use client';

import React, { useRef, useEffect } from 'react';
import Image from 'next/image';

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (folderName: string) => void;
}

export default function FolderModal({ isOpen, onClose, onSubmit }: FolderModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = () => {
    const value = inputRef.current?.value.trim();
    if (value) {
      onSubmit(value);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-b from-blue-900 to-blue-950 border border-blue-700/50 rounded-lg shadow-2xl max-w-md w-full">
          {/* Header */}
          <div className="border-b border-blue-700/30 px-6 py-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Image src="/encodex-folder.svg" alt="Folder" width={20} height={20} />
              New Folder
            </h2>
          </div>

          {/* Content */}
          <div className="p-6">
            <label className="block text-sm text-blue-200 mb-3">Folder name:</label>
            <input
              ref={inputRef}
              type="text"
              onKeyDown={handleKeyDown}
              placeholder="Enter folder name..."
              className="w-full px-4 py-2 rounded-lg bg-blue-950/50 border border-blue-700/50 text-white placeholder-gray-500 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400/50 transition-all"
            />
          </div>

          {/* Footer */}
          <div className="border-t border-blue-700/30 px-6 py-4 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-blue-800/40 hover:bg-blue-800/60 text-blue-200 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors text-sm font-semibold"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
