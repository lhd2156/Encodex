'use client';

import { useRef, useState } from 'react';

interface StorageUploadZoneProps {
  onFilesSelected?: (files: File[]) => void;
  onStorageUpdate?: (sizeInGB: number) => void;
  compact?: boolean;
}

interface UploadProgress {
  fileIndex: number;
  fileName: string;
  progress: number;
  isComplete: boolean;
}

export default function StorageUploadZone({
  onFilesSelected,
  onStorageUpdate,
  compact = true,
}: StorageUploadZoneProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalsRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const simulateUpload = (files: File[]) => {
    const newUploads = files.map((file, idx) => ({
      fileIndex: uploads.length + idx,
      fileName: file.name,
      progress: 0,
      isComplete: false,
    }));

    setUploads((prev) => [...prev, ...newUploads]);

    files.forEach((file, idx) => {
      const fileIndex = uploads.length + idx;

      const interval = setInterval(() => {
        setUploads((prev) => {
          const updated = [...prev];
          const uploadItem = updated.find((u) => u.fileIndex === fileIndex);

          if (uploadItem && uploadItem.progress < 100) {
            uploadItem.progress = Math.min(uploadItem.progress + Math.random() * 40, 100);

            if (uploadItem.progress >= 100) {
              uploadItem.progress = 100;
              uploadItem.isComplete = true;

              const totalSize = files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024 * 1024);
              onStorageUpdate?.(totalSize);

              const storedInterval = intervalsRef.current.get(fileIndex);
              if (storedInterval) {
                clearInterval(storedInterval);
                intervalsRef.current.delete(fileIndex);
              }
            }
          }
          return updated;
        });
      }, 300);

      intervalsRef.current.set(fileIndex, interval);

      setTimeout(() => {
        setUploads((prev) =>
          prev.map((u) =>
            u.fileIndex === fileIndex ? { ...u, isComplete: true } : u
          )
        );
      }, 3000);

      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.fileIndex !== fileIndex));
      }, 4000);
    });
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    simulateUpload(files);
    onFilesSelected?.(files);
  };

  const activeUploads = uploads.filter((u) => !u.isComplete);

  if (compact) {
    return (
      <div className="space-y-2 flex-1">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-8 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-semibold transition-all"
        >
          Upload
          <span className="text-sm">▼</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />

        {activeUploads.length > 0 && (
          <div className="space-y-2 text-xs">
            {uploads.map((upload) => (
              <div key={upload.fileIndex} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-white truncate text-sm">{upload.fileName}</span>
                  <span className="text-teal-400 font-bold whitespace-nowrap ml-2">
                    {Math.round(upload.progress)}%
                  </span>
                </div>
                <div className="w-full bg-blue-800/40 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-400 to-teal-500 transition-all"
                    style={{ width: `${Math.round(upload.progress)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center border-2 border-dashed border-blue-600/50 hover:border-teal-400/50 rounded-xl p-16 transition-all">
        <div className="flex justify-center mb-6">
          <div className="relative w-32 h-24">
            <div className="absolute top-0 left-2 w-16 h-12 bg-red-500 rounded transform -rotate-12 flex items-center justify-center text-white text-2xl shadow-lg">
              📁
            </div>
            <div className="absolute top-4 left-8 w-16 h-12 bg-blue-800 rounded border-2 border-blue-600 flex items-center justify-center text-white text-2xl shadow-lg">
              ⬛
            </div>
            <div className="absolute bottom-0 right-0 w-16 h-12 bg-teal-500 rounded transform rotate-6 flex items-center justify-center text-white text-2xl shadow-lg shadow-teal-500/50">
              📦
            </div>
          </div>
        </div>

        <h3 className="text-2xl font-bold text-white mb-2">Nothing in your private vault yet</h3>
        <p className="text-blue-300 mb-8 text-lg">Drag and drop your files here</p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-8 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-semibold transition-all"
        >
          Upload
          <span className="text-sm">▼</span>
        </button>
      </div>

      {activeUploads.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-blue-200 uppercase tracking-wide">
            Uploading {activeUploads.length} file{activeUploads.length !== 1 ? 's' : ''}
          </h3>
          {uploads.map((upload) => (
            <div key={upload.fileIndex} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xl">📄</span>
                  <span className="text-sm font-medium text-white truncate">
                    {upload.fileName}
                  </span>
                </div>
                <span className="text-sm font-bold text-teal-400 ml-4 whitespace-nowrap">
                  {Math.round(upload.progress)}%
                </span>
              </div>
              <div className="w-full bg-blue-800/40 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full transition-all duration-200 bg-gradient-to-r from-teal-400 to-teal-500"
                  style={{ width: `${Math.round(upload.progress)}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
