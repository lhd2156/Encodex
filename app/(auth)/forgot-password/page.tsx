'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ForgotPasswordPage() {
  const router = useRouter();

  // Step 1: Verification
  const emailRef = useRef<HTMLInputElement>(null);
  const recoveryKeyRef = useRef<HTMLInputElement>(null);

  // Step 2: Reset Password
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'verify' | 'reset'>('verify');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Error states
  const [emailError, setEmailError] = useState(false);
  const [recoveryKeyError, setRecoveryKeyError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isValidEmail = (email: string) => /^[^@\s]+@[a-zA-Z]+\.[a-zA-Z]+$/.test(email);

  const handleVerify = () => {
    const email = emailRef.current?.value.trim() ?? '';
    const recoveryKey = recoveryKeyRef.current?.value.trim() ?? '';

    setEmailError(false);
    setRecoveryKeyError(false);
    setErrorMessage('');

    // Validate email
    if (!isValidEmail(email)) {
      setEmailError(true);
      setErrorMessage('Please enter a valid email address');
      return;
    }

    // Validate recovery key
    if (!recoveryKey) {
      setRecoveryKeyError(true);
      setErrorMessage('Please enter your recovery key');
      return;
    }

    // Check if account exists
    const accounts = JSON.parse(localStorage.getItem('userAccounts') || '[]');
    const account = accounts.find((acc: any) => acc.email === email);

    if (!account) {
      setEmailError(true);
      setErrorMessage('No account found with this email address');
      return;
    }

    // Verify recovery key
    const storedKey = localStorage.getItem(`recovery_key_${email}`);
    if (!storedKey || storedKey !== recoveryKey) {
      setRecoveryKeyError(true);
      setErrorMessage('Invalid recovery key');
      return;
    }

    // Success - move to reset step
    setVerifiedEmail(email);
    setStep('reset');
  };

  const handleResetPassword = () => {
    const newPassword = newPasswordRef.current?.value ?? '';
    const confirmPassword = confirmPasswordRef.current?.value ?? '';

    setPasswordError(false);
    setConfirmError(false);
    setErrorMessage('');

    // Validate passwords
    if (newPassword.length < 8) {
      setPasswordError(true);
      setErrorMessage('Password must be at least 8 characters');
      return;
    }

    if (confirmPassword !== newPassword) {
      setConfirmError(true);
      setErrorMessage('Passwords do not match');
      return;
    }

    // Update password
    const accounts = JSON.parse(localStorage.getItem('userAccounts') || '[]');
    const accountIndex = accounts.findIndex((acc: any) => acc.email === verifiedEmail);

    if (accountIndex !== -1) {
      accounts[accountIndex].password = newPassword;
      localStorage.setItem('userAccounts', JSON.stringify(accounts));

      // Success - redirect to login
      alert('Password successfully reset! You can now log in with your new password.');
      router.push('/login');
    }
  };

  return (
    <div className="h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-12 py-8">
        <div 
          onClick={() => router.push('/start')} 
          className="flex items-center gap-3 cursor-pointer"
        >
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

      {/* Main Content */}
      <div className="flex items-center justify-center px-4" style={{ height: 'calc(100vh - 120px)' }}>
        <div className="w-full max-w-[520px] bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-10">
          {step === 'verify' ? (
            <>
              <h1 className="text-[30px] text-center mb-3 text-white">
                Reset your password
              </h1>
              <p className="text-center text-gray-400 mb-10">
                Enter your email and recovery key to continue
              </p>

              {errorMessage && (
                <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 text-sm">
                  {errorMessage}
                </div>
              )}

              <div className="flex flex-col gap-8">
                {/* Email Input */}
                <div>
                  <label className="block text-[15px] mb-3 text-gray-300">
                    Email address
                  </label>
                  <input
                    ref={emailRef}
                    type="email"
                    placeholder="Enter your email"
                    className={`w-full bg-slate-900/50 border ${
                      emailError ? 'border-red-500' : 'border-slate-700'
                    } rounded-xl px-5 py-4 text-white text-[15px] focus:outline-none focus:border-blue-500 transition-colors`}
                  />
                </div>

                {/* Recovery Key Input */}
                <div>
                  <label className="block text-[15px] mb-3 text-gray-300">
                    Recovery key
                  </label>
                  <input
                    ref={recoveryKeyRef}
                    type="text"
                    placeholder="Enter your recovery key"
                    className={`w-full bg-slate-900/50 border ${
                      recoveryKeyError ? 'border-red-500' : 'border-slate-700'
                    } rounded-xl px-5 py-4 text-white text-[15px] font-mono focus:outline-none focus:border-blue-500 transition-colors`}
                  />
                </div>
              </div>

              <div className="mt-10 flex justify-end">
                <button
                  onClick={handleVerify}
                  className="px-8 py-3.5 bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400 rounded-xl text-white font-semibold text-[15px] transition-all shadow-lg hover:shadow-xl"
                >
                  Verify →
                </button>
              </div>

              <p className="text-sm text-center mt-10 text-neutral-400">
                Remember your password?{' '}
                <span 
                  onClick={() => router.push('/login')} 
                  className="underline hover:text-neutral-300 transition-colors cursor-pointer"
                >
                  Log in
                </span>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[30px] text-center mb-3 text-white">
                Create new password
              </h1>
              <p className="text-center text-gray-400 mb-10">
                Enter your new password for <span className="text-teal-400">{verifiedEmail}</span>
              </p>

              {errorMessage && (
                <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 text-sm">
                  {errorMessage}
                </div>
              )}

              <div className="flex flex-col gap-8">
                {/* New Password Input */}
                <div>
                  <label className="block text-[15px] mb-3 text-gray-300">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      ref={newPasswordRef}
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Enter new password (min. 8 characters)"
                      className={`w-full bg-slate-900/50 border ${
                        passwordError ? 'border-red-500' : 'border-slate-700'
                      } rounded-xl px-5 py-4 text-white text-[15px] focus:outline-none focus:border-blue-500 transition-colors pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
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

                {/* Confirm Password Input */}
                <div>
                  <label className="block text-[15px] mb-3 text-gray-300">
                    Confirm new password
                  </label>
                  <div className="relative">
                    <input
                      ref={confirmPasswordRef}
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your new password"
                      className={`w-full bg-slate-900/50 border ${
                        confirmError ? 'border-red-500' : 'border-slate-700'
                      } rounded-xl px-5 py-4 text-white text-[15px] focus:outline-none focus:border-blue-500 transition-colors pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
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

              <div className="mt-10 flex justify-end">
                <button
                  onClick={handleResetPassword}
                  className="px-8 py-3.5 bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400 rounded-xl text-white font-semibold text-[15px] transition-all shadow-lg hover:shadow-xl"
                >
                  Reset password →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}