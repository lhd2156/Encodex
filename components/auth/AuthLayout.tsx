// components/auth/AuthLayout.tsx
export default function AuthLayout({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <main className="h-[calc(100vh-88px)] flex items-center justify-center overflow-hidden">
      <div className="flex gap-28 items-center">
        {left}
        {right && (
          <div className="max-w-sm">
            {right}
          </div>
        )}
      </div>
    </main>
  );
}