'use client';

import { useState, useEffect } from 'react';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('encodex_cookie_consent');
    if (!consent) {
      // Small delay so the page loads first, then the banner slides up
      const timer = setTimeout(() => {
        setVisible(true);
        requestAnimationFrame(() => setAnimating(true));
      }, 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('encodex_cookie_consent', 'accepted');
    dismiss();
  };

  const handleDecline = () => {
    localStorage.setItem('encodex_cookie_consent', 'declined');
    dismiss();
  };

  const dismiss = () => {
    setAnimating(false);
    setTimeout(() => setVisible(false), 400);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9990,
        transform: animating ? 'translateY(0)' : 'translateY(100%)',
        opacity: animating ? 1 : 0,
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease',
      }}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.97)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(51, 65, 85, 0.5)',
          padding: '1.25rem 1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: '80rem',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 0', minWidth: '260px' }}>
            <p style={{ color: '#e2e8f0', fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: 500 }}>
              We use cookies to improve your experience
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', lineHeight: '1.5' }}>
              Encodex uses essential cookies to keep you logged in and ensure our services work.
              By continuing, you agree to our{' '}
              <a
                href="/policy#cookies"
                style={{ color: '#fb923c', textDecoration: 'underline', textUnderlineOffset: '2px' }}
              >
                Cookie Policy
              </a>.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
            <button
              onClick={handleDecline}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: '0.5rem',
                border: '1px solid rgba(100, 116, 139, 0.4)',
                background: 'transparent',
                color: '#cbd5e1',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.6)';
                e.currentTarget.style.color = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.4)';
                e.currentTarget.style.color = '#cbd5e1';
              }}
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              style={{
                padding: '0.5rem 1.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: '#f97316',
                color: '#000',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fb923c';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f97316';
              }}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
