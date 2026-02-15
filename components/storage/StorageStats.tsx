'use client';

import StorageCard from './StorageCard';

interface StorageStatsProps {
  used?: number;
  total?: number;
  percentage?: number;
}

const formatBytesAdaptive = (bytes: number): string => {
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;
  // If under 0.1 GB (100 MB), show MB for more granularity per user's request
  if (bytes < 0.1 * GB) {
    return `${(bytes / MB).toFixed(2)} MB`;
  }
  return `${(bytes / GB).toFixed(2)} GB`;
};

export default function StorageStats({
  used = 0,
  total = 21474836480, // 20 GB in bytes
  percentage = 0,
}: StorageStatsProps) {
  const usedPercent = total > 0 ? (used / total) * 100 : 0;

  return (
    <StorageCard className="space-y-4">
      {/* Storage Meter */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-blue-200 font-medium">Storage</span>
          <span className="text-sm font-bold text-white">
            {formatBytesAdaptive(used)} / {formatBytesAdaptive(total)}
          </span>
        </div>
        <div className="w-full bg-blue-800/40 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-gray-400 to-gray-500 h-full transition-all duration-300"
            style={{ width: `${Math.min(usedPercent, 100)}%` }}
          ></div>
        </div>
      </div>
    </StorageCard>
  );
}
