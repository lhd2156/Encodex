// FILE LOCATION: app/login/page.tsx
// UPDATED to use PostgreSQL backend API

"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/session";

import AuthLayout from "@/components/auth/AuthLayout";
import AuthCard from "@/components/auth/AuthCard";
import AuthInput from "@/components/auth/AuthInput";
import PasswordInput from "@/components/auth/PasswordInput";
import AuthButton from "@/components/auth/AuthButton";
import AuthInfo from "@/components/auth/AuthInfo";

export default function LoginPage() {
  const router = useRouter();
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
      // ✅ CALL API INSTEAD OF LOCALSTORAGE
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

      // ✅ CRITICAL FIX: Clear ALL old session data before setting new
      // This prevents cross-user data contamination
      sessionStorage.clear(); // Clear all sessionStorage
      localStorage.removeItem('user_session');
      localStorage.removeItem('session');
      localStorage.removeItem('user');
      
      // ✅ STORE AUTH TOKEN (sessionStorage for per-tab isolation)
      sessionStorage.setItem('auth_token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // ✅ STORE SALT FOR ENCRYPTION
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

      console.log('✅ Login successful for:', email);

      // Redirect to vault
      router.push("/vault");

    } catch (error) {
      console.error('Login error:', error);
      alert('An error occurred during login. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
      <header className="flex justify-between items-center px-12 py-8">
        <div 
          onClick={() => router.push('/start')} 
          className="flex items-center gap-3 cursor-pointer"
        >
          <div className="text-3xl">🔒</div>
          <span className="text-[28px] font-semibold tracking-wide text-white">
            Encodex
          </span>
        </div>

        <button
          onClick={() => router.push('/register')}
          className="px-6 py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white font-medium transition-colors cursor-pointer"
        >
          Sign up
        </button>
      </header>

      <AuthLayout
        left={
          <AuthCard>
            <h1 className="text-[32px] text-center mb-12 text-white">
              Log in
            </h1>

            <div className="flex flex-col gap-8">
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

            <div className="flex justify-end text-sm text-neutral-400 mt-4">
              <span 
                onClick={() => router.push('/forgot-password')} 
                className="underline hover:text-neutral-300 transition-colors cursor-pointer"
              >
                Forgot your password?
              </span>
            </div>

            <div className="flex-grow" />

            <div className="flex items-center justify-between">
              <label
                className="
                  flex items-center gap-2
                  text-sm text-neutral-400
                  cursor-pointer
                  h-[56px]
                  self-end
                  mb-[6px]
                "
              >
                <input 
                  type="checkbox" 
                  ref={rememberRef}
                  className="w-4 h-4 rounded border-neutral-600 text-orange-500 cursor-pointer"
                />
                Remember me
              </label>

              <div className="w-[220px]">
                <AuthButton onClick={handleLogin} disabled={isLoading}>
                  {isLoading ? 'Logging in...' : 'Log in'}
                </AuthButton>
              </div>
            </div>

            <p className="text-sm text-center mt-8 text-neutral-400">
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