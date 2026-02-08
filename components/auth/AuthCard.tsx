// components/auth/AuthCard.tsx
export default function AuthCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="
        w-full
        lg:w-[720px]
        bg-neutral-800
        rounded-2xl
        px-6
        lg:px-14
        py-6
        lg:py-10
        flex
        flex-col
      "
    >
      {children}
    </div>
  );
}
