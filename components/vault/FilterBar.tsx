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
  const typeButtonRef = useRef<HTMLButtonElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const modifiedButtonRef = useRef<HTMLButtonElement>(null);
  const modifiedMenuRef = useRef<HTMLDivElement>(null);

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
    <div className="flex items-center justify-between px-8 py-4 border-b border-blue-700/20 bg-blue-950/10">
      <div className="flex items-center gap-3">
        {/* Type Filter */}
        <div className="relative">
          <button
            ref={typeButtonRef}
            onClick={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
            className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors min-w-[120px] justify-between ${
              activeFilters.type !== 'All'
                ? 'bg-teal-500/20 text-teal-400 border-teal-400/50'
                : 'bg-transparent text-white border-gray-600 hover:bg-blue-800/20'
            }`}
          >
            {activeFilters.type}
            <span className="text-xs">{openDropdown === 'type' ? '▲' : '▼'}</span>
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
            className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors min-w-[140px] justify-between ${
              activeFilters.modified !== 'Any time'
                ? 'bg-teal-500/20 text-teal-400 border-teal-400/50'
                : 'bg-transparent text-white border-gray-600 hover:bg-blue-800/20'
            }`}
          >
            {activeFilters.modified}
            <span className="text-xs">{openDropdown === 'modified' ? '▲' : '▼'}</span>
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
            className="px-4 py-2 text-sm font-medium text-teal-400 hover:text-teal-300 hover:underline transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Right side actions */}
      {hasFiles && (
        <div className="flex items-center gap-3">
          {/* Select All - Vault */}
          {(['vault', 'shared', 'recent', 'favorites'] as string[]).includes(currentTab) && onSelectAll && (
            <button
              onClick={onSelectAll}
              className="px-4 py-2 rounded-lg bg-blue-800/20 hover:bg-blue-800/30 text-blue-300 text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Select all
            </button>
          )}

          {/* Trash actions: Select all | Recover all | Delete all */}
          {currentTab === 'trash' && (
            <>
              {onSelectAll && (
                <button
                  onClick={onSelectAll}
                  className="px-4 py-2 rounded-lg bg-blue-800/20 hover:bg-blue-800/30 text-blue-300 text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Select all
                </button>
              )}
              {onRecoverAll && (
                <button
                  onClick={onRecoverAll}
                  className="px-4 py-2 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h12a4 4 0 110 8H7M3 10l4-4M3 10l4 4" />
                  </svg>
                  Recover all
                </button>
              )}
              {onDeleteAll && (
                <button
                  onClick={onDeleteAll}
                  className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete all
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}