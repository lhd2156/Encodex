// components/auth/AuthCard.tsx
export default function AuthCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="
        w-[720px]
        min-h-[680px]
        bg-neutral-800
        rounded-2xl
        px-14
        py-14
        flex
        flex-col
      "
    >
      {children}
    </div>
  );
}
