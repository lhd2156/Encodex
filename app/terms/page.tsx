'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import EncodexFooter from '@/components/shared/EncodexFooter';

export default function TermsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 flex justify-between items-center px-3 sm:px-6 md:px-8 lg:px-12 py-3 md:py-4 lg:py-5">
        <div
          onClick={() => router.push('/start')}
          className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 cursor-pointer"
        >
          <div className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-orange-500 flex items-center justify-center">
            <Image
              src="/encodex-logo-lock.svg"
              alt="Encodex"
              width={24}
              height={24}
              className="w-4 h-4 sm:w-6 sm:h-6 md:w-7 md:h-7"
            />
          </div>
          <span className="text-base sm:text-xl md:text-2xl lg:text-[28px] font-semibold tracking-wide text-white">
            Encodex
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.push('/login')}
            className="px-2.5 sm:px-4 md:px-5 lg:px-6 py-1.5 sm:py-2 md:py-2.5 rounded-lg bg-transparent hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs sm:text-sm md:text-base font-medium transition-colors cursor-pointer border-none"
          >
            Log in
          </button>
          <button
            onClick={() => router.push('/register')}
            className="px-2.5 sm:px-4 md:px-5 lg:px-6 py-1.5 sm:py-2 md:py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs sm:text-sm md:text-base font-semibold transition-colors cursor-pointer border-none"
          >
            Get started
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 py-16 sm:py-20">
          {/* Page header */}
          <div style={{ marginBottom: '3rem' }}>
            <h1
              style={{
                fontSize: 'clamp(2rem, 5vw, 3rem)',
                fontWeight: 800,
                color: '#fff',
                letterSpacing: '-0.025em',
                marginBottom: '0.75rem',
              }}
            >
              Terms of Service
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>
              Last updated: March 25, 2026
            </p>
          </div>

          {/* Prose content */}
          <div
            style={{
              color: '#cbd5e1',
              fontSize: '0.9375rem',
              lineHeight: 1.85,
            }}
          >
            <Section title="1. Acceptance of Terms">
              <p>
                By accessing or using Encodex ("the Service"), you agree to be bound by these Terms
                of Service. If you do not agree to these terms, you may not access or use the Service.
              </p>
              <p className="mt-4">
                Encodex reserves the right to modify these terms at any time. We will notify users of
                significant changes via the Service. Continued use after changes constitutes acceptance
                of the updated terms.
              </p>
            </Section>

            <Section title="2. Account Registration">
              <p>
                To use Encodex, you must create an account by providing accurate and complete
                information. You are responsible for maintaining the confidentiality of your password
                and recovery key.
              </p>
              <p className="mt-4">
                <strong style={{ color: '#f97316' }}>Important:</strong> Encodex uses end-to-end
                encryption. If you lose your password and recovery key, your data cannot be recovered
                by anyone, including Encodex. You are solely responsible for safeguarding your
                credentials.
              </p>
            </Section>

            <Section title="3. Acceptable Use">
              <p>You agree not to use Encodex to:</p>
              <ul
                style={{
                  marginTop: '0.75rem',
                  paddingLeft: '1.5rem',
                  listStyleType: 'disc',
                }}
              >
                <li className="mb-2">Upload, store, or share illegal content</li>
                <li className="mb-2">Distribute malware or malicious code</li>
                <li className="mb-2">Attempt to circumvent security measures</li>
                <li className="mb-2">Infringe on the intellectual property rights of others</li>
                <li className="mb-2">Harass, abuse, or threaten other users</li>
                <li className="mb-2">Use the Service in any way that violates applicable laws</li>
              </ul>
            </Section>

            <Section title="4. Data & Encryption">
              <p>
                Encodex provides end-to-end encryption for your files. Files are encrypted on your
                device before being uploaded to our servers. Encodex does not have access to your
                encryption keys and cannot decrypt your files.
              </p>
              <p className="mt-4">
                You retain full ownership of your data. Encodex does not claim any rights to your
                files or content. We serve only as an encrypted storage provider.
              </p>
            </Section>

            <Section title="5. Service Availability">
              <p>
                Encodex strives to maintain continuous availability of the Service. However, we do not
                guarantee uninterrupted access and may perform maintenance, updates, or modifications
                that could temporarily affect availability.
              </p>
            </Section>

            <Section title="6. Limitation of Liability">
              <p>
                To the maximum extent permitted by law, Encodex shall not be liable for any indirect,
                incidental, special, consequential, or punitive damages resulting from your use of or
                inability to use the Service, including but not limited to data loss due to lost
                credentials.
              </p>
            </Section>

            <Section title="7. Account Termination">
              <p>
                You may delete your account at any time through the Settings page. Upon deletion, all
                your encrypted data will be permanently removed from our servers.
              </p>
              <p className="mt-4">
                Encodex reserves the right to suspend or terminate accounts that violate these Terms
                of Service.
              </p>
            </Section>

            <Section title="8. Changes to Terms">
              <p>
                We may update these Terms of Service from time to time. We will notify users of
                material changes. Your continued use of the Service following any changes indicates
                your acceptance of the new terms.
              </p>
            </Section>

            <Section title="9. Contact">
              <p>
                If you have any questions about these Terms of Service, please contact us through the
                Encodex platform.
              </p>
            </Section>
          </div>
        </div>
      </main>

      <EncodexFooter />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2
        style={{
          fontSize: '1.375rem',
          fontWeight: 700,
          color: '#f1f5f9',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}
