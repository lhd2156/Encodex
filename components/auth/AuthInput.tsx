interface AuthInputProps {
  label: string;
  error?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export default function AuthInput({
  label,
  error,
  inputRef,
}: AuthInputProps) {
  return (
    <div className="flex flex-col gap-1.5 sm:gap-2">
      <label className="text-xs sm:text-sm text-neutral-300">
        {label}
      </label>

      <input
        ref={inputRef}
        className={`
          w-full
          bg-transparent
          border-b
          py-2
          sm:py-2.5
          text-sm
          sm:text-base
          text-white
          outline-none
          transition
          ${
            error
              ? "border-red-500"
              : "border-neutral-600 focus:border-orange-400"
          }
        `}
      />
    </div>
  );
}