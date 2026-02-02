import React from 'react';

interface ProfileDropdownProps {
  userName: string;
  userLastName: string;
  userEmail: string;
  storageUsed: number;
  storageTotal: number;
  onSettings: () => void;
  onRecoveryKey: () => void;
  on2FA: () => void;
  onSignOut: () => void;
}

export default function ProfileDropdown({
  userName,
  userLastName,
  userEmail,
  storageUsed,
  storageTotal,
  onSettings,
  onRecoveryKey,
  on2FA,
  onSignOut,
}: ProfileDropdownProps) {
  const formatStorage = (bytes: number): string => {
    const GB = 1024 ** 3;
    const MB = 1024 ** 2;
    if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
    if (bytes >= MB) return `${(bytes / MB).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const storagePercent = (storageUsed / storageTotal) * 100;
  const fullName = userLastName ? `${userName} ${userLastName}` : userName;

  return (
    <div className="absolute top-full right-0 mt-2 bg-slate-800 border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden w-[320px] z-[60]">
      {/* Profile Header */}
      <div className="px-5 py-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base text-white font-semibold truncate">{fullName}</p>
            <p className="text-xs text-gray-400 truncate">{userEmail}</p>
          </div>
        </div>
      </div>

      {/* Storage Stats */}
      <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-900/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-300 font-medium">Storage</span>
          <span className="text-xs text-gray-400">
            {formatStorage(storageUsed)} of {formatStorage(storageTotal)}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              storagePercent > 90
                ? 'bg-gradient-to-r from-red-500 to-red-600'
                : storagePercent > 75
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                : 'bg-gradient-to-r from-teal-400 to-blue-500'
            }`}
            style={{ width: `${Math.min(storagePercent, 100)}%` }}
          />
        </div>
        
        <p className="text-xs text-gray-400 mt-1">
          {storagePercent < 0.01 && storagePercent > 0 
            ? '<0.01% used'
            : `${storagePercent.toFixed(2)}% used`}
        </p>
      </div>

      {/* Menu Items */}
      <div className="py-2">
        {/* Recovery Key */}
        <button
          onClick={onRecoveryKey}
          className="w-full text-left px-5 py-3 text-gray-300 hover:bg-slate-700/50 transition-colors text-sm flex items-center gap-3"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Recovery key
        </button>

        {/* Two-Factor Authentication */}
        <button
          onClick={on2FA}
          className="w-full text-left px-5 py-3 text-gray-300 hover:bg-slate-700/50 transition-colors text-sm flex items-center gap-3"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Set up 2FA
        </button>

        {/* Settings */}
        <button
          onClick={onSettings}
          className="w-full text-left px-5 py-3 text-gray-300 hover:bg-slate-700/50 transition-colors text-sm flex items-center gap-3"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>

      {/* Sign Out Button */}
      <div className="border-t border-slate-700/50 p-2">
        <button
          onClick={onSignOut}
          className="w-full px-5 py-3 rounded-lg text-red-400 bg-red-900/30 hover:bg-red-900/50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log out
        </button>
      </div>
    </div>
  );
}