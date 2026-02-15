'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { decryptFileData, importFileKey } from '@/lib/crypto';

type ShareLinkAccessPayload = {
  success: boolean;
  fileName: string;
  mimeType?: string | null;
  encryptedData: number[];
  iv: number[];
  sharedFileKey: number[] | null;
  expiresAt: string;
  error?: string;
};

export default function ShareLinkPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [mimeType, setMimeType] = React.useState('application/octet-stream');
  const [expiresAt, setExpiresAt] = React.useState('');
  const [fileUrl, setFileUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    const loadFile = async () => {
      if (!token) {
        setError('Invalid share link.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/share-links/access/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });

        const data: ShareLinkAccessPayload = await response.json();
        if (!response.ok || !data.success) {
          setError(data.error || 'Share link is unavailable.');
          setLoading(false);
          return;
        }

        if (!Array.isArray(data.sharedFileKey) || data.sharedFileKey.length === 0) {
          setError('This link cannot be decrypted. Ask the owner to create a new temporary link.');
          setLoading(false);
          return;
        }

        const fileKey = await importFileKey(new Uint8Array(data.sharedFileKey).buffer);
        const blob = await decryptFileData(
          new Uint8Array(data.encryptedData).buffer,
          fileKey,
          new Uint8Array(data.iv),
          data.mimeType || 'application/octet-stream'
        );

        createdUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(createdUrl);
          return;
        }

        setFileUrl(createdUrl);
        setFileName(data.fileName || 'shared-file');
        setMimeType(data.mimeType || 'application/octet-stream');
        setExpiresAt(data.expiresAt);
      } catch {
        setError('Failed to open this shared file.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadFile();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [token]);

  const handleDownload = () => {
    if (!fileUrl) return;
    const anchor = document.createElement('a');
    anchor.href = fileUrl;
    anchor.download = fileName || 'shared-file';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const isImage = !!mimeType && mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white px-4 py-10">
      <div className="max-w-4xl mx-auto bg-slate-900/70 border border-slate-700/50 rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-2">Shared file</h1>
        {loading && <p className="text-gray-300">Preparing file...</p>}
        {!loading && error && <p className="text-red-300">{error}</p>}

        {!loading && !error && fileUrl && (
          <>
            <p className="text-gray-300 mb-1 break-all">{fileName}</p>
            <p className="text-xs text-gray-400 mb-4">
              Link expires: {new Date(expiresAt).toLocaleString()}
            </p>
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleDownload}
                className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
              >
                Download
              </button>
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors"
              >
                Open
              </a>
            </div>

            {isImage && (
              <img src={fileUrl} alt={fileName} className="max-h-[65vh] rounded-lg border border-slate-700/50" />
            )}

            {isPdf && (
              <iframe
                src={fileUrl}
                title={fileName}
                className="w-full h-[70vh] rounded-lg border border-slate-700/50 bg-white"
              />
            )}

            {!isImage && !isPdf && (
              <p className="text-sm text-gray-400">Preview is not available for this file type. Use Download or Open.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
