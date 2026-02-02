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
        mt-10
        w-full
        py-4
        rounded-lg
        text-lg
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