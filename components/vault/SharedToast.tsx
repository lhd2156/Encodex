'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SHARED_FILES_EVENT, sharedFilesManager } from '@/lib/sharedFilesManager';
import { getSession } from '@/lib/session';

export default function SharedToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const prevCount = useRef<number>(0);

  useEffect(() => {
    const session = getSession();
    const userEmail = session?.userEmail || null;
    if (!userEmail) return;

    // Initialize previous count
    try {
      prevCount.current = sharedFilesManager.getSharedWithMe(userEmail).length;
    } catch (e) {
      prevCount.current = 0;
    }

    const maybeShow = () => {
      try {
        const current = sharedFilesManager.getSharedWithMe(userEmail).length;
        if (current > prevCount.current) {
          setMessage('New shared item received');
          setVisible(true);
          setTimeout(() => setVisible(false), 4000);
        }
        prevCount.current = current;
      } catch (e) {
        // ignore
      }
    };

    const handler = (e: Event) => maybeShow();

    window.addEventListener(SHARED_FILES_EVENT, handler);

    // BroadcastChannel fallback
    let bc: any = null;
    try {
      if ((window as any).BroadcastChannel) {
        bc = new (window as any).BroadcastChannel('shared-files-channel');
        bc.addEventListener('message', (m: MessageEvent) => {
          if (m?.data?.type === SHARED_FILES_EVENT) maybeShow();
        });
      }
    } catch (e) {
      // ignore
    }

    // storage event fallback
    const storageHandler = (e: StorageEvent) => {
      if (e.key === '__shared_files_signal' || e.key === 'shared_files_global') {
        maybeShow();
      }
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      window.removeEventListener(SHARED_FILES_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
      if (bc) {
        bc.close();
      }
    };
  }, []);

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 9999,
        transition: 'transform 300ms ease, opacity 300ms ease',
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div style={{
        background: 'linear-gradient(135deg,#0ea5a4,#06b6d4)',
        color: 'white',
        padding: '10px 14px',
        borderRadius: 10,
        boxShadow: '0 6px 18px rgba(2,6,23,0.4)',
        minWidth: 220,
        display: 'flex',
        gap: 10,
        alignItems: 'center'
      }}>
        <div style={{fontSize:18}}>📥</div>
        <div style={{fontSize:14, lineHeight: '1.1'}}>
          <div style={{fontWeight:600}}>{message}</div>
          <div style={{fontSize:12, opacity:0.9}}>Open Shared to view</div>
        </div>
      </div>
    </div>
  );
}
