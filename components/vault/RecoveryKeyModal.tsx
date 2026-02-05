'use client';

import React from 'react';

interface RecoveryKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

// MINIMAL TEST VERSION - Just to verify it works
export default function RecoveryKeyModal({ isOpen, onClose, userEmail }: RecoveryKeyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-lg p-6 w-96 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Recovery Key Test</h3>
        <p className="text-gray-300 text-sm mb-4">
          If you can see this, the component is working!
          <br />
          Email: {userEmail}
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded bg-blue-600 text-white w-full"
        >
          Close
        </button>
      </div>
    </div>
  );
}