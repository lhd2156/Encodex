'use client';

import React, { useRef, useEffect } from 'react';
import Image from 'next/image';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onRename: (newName: string) => void;
  itemType: 'file' | 'folder';
}

export default function RenameModal({ 
  isOpen, 
  onClose, 
  currentName, 
  onRename,
  itemType 
}: RenameModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = React.useState(currentName);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      // Focus and select all text when modal opens
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
    }
  }, [isOpen, currentName]);

  const handleRename = () => {
    if (name.trim() && name !== currentName) {
      onRename(name.trim());
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl shadow-2xl w-full max-w-md border border-gray-700">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white">
              Rename {itemType}
            </h2>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-4 py-3 mb-6">
              <span>
                <Image 
                  src={itemType === 'folder' ? '/encodex-folder.svg' : '/encodex-file.svg'} 
                  alt={itemType === 'folder' ? 'Folder' : 'File'} 
                  width={28} 
                  height={28} 
                />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent border-none outline-none text-white text-base"
                placeholder={`Enter ${itemType} name...`}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 flex gap-3 justify-end border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors text-sm font-semibold"
            >
              Rename
            </button>
          </div>
        </div>
      </div>
    </>
  );
}