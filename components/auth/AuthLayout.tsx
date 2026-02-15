// components/auth/AuthLayout.tsx
export default function AuthLayout({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-2 sm:px-4 py-3 sm:py-4 overflow-y-auto">
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-16 xl:gap-24 items-center justify-center w-full max-w-7xl">
        {left}
        {right && (
          <div className="hidden xl:block flex-shrink-0">
            {right}
          </div>
        )}
      </div>
    </main>
  );
}