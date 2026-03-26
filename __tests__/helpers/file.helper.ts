import { webcrypto } from 'node:crypto';

export function createByteArray(length = 4, start = 1): number[] {
  return Array.from({ length }, (_, index) => start + index);
}

export function createUploadPayload(
  overrides: Partial<{
    encryptedData: number[];
    iv: number[];
    wrappedKey: number[];
    fileName: string;
    mimeType: string | null;
    size: number;
    parentFolderId: string | null;
    isFolder: boolean;
  }> = {},
) {
  return {
    encryptedData: createByteArray(6, 1),
    iv: createByteArray(12, 10),
    wrappedKey: createByteArray(16, 30),
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    size: 4096,
    parentFolderId: null,
    isFolder: false,
    ...overrides,
  };
}

export async function createEncryptedSharePayload(
  text = 'Encodex shared content',
  mimeType = 'text/plain',
) {
  const key = await webcrypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  const rawKey = await webcrypto.subtle.exportKey('raw', key);

  return {
    encryptedData: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv),
    wrappedKey: [] as number[],
    sharedFileKey: Array.from(new Uint8Array(rawKey)),
    mimeType,
    text,
  };
}
