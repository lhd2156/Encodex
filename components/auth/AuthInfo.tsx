export default function AuthInfo({
  variant = "default",
}: {
  variant?: "default" | "register";
}) {
  return (
    <div className="flex h-full w-full items-center justify-center px-16">
      <div className="relative w-[352px] text-center">
        {/* Illustration placeholder - exactly matching AuthRegisterInfo size */}
        <div className="mx-auto mb-10 h-32 w-32 rounded-xl bg-neutral-700 opacity-80" />

        <h2 className="text-xl font-semibold mb-4 text-white">
          Create a <strong>strong, unique</strong> password
        </h2>

        <p className="text-sm text-neutral-400 mb-4">
          Use a password you don't use anywhere else to keep your account secure.
        </p>

        <span className="text-sm text-neutral-400 cursor-pointer underline hover:text-neutral-300 transition-colors">
          Read more about creating a strong password
        </span>
      </div>
    </div>
  );
}