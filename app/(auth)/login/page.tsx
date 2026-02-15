// FILE LOCATION: app/login/page.tsx
// FIXED: Responsive design with proper scaling at all zoom levels

"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/session";
import { useVaultContext } from "@/lib/vault/vault-context";

import AuthLayout from "@/components/auth/AuthLayout";
import AuthCard from "@/components/auth/AuthCard";
import AuthInput from "@/components/auth/AuthInput";
import PasswordInput from "@/components/auth/PasswordInput";
import AuthButton from "@/components/auth/AuthButton";
import AuthInfo from "@/components/auth/AuthInfo";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const { unlock } = useVaultContext();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);

  const [emailError, setEmailError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load saved email if remember me was checked
  useEffect(() => {
    const savedEmail = localStorage.getItem('sessionEmail');
    const rememberMe = localStorage.getItem('rememberMe') === 'true';
    
    if (savedEmail && rememberMe && emailRef.current) {
      emailRef.current.value = savedEmail;
      if (rememberRef.current) {
        rememberRef.current.checked = true;
      }
    }
  }, []);

  const handleLogin = async () => {
    const email = emailRef.current?.value ?? "";
    const password = passwordRef.current?.value ?? "";
    const rememberMe = rememberRef.current?.checked ?? false;

    setEmailError(email.trim() === "");
    setPasswordError(password.trim() === "");

    if (!email || !password) return;

    setIsLoading(true);

    try {
      // CALL API INSTEAD OF LOCALSTORAGE
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Login failed');
        setPasswordError(true);
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

      // Handle remember me
      if (rememberMe) {
        localStorage.setItem('sessionEmail', email);
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('sessionEmail');
        localStorage.removeItem('rememberMe');
      }

      // Create session
      createSession(email, data.user.firstName, data.user.lastName, rememberMe);

      // Auto-unlock vault with the same password (E2E encryption)
      try {
        await unlock(password);
      } catch (e) {
        // Unlock may fail if salt not ready yet - vault modal will handle it
      }

      // Redirect to vault
      router.push("/vault");

    } catch (error) {
      
      alert('An error occurred during login. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
      <header className="flex-shrink-0 flex justify-between items-center px-3 sm:px-6 md:px-8 lg:px-12 py-3 md:py-4 lg:py-5">
        <div 
          onClick={() => router.push('/start')} 
          className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 cursor-pointer"
        >
          <div className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-orange-500 flex items-center justify-center">
            <Image 
              src="/encodex-logo-lock.svg" 
              alt="Encodex" 
              width={24} 
              height={24} 
              className="w-4 h-4 sm:w-6 sm:h-6 md:w-7 md:h-7" 
            />
          </div>
          <span className="text-base sm:text-xl md:text-2xl lg:text-[28px] font-semibold tracking-wide text-white">
            Encodex
          </span>
        </div>

        <button
          onClick={() => router.push('/register')}
          className="px-2.5 sm:px-4 md:px-5 lg:px-6 py-1.5 sm:py-2 md:py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-xs sm:text-sm md:text-base font-medium transition-colors cursor-pointer"
        >
          Sign up
        </button>
      </header>

      <AuthLayout
        left={
          <AuthCard>
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-[26px] text-center mb-3 sm:mb-4 md:mb-5 text-white font-semibold">
              Log in
            </h1>

            <div className="flex flex-col gap-3 sm:gap-4 md:gap-5">
              <AuthInput
                label="Your email address"
                inputRef={emailRef as React.RefObject<HTMLInputElement>}
                error={emailError}
              />

              <PasswordInput
                label="Password"
                inputRef={passwordRef as React.RefObject<HTMLInputElement>}
                error={passwordError}
              />
            </div>

            <div className="flex justify-end text-[10px] sm:text-xs md:text-sm text-neutral-400 mt-2 sm:mt-2.5 md:mt-3">
              <span 
                onClick={() => router.push('/forgot-password')} 
                className="underline hover:text-neutral-300 transition-colors cursor-pointer"
              >
                Forgot your password?
              </span>
            </div>

            <div className="flex-grow min-h-2 sm:min-h-3 md:min-h-4" />

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 mt-3 sm:mt-4">
              <label className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm text-neutral-400 cursor-pointer">
                <input 
                  type="checkbox" 
                  ref={rememberRef}
                  className="w-4 h-4 min-w-[16px] min-h-[16px] rounded border-neutral-600 text-orange-500 cursor-pointer flex-shrink-0"
                  style={{ accentColor: '#f97316' }}
                />
                <span>Remember me</span>
              </label>

              <div className="w-full sm:w-auto sm:min-w-[130px] md:min-w-[150px]">
                <AuthButton onClick={handleLogin} disabled={isLoading}>
                  {isLoading ? 'Logging in...' : 'Log in'}
                </AuthButton>
              </div>
            </div>

            <p className="text-[10px] sm:text-xs md:text-sm text-center mt-3 sm:mt-4 md:mt-5 text-neutral-400">
              Don't have an account?{" "}
              <span 
                onClick={() => router.push('/register')} 
                className="underline hover:text-neutral-300 transition-colors cursor-pointer"
              >
                Sign up for one now
              </span>
            </p>
          </AuthCard>
        }
        right={<AuthInfo />}
      />
    </div>
  );
}