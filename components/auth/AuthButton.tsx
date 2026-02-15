export default function AuthButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="
        w-full
        py-3
        sm:py-3.5
        md:py-4
        rounded-lg
        text-base
        sm:text-lg
        font-medium
        bg-orange-500
        text-black
        hover:bg-orange-400
        disabled:bg-neutral-600
        disabled:text-neutral-400
        transition
      "
    >
      {children}
    </button>
  );
}