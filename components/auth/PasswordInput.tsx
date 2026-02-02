"use client";

import { useState } from "react";

interface PasswordInputProps {
  label: string;
  error?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export default function PasswordInput({
  label,
  error,
  inputRef,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-neutral-300">
        {label}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          type={visible ? "text" : "password"}
          className={`
            w-full
            bg-transparent
            border-b
            py-2
            pr-10
            text-white
            outline-none
            transition
            ${
              error
                ? "border-red-500"
                : "border-neutral-600 focus:border-emerald-400"
            }
          `}
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-0 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
        >
          👁
        </button>
      </div>

      <span className="text-xs text-neutral-400">
        Minimum 8 characters
      </span>
    </div>
  );
}
