'use client';

import { ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/session';

interface StorageLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  userName?: string;
}

export default function StorageLayout({ sidebar, main, userName = 'User' }: StorageLayoutProps) {
  const router = useRouter();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleSignOut = () => {
    // Clear everything
    clearSession();
    
    // Redirect to login
    router.push('/login');
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 text-white">
      {sidebar}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Greeting */}
        <div className="border-b border-blue-700/30 bg-blue-900/20 backdrop-blur-sm px-8 py-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            Hello <span className="text-teal-400">{userName}</span>! 👋
          </h1>
          
          {/* Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity group"
            >
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{userName}</p>
                <p className="text-xs text-blue-300">Account</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center border-2 border-teal-400/50 group-hover:border-teal-300 transition-colors font-bold text-white text-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
            </button>

            {/* Dropdown Menu */}
            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-blue-900 border border-blue-700 rounded-lg shadow-lg z-50">
                <button className="w-full flex items-center gap-2 px-4 py-3 hover:bg-blue-800/50 transition-colors text-left text-sm">
                  ⚙️ Settings
                </button>
                <div className="border-t border-blue-700"></div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-red-500/20 transition-colors text-left text-sm text-red-400"
                >
                  🚪 Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-8 max-w-7xl mx-auto">
            {main}
          </div>
        </div>
      </main>
    </div>
  );
}
