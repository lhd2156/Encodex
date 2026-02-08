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
    <div className="flex flex-col gap-2">
      <label className="text-sm text-neutral-300">
        {label}
      </label>

      <input
        ref={inputRef}
        className={`
          w-full
          bg-transparent
          border-b
          py-2
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
