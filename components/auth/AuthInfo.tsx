import Image from 'next/image';

export default function AuthInfo({
  variant = "default",
}: {
  variant?: "default" | "register";
}) {
  return (
    <div className="flex h-full w-full items-center justify-center px-16">
      <div className="relative w-[352px] text-center">
        {/* Illustration - Vault with Key */}
        <div className="mx-auto mb-10">
          <Image src="/auth-vault-key.svg" alt="Secure Vault" width={300} height={200} />
        </div>

        <h2 className="text-xl font-semibold mb-4 text-white">
          Create a <strong>strong, unique</strong> password
        </h2>

        <p className="text-sm text-neutral-400 mb-4">
          Use a password you don't use anywhere else to keep your account secure.
        </p>

        <p className="text-sm text-neutral-500">
          A mix of letters, numbers, and symbols works best.
        </p>
      </div>
    </div>
  );
}