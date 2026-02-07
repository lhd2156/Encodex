'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isSessionValid, updateSession } from '@/lib/session';
import { downloadRecoveryKey } from '@/lib/recoveryKey';

export default function SettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // User data
  const [userEmail, setUserEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // Form states
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // UI states
  const [savedMessage, setSavedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showRecoveryKeyModal, setShowRecoveryKeyModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isSessionValid()) {
      router.push('/login');
      return;
    }

    const session = getSession();
    if (session) {
      // ✅ CRITICAL: Auth token is in sessionStorage (tab-specific!)
      const authToken = sessionStorage.getItem('auth_token');
      
      // Get email from token (tab-specific, accurate)
      let finalEmail = session.userEmail.toLowerCase();
      
      if (authToken) {
        try {
          const payload = JSON.parse(atob(authToken.split('.')[1]));
          if (payload.email) {
            finalEmail = payload.email.toLowerCase();
          }
        } catch (e) {
          console.error('Failed to decode token:', e);
        }
      }
      
      setUserEmail(finalEmail);
      setNewEmail(finalEmail);
      
      // ✅ FIX: Fetch user's ACTUAL name from database (not shared localStorage!)
      const fetchProfile = async () => {
        if (!authToken) {
          // Fallback to session
          setFirstName(session.firstName);
          setLastName(session.lastName || '');
          return;
        }
        
        try {
          const response = await fetch('/api/auth/profile', {
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
              console.log('📋 [SETTINGS] Profile from DB:', data.user.firstName, data.user.lastName);
              setFirstName(data.user.firstName);
              setLastName(data.user.lastName || '');
              return;
            }
          }
        } catch (e) {
          console.error('📋 [SETTINGS] Failed to fetch profile from API:', e);
        }
        
        // Fallback to session
        setFirstName(session.firstName);
        setLastName(session.lastName || '');
      };
      
      fetchProfile();

      // Load profile image if exists (always use lowercase key)
      const savedImage = localStorage.getItem(`profile_image_${finalEmail}`);
      
      // Fallback: try original casing (for backwards compatibility)
      if (!savedImage) {
        const oldImage = localStorage.getItem(`profile_image_${session.userEmail}`);
        if (oldImage) {
          // Migrate to normalized key
          localStorage.setItem(`profile_image_${finalEmail}`, oldImage);
          localStorage.removeItem(`profile_image_${session.userEmail}`);
          setProfileImage(oldImage);
          console.log('🔄 Migrated profile image to normalized email key');
        }
      } else {
        setProfileImage(savedImage);
      }
    }
  }, [router]);

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Image must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setProfileImage(dataUrl);
      localStorage.setItem(`profile_image_${userEmail}`, dataUrl);
      
      // Dispatch custom event to notify other components (vault page)
      window.dispatchEvent(new Event('profileImageUpdated'));
      
      showSuccess('Profile image updated!');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProfileImage = () => {
    setProfileImage(null);
    localStorage.removeItem(`profile_image_${userEmail}`);
    
    // Dispatch custom event to notify other components (vault page)
    window.dispatchEvent(new Event('profileImageUpdated'));
    
    showSuccess('Profile image removed!');
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim()) {
      setErrorMessage('First name is required');
      return;
    }

    // ✅ FIX: Update userAccounts if it exists (legacy support)
    const accounts = JSON.parse(localStorage.getItem('userAccounts') || '[]');
    const accountIndex = accounts.findIndex((acc: any) => acc.email === userEmail);

    if (accountIndex !== -1) {
      accounts[accountIndex].firstName = firstName;
      accounts[accountIndex].lastName = lastName;
      localStorage.setItem('userAccounts', JSON.stringify(accounts));
    }
    
    // ✅ FIX: ALWAYS update session - this is the main source of truth
    updateSession(userEmail, firstName, lastName);
    
    // ✅ FIX: ALWAYS update the 'user' object used by the API system
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        user.firstName = firstName;
        user.lastName = lastName;
        localStorage.setItem('user', JSON.stringify(user));
      } catch (e) {
        console.error('Failed to update user object:', e);
      }
    } else {
      // Create the user object if it doesn't exist
      localStorage.setItem('user', JSON.stringify({
        email: userEmail,
        firstName: firstName,
        lastName: lastName
      }));
    }
    
    // ✅ FIX: Update name in database so shared files show correct owner name
    const authToken = sessionStorage.getItem('auth_token');
    if (authToken) {
      try {
        console.log(`📤 [SETTINGS] Calling /api/auth/profile with firstName="${firstName}", lastName="${lastName}"`);
        const response = await fetch('/api/auth/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ firstName, lastName }),
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
          console.log(`✅ [SETTINGS] Profile updated in database! User: ${result.user?.firstName} ${result.user?.lastName}, Files updated: ${result.filesUpdated}`);
        } else {
          console.error('❌ [SETTINGS] Failed to update profile in database:', result.error || response.statusText);
          setErrorMessage(`Failed to save to server: ${result.error || 'Unknown error'}`);
          return;
        }
      } catch (e) {
        console.error('❌ [SETTINGS] Error updating profile in database:', e);
        setErrorMessage('Network error while saving profile');
        return;
      }
    } else {
      console.warn('⚠️ [SETTINGS] No auth token found, profile not saved to database');
    }
    
    // Dispatch event to notify other components (vault page)
    window.dispatchEvent(new Event('profileUpdated'));
    
    showSuccess('Profile updated successfully!');
  };

  const handleChangeEmail = () => {
    if (!newEmail.trim() || !isValidEmail(newEmail)) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    if (newEmail === userEmail) {
      setErrorMessage('New email is the same as current email');
      return;
    }

    const accounts = JSON.parse(localStorage.getItem('userAccounts') || '[]');
    const emailExists = accounts.some((acc: any) => acc.email === newEmail && acc.email !== userEmail);

    if (emailExists) {
      setErrorMessage('Email is already in use');
      return;
    }

    const accountIndex = accounts.findIndex((acc: any) => acc.email === userEmail);
    if (accountIndex !== -1) {
      // Update email in account
      accounts[accountIndex].email = newEmail;
      localStorage.setItem('userAccounts', JSON.stringify(accounts));

      // Move recovery key to new email
      const oldKeyStorageKey = `recovery_key_${userEmail}`;
      const oldKey = localStorage.getItem(oldKeyStorageKey);
      if (oldKey) {
        localStorage.setItem(`recovery_key_${newEmail}`, oldKey);
        localStorage.removeItem(oldKeyStorageKey);
      }

      // Move profile image to new email
      const oldImageKey = `profile_image_${userEmail}`;
      const oldImage = localStorage.getItem(oldImageKey);
      if (oldImage) {
        localStorage.setItem(`profile_image_${newEmail}`, oldImage);
        localStorage.removeItem(oldImageKey);
      }

      setUserEmail(newEmail);
      setNewEmail(newEmail);
      updateSession(newEmail, firstName, lastName);
      showSuccess('Email updated successfully!');
    }
  };

  const handleChangePassword = () => {
    if (!newPassword || newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    const accounts = JSON.parse(localStorage.getItem('userAccounts') || '[]');
    const accountIndex = accounts.findIndex((acc: any) => acc.email === userEmail);

    if (accountIndex !== -1) {
      accounts[accountIndex].password = newPassword;
      localStorage.setItem('userAccounts', JSON.stringify(accounts));
      setNewPassword('');
      setConfirmPassword('');
      showSuccess('Password changed successfully!');
    }
  };

  const handleShowRecoveryKey = () => {
    // ✅ FIX: Use normalized (lowercase) email for lookup
    const normalizedEmail = userEmail.toLowerCase();
    let key = localStorage.getItem(`recovery_key_${normalizedEmail}`);
    
    // Fallback: try original casing (for backwards compatibility)
    if (!key) {
      key = localStorage.getItem(`recovery_key_${userEmail}`);
      
      // If found, migrate to normalized key
      if (key) {
        localStorage.setItem(`recovery_key_${normalizedEmail}`, key);
        localStorage.removeItem(`recovery_key_${userEmail}`);
        console.log('🔄 Migrated recovery key to normalized email');
      }
    }

    if (!key) {
      setErrorMessage('No recovery key found. This may happen if you registered on a different browser.');
      return;
    }

    setRecoveryKey(key);
    setCopied(false);
    setShowRecoveryKeyModal(true);
  };

  const handleCopyRecoveryKey = () => {
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadRecoveryKey = () => {
    downloadRecoveryKey(recoveryKey, userEmail);
  };

  const showSuccess = (message: string) => {
    setSavedMessage(message);
    setErrorMessage('');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const isValidEmail = (email: string) => /^[^@\s]+@[a-zA-Z]+\.[a-zA-Z]+$/.test(email);

  const getUserInitials = () => {
    if (firstName) return firstName.charAt(0).toUpperCase();
    return 'U';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-700/30 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/vault')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Vault</span>
          </button>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <div className="w-24"></div>
        </div>
      </header>

      {/* Success/Error Messages */}
      {savedMessage && (
        <div className="max-w-6xl mx-auto px-6 mt-6">
          <div className="bg-green-500/20 border border-green-500/50 rounded-lg px-4 py-3 text-green-400">
            {savedMessage}
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="max-w-6xl mx-auto px-6 mt-6">
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-3 text-red-400">
            {errorMessage}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Profile Section */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">Profile</h2>

          {/* Profile Image */}
          <div className="flex items-center gap-6 mb-8">
            <div className="relative">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl">
                  {getUserInitials()}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-2">Profile image</p>
              <div className="flex gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleProfileImageChange}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Change profile image
                </button>
                {profileImage && (
                  <button
                    onClick={handleRemoveProfileImage}
                    className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
                  >
                    Remove image
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                First name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Last name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Save Profile
          </button>
        </div>

        {/* Change Password Section */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">Change password</h2>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">New password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 pr-12"
                />
                <button
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showNewPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    )}
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Confirm new password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 pr-12"
                />
                <button
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showConfirmPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleChangePassword}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Change Password
          </button>
        </div>

        {/* Change Email Section */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">Change email address</h2>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Current email address</label>
              <input
                type="email"
                value={userEmail}
                disabled
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">New email address</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter new email"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleChangeEmail}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Change Email
          </button>
        </div>

        {/* Recovery Key Section */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8">
          <h2 className="text-xl font-semibold text-white mb-2">Recovery key</h2>
          <p className="text-gray-400 text-sm mb-6">Export and save your recovery key to avoid your data becoming inaccessible.</p>

          <button
            onClick={handleShowRecoveryKey}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Back up key
          </button>
        </div>
      </div>

      {/* Recovery Key Modal */}
      {showRecoveryKeyModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setShowRecoveryKeyModal(false)}
          />

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
              <button
                onClick={() => setShowRecoveryKeyModal(false)}
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
              >
                <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

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

                <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>
                  Account recovery
                </h2>
                
                <p style={{ textAlign: 'center', color: '#d1d5db', marginBottom: '3rem', maxWidth: '42rem', lineHeight: '1.625' }}>
                  Export and save your recovery key to avoid your data becoming inaccessible should you ever lose your password or authenticator.{' '}
                  <span style={{ color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer' }}>Learn more.</span>
                </p>

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
                        <span style={{ fontSize: '1.5rem' }}>🔑</span>
                        <code style={{ color: '#fbbf24', fontSize: '1.25rem', fontFamily: 'monospace', letterSpacing: '0.05em', userSelect: 'all' }}>
                          {recoveryKey}
                        </code>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleDownloadRecoveryKey}
                      style={{
                        marginLeft: '2rem',
                        padding: '0.75rem 2rem',
                        backgroundColor: '#14b8a6',
                        color: 'white',
                        borderRadius: '0.5rem',
                        fontWeight: '600',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 10px 15px -3px rgba(20 184 166 / 0.2)',
                        fontSize: '1rem',
                        transition: 'all 0.2s',
                      }}
                    >
                      Download
                    </button>
                  </div>
                  
                  <button
                    onClick={handleCopyRecoveryKey}
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
    </div>
  );
}