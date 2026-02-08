// components/auth/AuthLayout.tsx
export default function AuthLayout({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-4 overflow-hidden">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-28 items-center">
        {left}
        {right && (
          <div className="hidden xl:block max-w-sm">
            {right}
          </div>
        )}
      </div>
    </main>
  );
}