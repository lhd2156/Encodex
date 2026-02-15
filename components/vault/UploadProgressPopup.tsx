'use client';

import React, { useState, useEffect } from 'react';

interface UploadProgressItem {
  fileId: string;
  fileName: string;
  progress: number;
}

interface UploadProgressPopupProps {
  uploadProgress: UploadProgressItem[];
  completedUploads: string[]; // Array of completed file names
  onClose: () => void;
  onRemoveCompleted: (fileName: string) => void;
  onSelectFile: (fileName: string) => void;
}

export default function UploadProgressPopup({
  uploadProgress,
  completedUploads,
  onClose,
  onRemoveCompleted,
  onSelectFile,
}: UploadProgressPopupProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  const inProgress = uploadProgress.filter(item => item.progress < 100);
  const justCompleted = uploadProgress.filter(item => item.progress === 100);
  const allCompleted = [...new Set([...justCompleted.map(u => u.fileName), ...completedUploads])];

  // Show popup if there are any uploads OR if we've had completed uploads before
  useEffect(() => {
    if (inProgress.length > 0 || allCompleted.length > 0) {
      setShowPopup(true);
    }
  }, [inProgress.length, allCompleted.length]);

  if (!showPopup) return null;

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  return (
    <div className="fixed bottom-6 right-6 w-96 bg-gradient-to-b from-blue-900 to-blue-950 border border-blue-700/50 rounded-xl shadow-2xl z-50 overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="border-b border-blue-700/30 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-white">
            {inProgress.length > 0 ? 'Uploading files' : 'Completed'}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Minimize Button */}
          <button
            onClick={toggleMinimize}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Minimize"
          >
            <svg 
              className={`w-5 h-5 transition-transform duration-200 ${isMinimized ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Close Button */}
          <button
            onClick={() => {
              setShowPopup(false);
              onClose();
            }}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content - with smooth collapse animation */}
      <div 
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isMinimized ? 'max-h-0 opacity-0' : 'max-h-96 opacity-100'
        }`}
      >
        <div className="overflow-y-auto max-h-96 min-h-[200px]">
          {/* Section Tabs */}
          <div className="flex border-b border-blue-700/20 px-5">
            <div className={`py-3 px-4 text-sm font-semibold cursor-pointer border-b-2 transition-colors ${
              inProgress.length > 0 
                ? 'text-gray-300 border-orange-400' 
                : 'text-gray-500 border-transparent'
            }`}>
              In progress
            </div>
            <div className={`py-3 px-4 text-sm font-semibold cursor-pointer border-b-2 transition-colors ${
              inProgress.length === 0 
                ? 'text-orange-400 border-orange-400' 
                : 'text-gray-500 border-transparent'
            }`}>
              Completed
            </div>
          </div>

          {/* In Progress Section */}
          {inProgress.length > 0 && (
            <div className="px-5 py-3">
              <div className="space-y-3">
                {inProgress.map((item) => (
                  <div key={item.fileId} className="flex items-start gap-3">
                    {/* File Icon */}
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-800/40 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                      </svg>
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate mb-1">{item.fileName}</div>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-blue-800/40 rounded-full h-1.5 mb-1">
                        <div
                          className="bg-gradient-to-r from-orange-400 to-orange-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      
                      {/* Progress Text */}
                      <div className="text-xs text-gray-400">
                        {Math.round(item.progress)}% uploaded
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Section - Always show when no in-progress */}
          {inProgress.length === 0 && (
            <div className="px-5 py-3">
              {allCompleted.length > 0 ? (
                <div className="space-y-2">
                  {allCompleted.map((fileName, index) => (
                    <div key={index} className="flex items-center gap-3 animate-fade-in">
                      {/* Check Icon */}
                      <div className="flex-shrink-0 w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>

                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{fileName}</div>
                        <div className="text-xs text-orange-400">Upload complete</div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* View/Focus File Button */}
                        <button
                          onClick={() => onSelectFile(fileName)}
                          className="p-1.5 rounded hover:bg-blue-800/40 text-gray-400 hover:text-orange-400 transition-colors"
                          title="View file in vault"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </button>

                        {/* Remove from list Button */}
                        <button
                          onClick={() => onRemoveCompleted(fileName)}
                          className="p-1.5 rounded hover:bg-blue-800/40 text-gray-400 hover:text-red-400 transition-colors"
                          title="Remove from list"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No completed uploads
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}