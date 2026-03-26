'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function EncodexFooter() {
  const router = useRouter();

  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#050a16' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 2rem 28px' }}>
        {/* Clean single row: logo left, links center-right, copyright bottom */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          {/* Left — logo + tagline */}
          <div
            onClick={() => router.push('/start')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Image src="/encodex-logo-lock.svg" alt="Encodex" width={17} height={17} />
            </div>
            <span style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, letterSpacing: '0.02em' }}>Encodex</span>
          </div>

          {/* Right — links in a clean row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            {[
              { label: 'Features', href: '/start#features' },
              { label: 'Security', href: '/start#security' },
              { label: 'About', href: '/about' },
              { label: 'Terms', href: '/terms' },
              { label: 'Privacy', href: '/policy' },
            ].map((link) => (
              <span
                key={link.label}
                onClick={() => router.push(link.href)}
                style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.75)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
              >
                {link.label}
              </span>
            ))}
          </div>
        </div>

        {/* Thin divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', marginBottom: '16px' }} />

        {/* Bottom — copyright + tagline */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.18)' }}>
            © {new Date().getFullYear()} Encodex. All rights reserved.
          </span>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.18)' }}>
            End-to-end encrypted cloud storage
          </span>
        </div>
      </div>
    </footer>
  );
}
