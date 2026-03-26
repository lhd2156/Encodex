'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import EncodexFooter from '@/components/shared/EncodexFooter';

export default function PolicyPage() {
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
              Privacy Policy
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>
              Last updated: March 25, 2026
            </p>
          </div>

          {/* Prose */}
          <div style={{ color: '#cbd5e1', fontSize: '0.9375rem', lineHeight: 1.85 }}>
            <div style={{ marginBottom: '2rem', padding: '1.25rem 1.5rem', borderRadius: '0.75rem', background: 'rgba(249, 115, 22, 0.06)', border: '1px solid rgba(249, 115, 22, 0.15)' }}>
              <p style={{ color: '#fb923c', fontWeight: 600, marginBottom: '0.25rem' }}>Our commitment</p>
              <p style={{ color: '#94a3b8' }}>
                Encodex is built on the principle that your data belongs to you. We use
                zero-knowledge encryption, which means we cannot access your files — ever.
              </p>
            </div>

            <Section title="1. Information We Collect">
              <p><strong style={{ color: '#e2e8f0' }}>Account information:</strong> When you register, we collect your name and email address to create and manage your account.</p>
              <p className="mt-3"><strong style={{ color: '#e2e8f0' }}>Usage data:</strong> We collect basic usage data such as login timestamps and storage usage to maintain and improve the Service.</p>
              <p className="mt-3"><strong style={{ color: '#e2e8f0' }}>Files:</strong> Your files are encrypted on your device before upload. We store only encrypted data — we cannot read, access, or analyze your file contents.</p>
            </Section>

            <Section title="2. How We Use Your Information">
              <p>We use the information we collect to:</p>
              <ul style={{ marginTop: '0.75rem', paddingLeft: '1.5rem', listStyleType: 'disc' }}>
                <li className="mb-2">Provide and maintain the Encodex service</li>
                <li className="mb-2">Authenticate your identity and manage your account</li>
                <li className="mb-2">Send important service-related communications</li>
                <li className="mb-2">Improve and optimize the Service</li>
                <li className="mb-2">Ensure security and prevent abuse</li>
              </ul>
            </Section>

            <Section title="3. Data Storage & Encryption">
              <p>
                All files stored on Encodex are protected with AES-256-GCM encryption. Encryption
                and decryption happen exclusively on your device. Your encryption keys are derived
                from your password using PBKDF2 and never transmitted to our servers.
              </p>
              <p className="mt-4">
                This means that Encodex staff, even with full server access, cannot decrypt or view
                your files. If you lose your password and recovery key, your data is permanently
                inaccessible.
              </p>
            </Section>

            <Section title="4. Data Sharing">
              <p>
                We do not sell, trade, or rent your personal information to third parties. We may
                share information only in the following limited circumstances:
              </p>
              <ul style={{ marginTop: '0.75rem', paddingLeft: '1.5rem', listStyleType: 'disc' }}>
                <li className="mb-2">When required by law or legal process</li>
                <li className="mb-2">To protect the rights, safety, or property of Encodex or users</li>
                <li className="mb-2">With your explicit consent</li>
              </ul>
              <p className="mt-3">
                Even in legal situations, we can only provide encrypted data — we cannot decrypt your files.
              </p>
            </Section>

            <Section title="5. Cookies" id="cookies">
              <p>
                Encodex uses essential cookies to maintain your session and ensure the Service
                functions correctly. These cookies are strictly necessary and do not track your
                browsing activity across websites.
              </p>
              <p className="mt-4">
                We do not use advertising cookies, third-party tracking pixels, or analytics services
                that identify individual users.
              </p>
            </Section>

            <Section title="6. Your Rights">
              <p>You have the right to:</p>
              <ul style={{ marginTop: '0.75rem', paddingLeft: '1.5rem', listStyleType: 'disc' }}>
                <li className="mb-2">Access your account data</li>
                <li className="mb-2">Update or correct your personal information</li>
                <li className="mb-2">Delete your account and all associated data</li>
                <li className="mb-2">Export your files at any time</li>
                <li className="mb-2">Withdraw consent and close your account</li>
              </ul>
            </Section>

            <Section title="7. Data Retention">
              <p>
                We retain your account data for as long as your account is active. If you delete your
                account, all personal information and encrypted files are permanently removed from
                our servers within 30 days.
              </p>
              <p className="mt-4">
                Files moved to the trash are recoverable until permanently deleted. Permanently
                deleted files are irreversibly removed.
              </p>
            </Section>

            <Section title="8. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. We will notify users of
                material changes via the Service. Your continued use of Encodex after changes
                indicates acceptance of the updated policy.
              </p>
            </Section>

            <Section title="9. Contact">
              <p>
                If you have questions about this Privacy Policy or how we handle your data, please
                contact us through the Encodex platform.
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
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div id={id} style={{ marginBottom: '2.5rem' }}>
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
