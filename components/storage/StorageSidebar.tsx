'use client';

import { ReactNode } from 'react';

interface NavItem {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

interface StorageSidebarProps {
  items?: NavItem[];
  footer?: ReactNode;
}

const defaultItems: NavItem[] = [
  { icon: '☁️', label: 'Cloud drive', active: true },
  { icon: '📸', label: 'Media' },
  { icon: '🔗', label: 'Shared items' },
  { icon: '⏱️', label: 'Recents' },
];

export default function StorageSidebar({
  items = defaultItems,
  footer,
}: StorageSidebarProps) {
  return (
    <aside className="w-80 bg-gradient-to-b from-blue-950 to-blue-900 border-r border-blue-800 p-6 space-y-6 flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-3xl font-bold text-teal-400">🔐</span>
        <span className="font-bold text-white text-2xl">Encodex</span>
      </div>

      {/* Navigation Items */}
      <nav className="space-y-3 flex-1">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={item.onClick}
            className={`w-full flex items-center gap-4 px-5 py-3 rounded-lg transition-all text-left font-medium ${
              item.active
                ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                : 'text-blue-100 hover:bg-blue-800/50 hover:text-white'
            }`}
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-base">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      {footer && <div className="pt-6 border-t border-blue-800">{footer}</div>}
    </aside>
  );
}
