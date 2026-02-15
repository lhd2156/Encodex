'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';

// Helper function to get file icon based on file extension
const getFileIcon = (fileName: string): string => {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return '/encodex-image.svg';
  }
  // Videos
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'].includes(ext)) {
    return '/encodex-video.svg';
  }
  // Audio
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'].includes(ext)) {
    return '/encodex-audio.svg';
  }
  // Spreadsheets
  if (['xls', 'xlsx', 'csv', 'ods', 'tsv'].includes(ext)) {
    return '/encodex-spreadsheet.svg';
  }
  // Code
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'md', 'sql'].includes(ext)) {
    return '/encodex-code.svg';
  }
  // Default file
  return '/encodex-file.svg';
};

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

interface SearchBarProps {
  files: FileItem[];
  onSelectFile: (fileId: string) => void;
  onOpenFolder: (folderId: string) => void;
}

export default function SearchBar({ files, onSelectFile, onOpenFolder }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [results, setResults] = useState<FileItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('encodex_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const searchRef = useRef<HTMLDivElement>(null);

  // Persist recent searches
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('encodex_recent_searches', JSON.stringify(recentSearches));
    }
  }, [recentSearches]);

  const addRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== trimmed);
      return [trimmed, ...filtered].slice(0, 8);
    });
  };

  const removeRecentSearch = (term: string) => {
    setRecentSearches(prev => prev.filter(s => s !== term));
  };

  const clearAllRecentSearches = () => {
    setRecentSearches([]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search algorithm
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      // Don't auto-show results when query is cleared
      return;
    }

    const q = query.toLowerCase();
    
    const scored = files
      .map(file => {
        const name = file.name.toLowerCase();
        let score = 0;

        if (name === q) {
          score = 1000;
        } else if (name.startsWith(q)) {
          score = 500;
        } else if (name.includes(` ${q}`) || name.includes(`${q} `)) {
          score = 300;
        } else if (name.includes(q)) {
          score = 200;
        }

        if (score > 0) {
          score += Math.max(0, 100 - name.length);
          if (file.type === 'folder') score += 25;
          if (file.isFavorite) score += 50;
          const days = (Date.now() - new Date(file.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          if (days < 7) score += 30;
        }

        return { file, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => item.file);

    setResults(scored);
    // Only show results if user is actively focused/typing
    if (isFocused) {
      setShowResults(true);
    }
  }, [query, files, isFocused]);

  const highlight = (text: string, q: string): React.ReactNode => {
    if (!q) return <>{text}</>;
    
    const lower = text.toLowerCase();
    const lq = q.toLowerCase();
    const idx = lower.indexOf(lq);
    
    if (idx !== -1) {
      return (
        <>
          {text.substring(0, idx)}
          <strong className="font-bold">{text.substring(idx, idx + q.length)}</strong>
          {text.substring(idx + q.length)}
        </>
      );
    }
    
    return <>{text}</>;
  };

  const formatDate = (d: Date): string => {
    const date = new Date(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const handleClick = (file: FileItem) => {
    addRecentSearch(query);
    if (file.type === 'folder') {
      onOpenFolder(file.id);
    } else {
      onSelectFile(file.id);
    }
    setShowResults(false);
    setIsFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      addRecentSearch(query);
    }
  };

  const handleInputClick = () => {
    // Only show results when the user explicitly clicks in the input
    setIsFocused(true);
    if (query.trim()) {
      setShowResults(true);
    }
  };

  const showRecentPanel = isFocused && !query && recentSearches.length > 0;

  return (
    <div className="relative flex-1 max-w-2xl z-50" ref={searchRef}>
      <div className="relative z-50">
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClick={handleInputClick}
          onKeyDown={handleKeyDown}
          placeholder="Search Cloud drive"
          className="w-full pl-12 pr-12 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all relative z-50"
        />
        
        {query && (
          <button
            onClick={() => { setQuery(''); setShowResults(false); }}
            className="absolute inset-y-0 right-0 flex items-center pr-3 hover:bg-slate-700/50 rounded-r-lg transition-colors z-50"
          >
            <svg className="w-5 h-5 text-gray-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* RECENT SEARCHES panel */}
      {showRecentPanel && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            style={{ top: '64px' }}
            onClick={() => { setIsFocused(false); }}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-[70]">
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-700/50">
              <p className="text-sm font-semibold text-white">Recently searched</p>
              <button
                onClick={clearAllRecentSearches}
                className="text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors"
              >
                Clear all
              </button>
            </div>
            {recentSearches.map((term) => (
              <div
                key={term}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-700/40 transition-colors group"
              >
                <button
                  onClick={() => {
                    setQuery(term);
                    setShowResults(true);
                  }}
                  className="flex-1 text-left flex items-center gap-3"
                >
                  <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-200">{term}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeRecentSearch(term); }}
                  className="p-1 rounded hover:bg-slate-600/50 text-gray-500 hover:text-gray-300 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* SEARCH RESULTS dropdown */}
      {showResults && query && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            style={{ top: '64px' }}
            onClick={() => { setShowResults(false); setIsFocused(false); }}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-[70] max-h-96 overflow-y-auto">
            {results.length > 0 ? (
              <>
                <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-700/50">
                  <p className="text-xs text-gray-400 font-medium">
                    {results.length} {results.length === 1 ? 'result' : 'results'}
                  </p>
                </div>
                
                {results.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => handleClick(file)}
                    className="w-full px-4 py-3 hover:bg-slate-700/50 transition-colors text-left flex items-center gap-3 border-b border-slate-700/30 last:border-b-0"
                  >
                    <span className="flex-shrink-0">
                      <Image 
                        src={file.type === 'folder' ? '/encodex-folder.svg' : getFileIcon(file.name)} 
                        alt={file.type === 'folder' ? 'Folder' : 'File'}
                        width={28} 
                        height={28} 
                      />
                    </span>
                    
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">
                        {highlight(file.name, query)}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {file.type === 'folder' ? 'Folder' : 'File'} • Modified {formatDate(file.createdAt)}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* If file is favorited, render favorite at far right and paperclip to its left */}
                      {file.isFavorite ? (
                        <>
                          {(file as any).isReceivedShare || (file as any).sharedWith?.length > 0 ? (
                            <span title="Shared"><Image src="/encodex-paperclip.svg" alt="Shared" width={16} height={16} /></span>
                          ) : null}
                          <span title="Favorite"><Image src="/encodex-heart-filled.svg" alt="Favorite" width={16} height={16} /></span>
                        </>
                      ) : (
                        /* Not favorited: paperclip sits at far right when present */
                        ((file as any).isReceivedShare || (file as any).sharedWith?.length > 0) && (
                          <span title="Shared"><Image src="/encodex-paperclip.svg" alt="Shared" width={16} height={16} /></span>
                        )
                      )}
                    </div>
                  </button>
                ))}
              </>
            ) : (
              <div className="px-4 py-8 text-center">
                <div className="mb-2 flex justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400 font-medium">No files or folders found</p>
                <p className="text-xs text-gray-500 mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}