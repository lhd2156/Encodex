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
        max-w-[95vw]
        sm:max-w-[480px]
        md:max-w-[560px]
        lg:max-w-[620px]
        xl:max-w-[660px]
        bg-neutral-800
        rounded-2xl
        px-4
        sm:px-7
        md:px-9
        lg:px-11
        py-4
        sm:py-5
        md:py-6
        lg:py-7
        flex
        flex-col
      "
    >
      {children}
    </div>
  );
}