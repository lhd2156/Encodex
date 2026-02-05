'use client';

import React, { useState, useEffect } from 'react';
import { getRecoveryKey, downloadRecoveryKey } from '@/lib/recoveryKey';

interface RecoveryKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export default function RecoveryKeyModal({ 
  isOpen, 
  onClose, 
  userEmail 
}: RecoveryKeyModalProps) {
  const [recoveryKey, setRecoveryKey] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const key = getRecoveryKey(userEmail);
      setRecoveryKey(key || '');
      setCopied(false);
    }
  }, [isOpen, userEmail]);

  const handleCopy = async () => {
    if (recoveryKey) {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (recoveryKey) {
      downloadRecoveryKey(userEmail, recoveryKey);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-700">
          {/* Header */}
          <div className="px-8 py-6 border-b border-slate-700/50">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Recovery Key</h2>
                <p className="text-sm text-gray-400">Keep this key safe and secure</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            {/* Warning Banner */}
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <div className="flex gap-3">
                <svg className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="text-red-400 font-semibold mb-1">Important</h3>
                  <p className="text-sm text-gray-300">
                    This key is the only way to recover your account if you lose your password. 
                    Store it somewhere safe and never share it with anyone.
                  </p>
                </div>
              </div>
            </div>

            {/* Recovery Key Display */}
            {recoveryKey ? (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-300">Your Recovery Key:</label>
                <div className="relative">
                  <div className="bg-slate-950/50 border-2 border-slate-700 rounded-xl p-5 font-mono text-center">
                    <p className="text-2xl font-bold text-white tracking-wider break-all select-all">
                      {recoveryKey}
                    </p>
                  </div>
                  
                  {/* Copy Button */}
                  <button
                    onClick={handleCopy}
                    className="absolute top-3 right-3 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 transition-all"
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Info Text */}
                <div className="flex items-start gap-2 text-sm text-gray-400">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>
                    Write this key down or save it in a password manager. You won't be able to access your encrypted files without it if you lose your password.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/50 rounded-lg p-8 text-center">
                <p className="text-gray-400">No recovery key found for this account.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-6 border-t border-slate-700/50 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors text-sm font-medium"
            >
              Close
            </button>
            {recoveryKey && (
              <button
                onClick={handleDownload}
                className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white transition-all text-sm font-semibold shadow-lg shadow-red-500/20 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Key
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}