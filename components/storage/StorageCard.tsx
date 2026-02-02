'use client';

import { ReactNode } from 'react';

interface StorageCardProps {
  children: ReactNode;
  className?: string;
}

export default function StorageCard({ children, className = '' }: StorageCardProps) {
  return (
    <div className={`rounded-xl bg-gradient-to-br from-blue-900/30 to-blue-800/20 backdrop-blur-sm border border-blue-700/30 p-8 ${className}`}>
      {children}
    </div>
  );
}
