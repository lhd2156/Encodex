'use client';

import React, { useState } from 'react';

// Helper to format email display: capitalize first letter only if not a number
const formatEmailDisplay = (email: string): string => {
  if (!email) return '';
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email.toLowerCase();
  const firstChar = localPart.charAt(0);
  const isNumber = /\d/.test(firstChar);
  const formattedLocal = isNumber
    ? localPart.toLowerCase()
    : firstChar.toUpperCase() + localPart.slice(1).toLowerCase();
  return `${formattedLocal}@${domain.toLowerCase()}`;
};

type ShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentUserName: string;
  currentUserEmail: string;
  currentUserProfileImage?: string | null; // ✅ Add profile image support
  fileName: string;
  fileId?: string | null;
  currentSharedWith?: string[];
  onShare: (recipientEmail: string) => boolean | Promise<boolean>; // Returns success/failure (async or sync)
  onUnshare?: (recipientEmail: string) => boolean | Promise<boolean>;
};

export default function ShareModal({
  isOpen,
  onClose,
  currentUserName,
  currentUserEmail,
  currentUserProfileImage,
  fileName,
  fileId,
  currentSharedWith,
  onShare,
  onUnshare,
}: ShareModalProps) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isUnshareSuccess, setIsUnshareSuccess] = useState(false); // Track if this was an unshare action

  if (!isOpen) return null;

  const handleShare = () => {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!recipientEmail) {
      setError('Please enter an email address');
      return;
    }
    
    if (!emailRegex.test(recipientEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    if (recipientEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
      setError('You cannot share with yourself');
      return;
    }

    // ✅ FIX: Check if already shared BEFORE making API call
    const normalizedInput = recipientEmail.toLowerCase().trim();
    if (currentSharedWith && currentSharedWith.some(email => email.toLowerCase() === normalizedInput)) {
      setError('Already shared with this user. Use Unshare to remove access.');
      return;
    }

    (async () => {
      // Normalize email to lowercase for case-insensitive matching
      const normalizedEmail = recipientEmail.toLowerCase().trim();
      const result = await onShare(normalizedEmail);

      if (result) {
        setSuccess(true);
        setError('');
        // Auto-close after showing success
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        setError('Failed to share file. Please try again.');
      }
    })();
  };

  const handleClose = () => {
    setRecipientEmail('');
    setError('');
    setSuccess(false);
    setIsUnshareSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-blue-900 to-slate-900 border border-blue-700/30 rounded-2xl p-8 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Share "{fileName}"</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-2xl transition-colors"
          >
            ×
          </button>
        </div>

        {/* Current User Section */}
        <div className="mb-6 p-4 bg-blue-800/20 rounded-lg border border-blue-700/30">
          <p className="text-sm text-gray-400 mb-2">People with access</p>
          <div className="flex items-center gap-3">
            {currentUserProfileImage ? (
              <img
                src={currentUserProfileImage}
                alt="Profile"
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                {currentUserName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <p className="text-white font-semibold">{currentUserName} (you)</p>
              <p className="text-sm text-gray-400">{formatEmailDisplay(currentUserEmail)}</p>
            </div>
            <span className="text-sm text-gray-400 bg-blue-900/40 px-3 py-1 rounded-full">Owner</span>
          </div>
        </div>

        {/* Current recipients list */}
        {currentSharedWith && currentSharedWith.length > 0 && (
          <div className="mb-6 p-4 bg-blue-950/20 rounded-lg border border-blue-700/30">
            <p className="text-sm text-gray-400 mb-2">Shared with</p>
            <div className="flex flex-col gap-2">
              {currentSharedWith.map((r) => (
                <div key={r} className="flex items-center justify-between">
                  <div className="text-sm text-gray-200">{r}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className={`mb-6 p-4 ${isUnshareSuccess ? 'bg-orange-500/20 border-orange-400/50' : 'bg-teal-500/20 border-teal-400/50'} rounded-lg border animate-fade-in`}>
            <div className="flex items-center gap-3">
              <svg className={`w-6 h-6 ${isUnshareSuccess ? 'text-orange-400' : 'text-teal-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className={`${isUnshareSuccess ? 'text-orange-400' : 'text-teal-400'} font-semibold`}>
                {isUnshareSuccess ? 'File unshared successfully!' : 'File shared successfully!'}
              </p>
            </div>
            <p className="text-sm text-gray-300 mt-2 ml-9">
              {isUnshareSuccess 
                ? `${recipientEmail} can no longer access this file.`
                : `${recipientEmail} can now access this file in their "Shared" section.`
              }
            </p>
          </div>
        )}

        {/* Share Section */}
        {!success && (
          <>
            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-3">Share with</p>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => {
                  setRecipientEmail(e.target.value);
                  setError('');
                }}
                placeholder="Enter user's email address"
                className="w-full px-4 py-3 bg-blue-950/50 border border-blue-700/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-400 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleShare();
                  }
                }}
              />
              {error && (
                <p className="text-red-400 text-sm mt-2">{error}</p>
              )}
            </div>

            {/* Info Box */}
            <div className="mb-6 p-4 bg-blue-950/30 rounded-lg border border-blue-700/20">
              <p className="text-sm text-gray-300">
                📤 When you share this file, it will appear in the recipient's <span className="text-teal-400 font-semibold">"Shared"</span> section.
              </p>
              <p className="text-sm text-gray-300 mt-2">
                👤 The file will show your name as the owner.
              </p>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={handleClose}
            className="px-6 py-2.5 rounded-lg bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 font-semibold transition-colors"
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          {!success && currentSharedWith && currentSharedWith.length > 0 && (
            <button
              onClick={async () => {
                if (!onUnshare) return;
                // Normalize for case-insensitive comparison
                const normalizedInput = recipientEmail.toLowerCase().trim();
                const normalizedSharedWith = currentSharedWith.map(e => e.toLowerCase());
                if (!recipientEmail || !normalizedSharedWith.includes(normalizedInput)) {
                  setError('Enter an email that this file is currently shared with to unshare');
                  return;
                }
                setError('');
                const result = await onUnshare(normalizedInput);
                if (result) {
                  setIsUnshareSuccess(true);
                  setSuccess(true);
                  setTimeout(() => handleClose(), 1200);
                } else {
                  setError('Failed to unshare.');
                }
              }}
              className="px-6 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold transition-colors"
            >
              Unshare
            </button>
          )}

          {!success && (
            <button
              onClick={handleShare}
              className="px-6 py-2.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 font-semibold transition-colors"
            >
              Share
            </button>
          )}
        </div>
      </div>
    </div>
  );
}