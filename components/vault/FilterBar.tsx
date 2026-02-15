'use client';

import React, { useState, useRef, useEffect } from 'react';

interface FilterBarProps {
  onFilterChange: (filters: {
    type: string;
    modified: string;
  }) => void;
  activeFilters: {
    type: string;
    modified: string;
  };
  onSelectAll?: () => void;
  onDeleteAll?: () => void;
  onRecoverAll?: () => void;
  hasFiles?: boolean;
  currentTab?: 'vault' | 'trash' | 'recent' | 'favorites' | 'shared';
}

export default function FilterBar({ 
  onFilterChange, 
  activeFilters,
  onSelectAll,
  onDeleteAll,
  onRecoverAll,
  hasFiles = false,
  currentTab = 'vault'
}: FilterBarProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const typeButtonRef = useRef<HTMLButtonElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const modifiedButtonRef = useRef<HTMLButtonElement>(null);
  const modifiedMenuRef = useRef<HTMLDivElement>(null);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown === 'type' && typeMenuRef.current && !typeMenuRef.current.contains(event.target as Node) &&
          typeButtonRef.current && !typeButtonRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
      if (openDropdown === 'modified' && modifiedMenuRef.current && !modifiedMenuRef.current.contains(event.target as Node) &&
          modifiedButtonRef.current && !modifiedButtonRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const typeOptions = ['All', 'Folders', 'Documents', 'Images', 'Videos', 'Audio', 'Spreadsheets'];
  const modifiedOptions = ['Any time', 'Today', 'Last 7 days', 'Last 30 days', 'This year (2026)', 'Last year (2025)'];

  const handleTypeSelect = (option: string) => {
    onFilterChange({ ...activeFilters, type: option });
    setOpenDropdown(null);
  };

  const handleModifiedSelect = (option: string) => {
    onFilterChange({ ...activeFilters, modified: option });
    setOpenDropdown(null);
  };

  const clearFilters = () => {
    onFilterChange({ type: 'All', modified: 'Any time' });
  };

  const hasActiveFilters = activeFilters.type !== 'All' || activeFilters.modified !== 'Any time';

  return (
    <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'} ${isMobile ? 'px-3 py-3' : 'px-4 sm:px-8 py-3 sm:py-4'} border-b border-blue-700/20 bg-blue-950/10`}>
      <div className={`flex items-center ${isMobile ? 'flex-wrap' : ''} gap-2`}>
        {/* Type Filter */}
        <div className="relative">
          <button
            ref={typeButtonRef}
            onClick={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
            className={`${isMobile ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-lg border font-medium flex items-center gap-2 transition-colors ${isMobile ? 'min-w-[100px]' : 'min-w-[120px]'} justify-between ${
              activeFilters.type !== 'All'
                ? 'bg-orange-500/20 text-orange-400 border-orange-400/50'
                : 'bg-transparent text-white border-gray-600 hover:bg-blue-800/20'
            }`}
          >
            <span className="truncate">{activeFilters.type}</span>
            <span className="text-xs flex-shrink-0">{openDropdown === 'type' ? '▲' : '▼'}</span>
          </button>

          {openDropdown === 'type' && (
            <div
              ref={typeMenuRef}
              className="absolute left-0 top-full mt-2 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[200px]"
            >
              {typeOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleTypeSelect(option)}
                  className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                    activeFilters.type === option
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-white hover:bg-gray-700'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modified Filter */}
        <div className="relative">
          <button
            ref={modifiedButtonRef}
            onClick={() => setOpenDropdown(openDropdown === 'modified' ? null : 'modified')}
            className={`${isMobile ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-lg border font-medium flex items-center gap-2 transition-colors ${isMobile ? 'min-w-[110px]' : 'min-w-[140px]'} justify-between ${
              activeFilters.modified !== 'Any time'
                ? 'bg-orange-500/20 text-orange-400 border-orange-400/50'
                : 'bg-transparent text-white border-gray-600 hover:bg-blue-800/20'
            }`}
          >
            <span className="truncate">{activeFilters.modified}</span>
            <span className="text-xs flex-shrink-0">{openDropdown === 'modified' ? '▲' : '▼'}</span>
          </button>

          {openDropdown === 'modified' && (
            <div
              ref={modifiedMenuRef}
              className="absolute left-0 top-full mt-2 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[200px]"
            >
              {modifiedOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleModifiedSelect(option)}
                  className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                    activeFilters.modified === option
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-white hover:bg-gray-700'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className={`${isMobile ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} font-medium text-orange-400 hover:text-orange-300 hover:underline transition-colors whitespace-nowrap`}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Right side actions */}
      {hasFiles && (
        <div className={`flex items-center ${isMobile ? 'flex-wrap' : ''} gap-2`}>
          {/* Select All - Vault */}
          {(['vault', 'shared', 'recent', 'favorites'] as string[]).includes(currentTab) && onSelectAll && (
            <button
              onClick={onSelectAll}
              className={`${isMobile ? 'px-3 py-1.5 text-xs' : 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm'} rounded-lg bg-blue-800/20 hover:bg-blue-800/30 text-blue-300 font-semibold transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap`}
            >
              <svg className={`${isMobile ? 'w-4 h-4' : 'w-4 sm:w-5 h-4 sm:h-5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="hidden sm:inline">Select all</span>
            </button>
          )}

          {/* Trash actions: Select all | Recover all | Delete all */}
          {currentTab === 'trash' && (
            <>
              {onSelectAll && (
                <button
                  onClick={onSelectAll}
                  className={`${isMobile ? 'px-3 py-1.5 text-xs' : 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm'} rounded-lg bg-blue-800/20 hover:bg-blue-800/30 text-blue-300 font-semibold transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap`}
                >
                  <svg className={`${isMobile ? 'w-4 h-4' : 'w-4 sm:w-5 h-4 sm:h-5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span className="hidden sm:inline">Select all</span>
                </button>
              )}
              {onRecoverAll && (
                <button
                  onClick={onRecoverAll}
                  className={`${isMobile ? 'px-3 py-1.5 text-xs' : 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm'} rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 font-semibold transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap`}
                >
                  <svg className={`${isMobile ? 'w-4 h-4' : 'w-4 sm:w-5 h-4 sm:h-5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h12a4 4 0 110 8H7M3 10l4-4M3 10l4 4" />
                  </svg>
                  <span className="hidden sm:inline">Recover all</span>
                </button>
              )}
              {onDeleteAll && (
                <button
                  onClick={onDeleteAll}
                  className={`${isMobile ? 'px-3 py-1.5 text-xs' : 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm'} rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap`}
                >
                  <svg className={`${isMobile ? 'w-4 h-4' : 'w-4 sm:w-5 h-4 sm:h-5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="hidden sm:inline">Delete all</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}