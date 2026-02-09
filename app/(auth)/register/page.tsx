// FILE LOCATION: app/register/page.tsx
// FIXED: Responsive design matching login page with proper alignment

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/session";
import { storePasswordHash } from "@/lib/crypto";
import { downloadRecoveryKey, isValidRecoveryKey } from "@/lib/recoveryKey";
import { useVaultContext } from "@/lib/vault/vault-context";

import AuthLayout from "@/components/auth/AuthLayout";
import AuthCard from "@/components/auth/AuthCard";
import AuthInput from "@/components/auth/AuthInput";
import PasswordInput from "@/components/auth/PasswordInput";
import AuthButton from "@/components/auth/AuthButton";
import AuthRegisterInfo from "@/components/auth/AuthRegisterInfo";
import Image from "next/image";

// simple validators
const isValidEmail = (email: string) =>
  /^[^@\s]+@[a-zA-Z]+\.[a-zA-Z]+$/.test(email);

const isOnlyLetters = (value: string) =>
  /^[A-Za-z\s]+$/.test(value);

export default function RegisterPage() {
  const router = useRouter();
  const { unlock } = useVaultContext();

  // refs
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // error states
  const [firstNameError, setFirstNameError] = useState(false);
  const [lastNameError, setLastNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [emailAlreadyUsed, setEmailAlreadyUsed] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Recovery key modal state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  
  // Agreement checkboxes state
  const [agreedDataLoss, setAgreedDataLoss] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");
  const [savedPassword, setSavedPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const handleRegister = async () => {
    const first = firstNameRef.current?.value.trim() ?? "";
    const last = lastNameRef.current?.value.trim() ?? "";
    const email = emailRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    const confirm = confirmRef.current?.value ?? "";

    const firstInvalid = !first || !isOnlyLetters(first);
    const lastInvalid = !last || !isOnlyLetters(last);
    const emailInvalid = !isValidEmail(email);
    const passwordInvalid = password.length < 8;
    const confirmInvalid = confirm !== password || confirm.length < 8;

    setFirstNameError(firstInvalid);
    setLastNameError(lastInvalid);
    setEmailError(emailInvalid);
    setPasswordError(passwordInvalid);
    setConfirmError(confirmInvalid);

    if (
      firstInvalid ||
      lastInvalid ||
      emailInvalid ||
      passwordInvalid ||
      confirmInvalid
    ) {
      return;
    }

    setIsLoading(true);
    setEmailAlreadyUsed(false);

    try {
      // CALL API
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          firstName: first,
          lastName: last
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'User already exists') {
          setEmailAlreadyUsed(true);
        } else {
          alert(data.error || 'Registration failed');
        }
        setIsLoading(false);
        return;
      }

      // FIX: Clear ALL old session data before setting new
      // This prevents cross-user data contamination
      sessionStorage.clear(); // Clear all sessionStorage
      localStorage.removeItem('user_session');
      localStorage.removeItem('session');
      localStorage.removeItem('user');
      
      // STORE AUTH TOKEN (sessionStorage for per-tab isolation)
      sessionStorage.setItem('auth_token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // STORE SALT FOR ENCRYPTION
      if (data.salt) {
        const saltUint8 = new Uint8Array(data.salt);
        const hexSalt = Array.from(saltUint8)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        localStorage.setItem(`vault_salt_${email}`, hexSalt);
      }

      // STORE PASSWORD HASH FOR CLIENT-SIDE VERIFICATION
      await storePasswordHash(email, password);

      // GENERATE RECOVERY KEY
      const key = data.recoveryKey;
      setRecoveryKey(key);
      setNewUserEmail(email);
      setNewUserFirstName(first);
      setNewUserLastName(last);
      setSavedPassword(password); // Save for auto-unlock
      setCopied(false);
      
      setIsLoading(false);
      
      // Show recovery key modal BEFORE redirecting
      setShowRecoveryModal(true);

    } catch (error) {
      
      alert('An error occurred during registration. Please try again.');
      setIsLoading(false);
    }
  };

  const handleContinueToVault = async () => {
    // Create session and redirect to vault
    createSession(newUserEmail, newUserFirstName, newUserLastName);
    
    // Auto-unlock vault with the password (E2E encryption)
    try {
      await unlock(savedPassword);
    } catch (e) {
      // Unlock may fail - vault modal will handle it
    }
    
    router.push("/vault");
  };

  const handleCopy = async () => {
    if (recoveryKey) {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (recoveryKey && newUserEmail) {
      downloadRecoveryKey(newUserEmail, recoveryKey);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
      <header className="flex-shrink-0 flex justify-between items-center px-4 sm:px-6 md:px-8 lg:px-12 py-4 md:py-5 lg:py-6">
        <div 
          onClick={() => router.push('/start')} 
          className="flex items-center gap-2 sm:gap-2.5 md:gap-3 cursor-pointer"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-orange-500 flex items-center justify-center">
            <Image 
              src="/encodex-logo-lock.svg" 
              alt="Encodex" 
              width={24} 
              height={24} 
              className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" 
            />
          </div>
          <span className="text-lg sm:text-xl md:text-2xl lg:text-[28px] font-semibold tracking-wide text-white">
            Encodex
          </span>
        </div>

        <button
          onClick={() => router.push('/login')}
          className="px-3 sm:px-4 md:px-5 lg:px-6 py-2 sm:py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-xs sm:text-sm md:text-base font-medium transition-colors cursor-pointer"
        >
          Log in
        </button>
      </header>

      <AuthLayout
        left={
          <AuthCard>
            <h1 className="text-xl sm:text-2xl md:text-[26px] lg:text-[28px] text-center mb-4 sm:mb-5 md:mb-6 text-white font-semibold">
              Sign up for a{" "}
              <span className="text-orange-500">free</span> account
            </h1>

            <div className="flex flex-col gap-3.5 sm:gap-4">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <AuthInput
                  label="First name"
                  inputRef={firstNameRef as React.RefObject<HTMLInputElement>}
                  error={firstNameError}
                />
                <AuthInput
                  label="Last name"
                  inputRef={lastNameRef as React.RefObject<HTMLInputElement>}
                  error={lastNameError}
                />
              </div>

              <AuthInput
                label="Email address"
                inputRef={emailRef as React.RefObject<HTMLInputElement>}
                error={emailError}
              />

              {emailAlreadyUsed && (
                <div className="text-red-500 text-xs sm:text-sm -mt-2">
                  Email already has been used
                </div>
              )}

              <PasswordInput
                label="Password"
                inputRef={passwordRef as React.RefObject<HTMLInputElement>}
                error={passwordError}
              />

              <PasswordInput
                label="Retype password"
                inputRef={confirmRef as React.RefObject<HTMLInputElement>}
                error={confirmError}
              />
            </div>

            {/* Agreement Checkboxes */}
            <div className="mt-3 sm:mt-4 space-y-2">
              <label className="flex items-start gap-2 sm:gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedDataLoss}
                  onChange={(e) => setAgreedDataLoss(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-neutral-600 text-orange-500 cursor-pointer flex-shrink-0"
                />
                <span className="text-[10px] sm:text-xs text-neutral-400 leading-snug">
                  I understand that <span className="text-red-400 font-semibold">if I lose my password, I may lose my data</span>. Read more about Encodex's end-to-end encryption.
                </span>
              </label>
              
              <label className="flex items-start gap-2 sm:gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-neutral-600 text-orange-500 cursor-pointer flex-shrink-0"
                />
                <span className="text-[10px] sm:text-xs text-neutral-400 leading-snug">
                  I have read, understood, and agree to Encodex's <span className="text-orange-400 hover:underline cursor-pointer">Terms of Service</span>.
                </span>
              </label>
            </div>

            <div className="mt-3 sm:mt-4 flex justify-end">
              <div className="w-full sm:w-auto sm:min-w-[140px] md:min-w-[160px]">
                <AuthButton onClick={handleRegister} disabled={isLoading || !agreedDataLoss || !agreedTerms}>
                  {isLoading ? 'Creating...' : 'Sign up →'}
                </AuthButton>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-center mt-3 sm:mt-4 text-neutral-400">
              Already have an account?{" "}
              <span 
                onClick={() => router.push('/login')} 
                className="underline hover:text-neutral-300 transition-colors cursor-pointer"
              >
                Log in
              </span>
            </p>
          </AuthCard>
        }
        right={<AuthRegisterInfo />}
      />

      {/* Recovery Key Modal */}
      {showRecoveryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
            }}
          />

          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '1050px',
                height: 'auto',
                maxHeight: '90vh',
                background: 'linear-gradient(to bottom, rgb(30 58 138), rgb(23 37 84))',
                borderRadius: '0.5rem',
                border: '1px solid rgba(29 78 216 / 0.5)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                position: 'relative',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2rem 1.5rem',
                }}
              >
                <div style={{ marginBottom: '1.5rem' }}>
                  <div
                    style={{
                      width: '6rem',
                      height: '6rem',
                      background: 'linear-gradient(to bottom right, rgba(59 130 246 / 0.2), rgba(37 99 235 / 0.2))',
                      borderRadius: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(59 130 246 / 0.3)',
                    }}
                  >
                    <svg style={{ width: '3rem', height: '3rem', color: '#fbbf24' }} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.65 10C11.7 7.31 8.9 5.5 5.77 6.12c-2.29.46-4.15 2.29-4.63 4.58C.32 14.57 3.26 18 7 18c2.61 0 4.83-1.67 5.65-4H17v2c0 1.1.9 2 2 2s2-.9 2-2v-2c1.1 0 2-.9 2-2s-.9-2-2-2h-8.35zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                    </svg>
                  </div>
                </div>

                <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 1.875rem)', fontWeight: 'bold', color: 'white', marginBottom: '0.75rem', textAlign: 'center' }}>
                  Account recovery
                </h2>
                
                <p style={{ textAlign: 'center', color: '#d1d5db', marginBottom: '2rem', maxWidth: '42rem', lineHeight: '1.625', fontSize: 'clamp(0.875rem, 2vw, 1rem)', padding: '0 1rem' }}>
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
                    padding: 'clamp(1rem, 3vw, 2rem)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: 'clamp(1rem, 2.5vw, 1.125rem)', fontWeight: '600', color: 'white', marginBottom: '0.75rem' }}>
                        Export your recovery key
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <Image src="/encodex-key.svg" alt="Key" width={24} height={24} />
                        <code style={{ color: '#fbbf24', fontSize: 'clamp(0.875rem, 2vw, 1.25rem)', fontFamily: 'monospace', letterSpacing: '0.05em', userSelect: 'all', wordBreak: 'break-all' }}>
                          {recoveryKey}
                        </code>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleDownload}
                      style={{
                        width: '100%',
                        padding: '0.75rem 2rem',
                        backgroundColor: '#F97316',
                        color: 'white',
                        borderRadius: '0.5rem',
                        fontWeight: '600',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 10px 15px -3px rgba(249 115 22 / 0.2)',
                        fontSize: 'clamp(0.875rem, 2vw, 1rem)',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#EA580C';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#F97316';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      Download
                    </button>
                  </div>
                  
                  <button
                    onClick={handleCopy}
                    style={{
                      marginTop: '1rem',
                      fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)',
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

                <button
                  onClick={handleContinueToVault}
                  style={{
                    marginTop: '2rem',
                    padding: '0.875rem 3rem',
                    backgroundColor: '#F97316',
                    color: 'white',
                    borderRadius: '0.5rem',
                    fontWeight: '700',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'clamp(1rem, 2vw, 1.125rem)',
                    boxShadow: '0 10px 15px -3px rgba(249 115 22 / 0.3)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#EA580C';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#F97316';
                  }}
                >
                  Continue to Vault →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}