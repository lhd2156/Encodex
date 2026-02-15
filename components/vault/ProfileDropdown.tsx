'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {downloadRecoveryKey } from '@/lib/recoveryKey';

interface ProfileDropdownProps {
  userName: string;
  userLastName: string;
  userEmail: string;
  profileImage?: string | null;
  storageUsed: number;
  storageTotal: number;
  onSettings: () => void;
  onRecoveryKey?: () => void;
  on2FA?: () => void;
  onSignOut: () => void;
}

export default function ProfileDropdown({
  userName,
  userLastName,
  userEmail,
  profileImage,
  storageUsed,
  storageTotal,
  onSettings,
  onRecoveryKey,
  on2FA,
  onSignOut,
}: ProfileDropdownProps) {
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);

  const formatStorage = (bytes: number): string => {
    const GB = 1024 ** 3;
    const MB = 1024 ** 2;
    if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
    if (bytes >= MB) return `${(bytes / MB).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  // Format email: capitalize first letter only if not a number, lowercase domain
  const formatEmail = (email: string): string => {
    if (!email) return '';
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) return email.toLowerCase();
    
    // Only capitalize first letter if it's not a number
    const firstChar = localPart.charAt(0);
    const isNumber = /\d/.test(firstChar);
    const formattedLocal = isNumber 
      ? localPart.toLowerCase()
      : firstChar.toUpperCase() + localPart.slice(1).toLowerCase();
    return `${formattedLocal}@${domain.toLowerCase()}`;
  };

  const storagePercent = (storageUsed / storageTotal) * 100;
  const fullName = userLastName ? `${userName || ''} ${userLastName}` : (userName || 'User');
  const userInitial = (userName && userName.length > 0) ? userName.charAt(0).toUpperCase() : 'U';
  const formattedEmail = formatEmail(userEmail);

  // Around line 87 in ProfileDropdown
  const handleRecoveryKeyClick = async () => {
    const authToken = sessionStorage.getItem('auth_token');
    
    if (!authToken) {
      alert('Not authenticated');
      return;
    }

    try {
      const response = await fetch('/api/auth/recovery-key', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.recoveryKey) {
        setRecoveryKey(data.recoveryKey);
        setShowRecoveryModal(true);
        setJustGenerated(false);
        setCopied(false);
        
        if (onRecoveryKey) {
          onRecoveryKey();
        }
      } else {
        alert('No recovery key found. Recovery keys are generated during account registration.');
      }
    } catch (error) {
      console.error('Failed to fetch recovery key:', error);
      alert('Failed to load recovery key. Please try again.');
    }
  };

  const handleCopy = async () => {
    if (recoveryKey) {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (recoveryKey && userEmail) {
      downloadRecoveryKey(userEmail, recoveryKey);
    }
  };

  const closeModal = () => {
    setShowRecoveryModal(false);
    setJustGenerated(false);
  };

  return (
    <>
      <div className="absolute top-full right-0 mt-2 bg-slate-800 border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden w-[320px] z-[60]">
        {/* Profile Header */}
        <div className="px-5 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3 mb-3">
            {profileImage ? (
              <img
                src={profileImage}
                alt="Profile"
                className="w-12 h-12 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {userInitial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-base text-white font-semibold truncate">{fullName}</p>
              <p className="text-xs text-gray-400 truncate">{formattedEmail}</p>
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
                  : 'bg-gradient-to-r from-gray-400 to-gray-500'
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
            onClick={() => {
              // If parent provided onRecoveryKey callback, use that
              if (onRecoveryKey) {
                onRecoveryKey();
                return;
              }
              
              // Otherwise use internal modal (fallback for when used standalone)
              handleRecoveryKeyClick();
            }}
            className="w-full text-left px-5 py-3 text-gray-300 hover:bg-slate-700/50 transition-colors text-sm flex items-center gap-3"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Recovery key
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

      {/* Recovery Key Modal - MEGA STYLE - Z-INDEX 9999 */}
      {showRecoveryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={closeModal}
          />

          {/* Modal Container */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              pointerEvents: 'none',
            }}
          >
            {/* Modal */}
            <div
              style={{
                width: '1050px',
                maxWidth: '95vw',
                height: '650px',
                maxHeight: '90vh',
                background: 'linear-gradient(to bottom, rgb(30 58 138), rgb(23 37 84))',
                borderRadius: '0.5rem',
                border: '1px solid rgba(29 78 216 / 0.5)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                position: 'relative',
                pointerEvents: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={closeModal}
                style={{
                  position: 'absolute',
                  top: '1.5rem',
                  right: '1.5rem',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(30 58 138 / 0.3)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#9ca3af';
                }}
              >
                <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Content Container */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  padding: '3rem 4rem',
                }}
              >
                {/* Icon */}
                <div style={{ marginBottom: '2rem' }}>
                  <div
                    style={{
                      width: '8rem',
                      height: '8rem',
                      background: 'linear-gradient(to bottom right, rgba(59 130 246 / 0.2), rgba(37 99 235 / 0.2))',
                      borderRadius: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(59 130 246 / 0.3)',
                    }}
                  >
                    <svg style={{ width: '4rem', height: '4rem', color: '#fbbf24' }} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.65 10C11.7 7.31 8.9 5.5 5.77 6.12c-2.29.46-4.15 2.29-4.63 4.58C.32 14.57 3.26 18 7 18c2.61 0 4.83-1.67 5.65-4H17v2c0 1.1.9 2 2 2s2-.9 2-2v-2c1.1 0 2-.9 2-2s-.9-2-2-2h-8.35zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                    </svg>
                  </div>
                </div>

                {/* Title */}
                <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem', textAlign: 'center' }}>
                  {justGenerated ? 'Recovery Key Generated!' : 'Account Recovery'}
                </h2>
                
                {/* Description */}
                <p style={{ textAlign: 'center', color: '#d1d5db', marginBottom: justGenerated ? '2rem' : '3rem', maxWidth: '42rem', lineHeight: '1.625' }}>
                  {justGenerated ? (
                    <>
                      <span style={{ color: '#34d399', fontWeight: 'bold' }}>✓ Your recovery key has been created!</span> Export and save it to avoid your data becoming inaccessible should you ever lose your password or authenticator.
                    </>
                  ) : (
                    <>
                      Export and save your recovery key to avoid your data becoming inaccessible should you ever lose your password or authenticator.{' '}
                      <span style={{ color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer' }}>Learn more.</span>
                    </>
                  )}
                </p>

                {/* Recovery Key Box */}
                <div
                  style={{
                    width: '100%',
                    maxWidth: '48rem',
                    background: 'rgba(23 37 84 / 0.5)',
                    border: '1px solid rgba(29 78 216 / 0.3)',
                    borderRadius: '0.5rem',
                    padding: '2rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'white', marginBottom: '0.75rem' }}>
                        Export your recovery key
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Image src="/encodex-key.svg" alt="Key" width={24} height={24} />
                        <code style={{ color: '#fbbf24', fontSize: '1.25rem', fontFamily: 'monospace', letterSpacing: '0.05em', userSelect: 'all' }}>
                          {recoveryKey}
                        </code>
                      </div>
                    </div>
                    
                    {/* Download Button */}
                    <button
                      onClick={handleDownload}
                      style={{
                        marginLeft: '2rem',
                        padding: '0.75rem 2rem',
                        backgroundColor: '#f97316',
                        color: 'white',
                        borderRadius: '0.5rem',
                        fontWeight: '600',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 10px 15px -3px rgba(249 115 22 / 0.2)',
                        fontSize: '1rem',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#ea580c';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f97316';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      Download
                    </button>
                  </div>
                  
                  {/* Copy Button */}
                  <button
                    onClick={handleCopy}
                    style={{
                      marginTop: '1rem',
                      fontSize: '0.875rem',
                      color: copied ? '#34d399' : '#60a5fa',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: 0,
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!copied) e.currentTarget.style.color = '#93c5fd';
                    }}
                    onMouseLeave={(e) => {
                      if (!copied) e.currentTarget.style.color = '#60a5fa';
                    }}
                  >
                    {copied ? (
                      <>
                        <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Copied to clipboard!</span>
                      </>
                    ) : (
                      <>
                        <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy to clipboard</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}