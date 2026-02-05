"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/session";
import { ensureRecoveryKeyExists, downloadRecoveryKey } from "@/lib/recoveryKey";

import AuthLayout from "@/components/auth/AuthLayout";
import AuthCard from "@/components/auth/AuthCard";
import AuthInput from "@/components/auth/AuthInput";
import PasswordInput from "@/components/auth/PasswordInput";
import AuthButton from "@/components/auth/AuthButton";
import AuthRegisterInfo from "@/components/auth/AuthRegisterInfo";

// simple validators
const isValidEmail = (email: string) =>
  /^[^@\s]+@[a-zA-Z]+\.[a-zA-Z]+$/.test(email);

const isOnlyLetters = (value: string) =>
  /^[A-Za-z\s]+$/.test(value);

export default function RegisterPage() {
  const router = useRouter();

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

  // Recovery key modal state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const handleRegister = () => {
    const first = firstNameRef.current?.value.trim() ?? "";
    const last = lastNameRef.current?.value.trim() ?? "";
    const email = emailRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    const confirm = confirmRef.current?.value ?? "";

    // Check if email already exists
    const accounts = JSON.parse(localStorage.getItem('userAccounts') || '[]');
    const emailExists = accounts.some((acc: any) => acc.email === email);

    const firstInvalid = !first || !isOnlyLetters(first);
    const lastInvalid = !last || !isOnlyLetters(last);
    const emailInvalid = !isValidEmail(email);
    const passwordInvalid = password.length < 8;
    const confirmInvalid = confirm !== password || confirm.length < 8;

    setFirstNameError(firstInvalid);
    setLastNameError(lastInvalid);
    setEmailError(emailInvalid);
    setEmailAlreadyUsed(emailExists && !emailInvalid);
    setPasswordError(passwordInvalid);
    setConfirmError(confirmInvalid);

    if (
      firstInvalid ||
      lastInvalid ||
      emailInvalid ||
      emailExists ||
      passwordInvalid ||
      confirmInvalid
    ) {
      return;
    }

    // ✅ All valid — save account data
    if (!accounts.find((acc: any) => acc.email === email)) {
      accounts.push({
        email,
        firstName: first,
        lastName: last,
        password, // In production, this should be hashed
      });
      localStorage.setItem('userAccounts', JSON.stringify(accounts));
    }
    
    // 🔑 GENERATE RECOVERY KEY FOR NEW USER
    const key = ensureRecoveryKeyExists(email);
    setRecoveryKey(key);
    setNewUserEmail(email);
    setCopied(false);
    
    // Show recovery key modal BEFORE creating session
    setShowRecoveryModal(true);
  };

  const handleContinueToVault = () => {
    // Create session and redirect to vault
    const accounts = JSON.parse(localStorage.getItem('userAccounts') || '[]');
    const account = accounts.find((acc: any) => acc.email === newUserEmail);
    
    if (account) {
      createSession(newUserEmail, account.firstName, account.lastName);
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
    <div className="h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
      {/* Header with perfect fade */}
      <header className="flex justify-between items-center px-12 py-8">
        <div 
          onClick={() => router.push('/start')} 
          className="flex items-center gap-3 cursor-pointer"
        >
          {/* Temporary Logo - Replace with actual logo later */}
          <div className="text-3xl">🔐</div>
          <span className="text-[28px] font-semibold tracking-wide text-white">
            Encodex
          </span>
        </div>

        <button
          onClick={() => router.push('/login')}
          className="px-6 py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white font-medium transition-colors cursor-pointer"
        >
          Log in
        </button>
      </header>

      <AuthLayout
        left={
          <AuthCard>
            <h1 className="text-[30px] text-center mb-14 text-white">
              Sign up for a{" "}
              <span className="text-orange-500">free</span> account
            </h1>

            <div className="flex flex-col gap-10">
              <div className="grid grid-cols-2 gap-6">
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
                <div className="text-red-500 text-sm -mt-8">
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

            <div className="flex-grow" />

            <div className="mt-8 flex justify-end">
              <AuthButton onClick={handleRegister}>
                Sign up →
              </AuthButton>
            </div>

            <p className="text-sm text-center mt-10 text-neutral-400">
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

      {/* Recovery Key Modal - MATCHING REFERENCE LAYOUT */}
      {showRecoveryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
            }}
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
              }}
            >
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
                <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>
                  Account recovery
                </h2>
                
                {/* Description */}
                <p style={{ textAlign: 'center', color: '#d1d5db', marginBottom: '3rem', maxWidth: '42rem', lineHeight: '1.625' }}>
                  Export and save your recovery key to avoid your data becoming inaccessible should you ever lose your password or authenticator.{' '}
                  <span style={{ color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer' }}>Learn more.</span>
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
                        <span style={{ fontSize: '1.5rem' }}>🔑</span>
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
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0d9488';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#14b8a6';
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

                {/* Continue Button */}
                <button
                  onClick={handleContinueToVault}
                  style={{
                    marginTop: '3rem',
                    padding: '0.875rem 3rem',
                    backgroundColor: '#14b8a6',
                    color: 'white',
                    borderRadius: '0.5rem',
                    fontWeight: '700',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.125rem',
                    boxShadow: '0 10px 15px -3px rgba(20 184 166 / 0.3)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0d9488';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#14b8a6';
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