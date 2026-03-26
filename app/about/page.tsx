'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import EncodexFooter from '@/components/shared/EncodexFooter';

export default function AboutPage() {
  const router = useRouter();
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('about-animate-in');
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );

    document.querySelectorAll('.about-reveal').forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      <style>{`
        .about-reveal {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.65s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .about-reveal.about-animate-in {
          opacity: 1;
          transform: translateY(0);
        }
        .about-reveal.ad1 { transition-delay: 0.1s; }
        .about-reveal.ad2 { transition-delay: 0.2s; }
        .about-reveal.ad3 { transition-delay: 0.3s; }
        .about-reveal.ad4 { transition-delay: 0.4s; }
      `}</style>

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

      {/* Hero */}
      <section
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30, 58, 138, 0.2) 0%, transparent 70%)',
          padding: '5rem 0 4rem',
        }}
      >
        <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center">
          <div className="about-reveal" style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'inline-flex',
                width: '72px',
                height: '72px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(249, 115, 22, 0.25)',
              }}
            >
              <Image src="/encodex-logo-lock.svg" alt="Encodex" width={40} height={40} />
            </div>
          </div>
          <h1
            className="about-reveal ad1"
            style={{
              fontSize: 'clamp(2rem, 5vw, 3.25rem)',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.025em',
              marginBottom: '1.25rem',
              lineHeight: 1.15,
            }}
          >
            About Encodex
          </h1>
          <p
            className="about-reveal ad2"
            style={{
              color: '#94a3b8',
              fontSize: 'clamp(1rem, 2vw, 1.1875rem)',
              lineHeight: 1.75,
              maxWidth: '640px',
              margin: '0 auto',
            }}
          >
            Encodex is an end-to-end encrypted cloud storage platform built on the
            belief that privacy is a right, not a feature. We give you full control
            over your data — no compromises.
          </p>
        </div>
      </section>

      {/* What is Encodex */}
      <section style={{ padding: '5rem 0' }}>
        <div className="max-w-5xl mx-auto px-6 sm:px-8">
          <div className="about-reveal" style={{ maxWidth: '720px' }}>
            <h2
              style={{
                fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
                fontWeight: 800,
                color: '#fff',
                marginBottom: '1.5rem',
                lineHeight: 1.2,
              }}
            >
              What is <span style={{ color: '#f97316' }}>Encodex</span>?
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '1.0625rem', lineHeight: 1.85, marginBottom: '1.25rem' }}>
              Encodex is a secure, encrypted file vault that lets you store, organize, and
              share your files with complete privacy. Unlike traditional cloud storage,
              Encodex encrypts every file on your device before it ever reaches our servers.
            </p>
            <p style={{ color: '#94a3b8', fontSize: '1.0625rem', lineHeight: 1.85 }}>
              We use zero-knowledge architecture, which means we never have access to your
              encryption keys or passwords. Your data is mathematically inaccessible to
              anyone but you — including us.
            </p>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section style={{ padding: '5rem 0' }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center mb-14 about-reveal">
            <h2
              style={{
                fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
                fontWeight: 800,
                color: '#fff',
                marginBottom: '0.75rem',
              }}
            >
              Our Principles
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '1.0625rem' }}>
              The values that guide every decision we make.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {[
              {
                icon: (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                ),
                title: 'Privacy by Default',
                desc: 'Encryption is not optional — it is the foundation. Every file is encrypted before it leaves your device, always.',
              },
              {
                icon: (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                ),
                title: 'Zero-Knowledge',
                desc: 'We cannot see your data. Your keys never touch our servers. Even under legal compulsion, we can only hand over ciphertext.',
              },
              {
                icon: (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ),
                title: 'Proven Standards',
                desc: 'AES-256-GCM, PBKDF2 key derivation, per-file encryption keys. We use battle-tested cryptography, not custom experiments.',
              },
              {
                icon: (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <path d="M20 8v6" />
                    <path d="M23 11h-6" />
                  </svg>
                ),
                title: 'User Control',
                desc: 'You own your data. Export everything, delete your account, revoke share links — you are always in control.',
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className={`about-reveal ad${i + 1}`}
                style={{
                  padding: '2rem',
                  borderRadius: '1rem',
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.8))',
                  border: '1px solid rgba(51, 65, 85, 0.4)',
                  transition: 'border-color 0.3s, transform 0.3s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(51, 65, 85, 0.4)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'rgba(249, 115, 22, 0.1)',
                    border: '1px solid rgba(249, 115, 22, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.25rem',
                  }}
                >
                  {item.icon}
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff', marginBottom: '0.75rem' }}>
                  {item.title}
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9375rem', lineHeight: 1.7 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <EncodexFooter />
    </div>
  );
}
