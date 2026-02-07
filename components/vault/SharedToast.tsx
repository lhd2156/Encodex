'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SHARED_FILES_EVENT, sharedFilesManager } from '@/lib/sharedFilesManager';
import { getSession } from '@/lib/session';

export default function SharedToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const prevCount = useRef<number>(0);
  const isMounted = useRef(true);
  const isInitialized = useRef(false); // ✅ Prevent false positives during init

  useEffect(() => {
    isMounted.current = true;
    isInitialized.current = false;
    const session = getSession();
    const userEmail = session?.userEmail || null;
    if (!userEmail) return;

    // Initialize previous count with async call
    const initCount = async () => {
      try {
        const shares = await sharedFilesManager.getSharedWithMeAsync(userEmail);
        if (isMounted.current) {
          prevCount.current = shares.length;
          isInitialized.current = true; // ✅ Mark as initialized
        }
      } catch (e) {
        prevCount.current = 0;
        isInitialized.current = true;
      }
    };
    initCount();

    const maybeShow = async () => {
      // ✅ Don't show toast until we've initialized the previous count
      if (!isInitialized.current) return;
      
      try {
        const shares = await sharedFilesManager.getSharedWithMeAsync(userEmail);
        if (!isMounted.current) return;
        
        const current = shares.length;
        if (current > prevCount.current) {
          setMessage('New shared item received');
          setVisible(true);
          setTimeout(() => {
            if (isMounted.current) setVisible(false);
          }, 4000);
        }
        prevCount.current = current;
      } catch (e) {
        // ignore
      }
    };

    const handler = () => maybeShow();

    window.addEventListener(SHARED_FILES_EVENT, handler);

    return () => {
      isMounted.current = false;
      window.removeEventListener(SHARED_FILES_EVENT, handler);
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
