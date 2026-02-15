'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import type { SharePermission, ShareRecipient } from '@/lib/sharedFilesManager';

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
  currentUserProfileImage?: string | null;
  fileName: string;
  fileId?: string | null;
  currentSharedWith?: ShareRecipient[];
  onShare: (recipientEmail: string, permissions: SharePermission) => boolean | Promise<boolean>;
  onUnshare?: (recipientEmail: string) => boolean | Promise<boolean>;
  onUpdatePermission?: (recipientEmail: string, permissions: SharePermission) => boolean | Promise<boolean>;
};

export default function ShareModal({
  isOpen,
  onClose,
  currentUserName,
  currentUserEmail,
  currentUserProfileImage,
  fileName,
  fileId,
  currentSharedWith = [],
  onShare,
  onUnshare,
  onUpdatePermission,
}: ShareModalProps) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sharePermission, setSharePermission] = useState<SharePermission>('view');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isUnshareSuccess, setIsUnshareSuccess] = useState(false);
  const [updatingPermissionFor, setUpdatingPermissionFor] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleShare = () => {
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

    const normalizedInput = recipientEmail.toLowerCase().trim();
    if (currentSharedWith.some((recipient) => recipient.email.toLowerCase() === normalizedInput)) {
      setError('Already shared with this user. Use Unshare to remove access.');
      return;
    }

    (async () => {
      const normalizedEmail = recipientEmail.toLowerCase().trim();
      const result = await onShare(normalizedEmail, sharePermission);

      if (result) {
        setSuccess(true);
        setError('');
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
    setSharePermission('view');
    setError('');
    setSuccess(false);
    setIsUnshareSuccess(false);
    setUpdatingPermissionFor(null);
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
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white font-bold text-lg">
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

        {currentSharedWith.length > 0 && (
          <div className="mb-6 p-4 bg-blue-950/20 rounded-lg border border-blue-700/30">
            <p className="text-sm text-gray-400 mb-2">Shared with</p>
            <div className="flex flex-col gap-2">
              {currentSharedWith.map((recipient) => (
                <div key={recipient.email} className="flex items-center justify-between gap-2">
                  <div className="text-sm text-gray-200">{formatEmailDisplay(recipient.email)}</div>
                  <select
                    value={recipient.permissions}
                    disabled={!onUpdatePermission || updatingPermissionFor === recipient.email}
                    onChange={async (e) => {
                      if (!onUpdatePermission) return;
                      const nextPermission: SharePermission = e.target.value === 'edit' ? 'edit' : 'view';
                      if (nextPermission === recipient.permissions) return;

                      setError('');
                      setUpdatingPermissionFor(recipient.email);
                      const ok = await onUpdatePermission(recipient.email, nextPermission);
                      setUpdatingPermissionFor(null);

                      if (!ok) {
                        setError(`Failed to update permission for ${recipient.email}`);
                      }
                    }}
                    className="bg-slate-900/80 border border-blue-700/40 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-orange-400 disabled:opacity-60"
                  >
                    <option value="view">View only</option>
                    <option value="edit">Can edit</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-orange-500/20 border-orange-400/50 rounded-lg border animate-fade-in">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-orange-400 font-semibold">
                {isUnshareSuccess ? 'File unshared successfully!' : 'File shared successfully!'}
              </p>
            </div>
            <p className="text-sm text-gray-300 mt-2 ml-9">
              {isUnshareSuccess
                ? `${recipientEmail} can no longer access this file.`
                : `${recipientEmail} can now access this file in their "Shared" section.`}
            </p>
          </div>
        )}

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
                className="w-full px-4 py-3 bg-blue-950/50 border border-blue-700/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-400 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleShare();
                  }
                }}
              />
              <div className="mt-3">
                <label className="text-xs text-gray-400 block mb-2">Permission</label>
                <select
                  value={sharePermission}
                  onChange={(e) => setSharePermission(e.target.value === 'edit' ? 'edit' : 'view')}
                  className="w-full px-4 py-2.5 bg-blue-950/50 border border-blue-700/30 rounded-lg text-white focus:outline-none focus:border-orange-400 transition-colors"
                >
                  <option value="view">View only</option>
                  <option value="edit">Can edit</option>
                </select>
              </div>
              {error && (
                <p className="text-red-400 text-sm mt-2">{error}</p>
              )}
            </div>

            <div className="mb-6 p-4 bg-blue-950/30 rounded-lg border border-blue-700/20">
              <p className="text-sm text-gray-300 flex items-start gap-2">
                <Image src="/encodex-share.svg" alt="Share" width={16} height={16} className="flex-shrink-0 mt-0.5" />
                <span>When you share this file, it appears in the recipient&apos;s <span className="text-orange-400 font-semibold">"Shared"</span> section.</span>
              </p>
              <p className="text-sm text-gray-300 mt-2 flex items-start gap-2">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                <span>The file will show your name as the owner.</span>
              </p>
            </div>
          </>
        )}

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={handleClose}
            className="px-8 py-3 rounded-lg bg-gray-600/30 hover:bg-gray-600/50 text-gray-300 font-semibold transition-colors"
          >
            {success ? 'Close' : 'Cancel'}
          </button>
          {!success && currentSharedWith.length > 0 && (
            <button
              onClick={async () => {
                if (!onUnshare) return;
                const normalizedInput = recipientEmail.toLowerCase().trim();
                const normalizedSharedWith = currentSharedWith.map(recipient => recipient.email.toLowerCase());
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
              className="px-8 py-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold transition-colors"
            >
              Unshare
            </button>
          )}

          {!success && (
            <button
              onClick={handleShare}
              className="px-8 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition-colors"
            >
              Share
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
