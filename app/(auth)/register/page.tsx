"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/session";

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

    // ✅ All valid — save account data and create session
    if (!accounts.find((acc: any) => acc.email === email)) {
      accounts.push({
        email,
        firstName: first,
        lastName: last,
        password, // In production, this should be hashed
      });
      localStorage.setItem('userAccounts', JSON.stringify(accounts));
    }
    
    // Create session
    createSession(email, first, last);
    
    router.push("/vault");
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
    </div>
  );
}