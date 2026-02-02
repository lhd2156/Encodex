// lib/crypto.ts

/* ========= Types ========= */

export type EncryptedFileData = {
  encryptedData: ArrayBuffer;
  iv: Uint8Array;
};

export type FileMetadata = {
  mimeType: string;
  originalName: string;
  size: number;
};

/* ========= Salt Management ========= */

/**
 * Get or create a user-specific salt.
 * The salt is stored in localStorage so it persists across sessions.
 */
export function getUserSalt(userEmail: string): Uint8Array {
  const saltKey = `vault_salt_${userEmail}`;
  const storedSalt = localStorage.getItem(saltKey);
  
  if (storedSalt) {
    // Convert hex string back to Uint8Array
    const matches = storedSalt.match(/.{1,2}/g);
    if (matches) {
      return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
    }
  }
  
  // Generate new salt
  const newSalt = crypto.getRandomValues(new Uint8Array(16));
  
  // Store as hex string
  const hexSalt = Array.from(newSalt)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  localStorage.setItem(saltKey, hexSalt);
  
  console.log('🔐 Generated new salt for user:', userEmail);
  return newSalt;
}

/* ========= Key Derivation ========= */

export async function deriveMasterKey(
  password: string,
  salt: BufferSource
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Normalize BufferSource to a plain ArrayBuffer
  const toArrayBuffer = (b: BufferSource): ArrayBuffer => {
    if (ArrayBuffer.isView(b)) {
      const v = b as ArrayBufferView;
      const out = new ArrayBuffer(v.byteLength);
      const src = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      new Uint8Array(out).set(src);
      return out;
    }
    const src = b as ArrayBuffer;
    const out = new ArrayBuffer(src.byteLength);
    new Uint8Array(out).set(new Uint8Array(src));
    return out;
  };

  const saltBuffer = toArrayBuffer(salt);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 250_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

/* ========= File Encryption ========= */

export async function encryptFile(
  file: File
): Promise<EncryptedFileData & { fileKey: CryptoKey }> {
  const fileBuffer = await file.arrayBuffer();

  const fileKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // MUST be extractable for wrapping
    ["encrypt", "decrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.slice() },
    fileKey,
    fileBuffer
  );

  return {
    encryptedData,
    fileKey,
    iv,
  };
}

/* ========= Key Wrapping ========= */

export async function wrapFileKey(
  fileKey: CryptoKey,
  masterKey: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey(
    "raw",
    fileKey,
    masterKey,
    "AES-KW"
  );
}

export async function unwrapFileKey(
  wrappedKey: ArrayBuffer,
  masterKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrappedKey,
    masterKey,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

/* ========= File Decryption ========= */

export async function decryptFile(
  encryptedData: ArrayBuffer,
  fileKey: CryptoKey,
  iv: Uint8Array,
  mimeType: string
): Promise<Blob> {
  const decryptedData = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.slice() },
    fileKey,
    encryptedData
  );

  return new Blob([decryptedData], { type: mimeType });
}

/* ========= Password Validation ========= */

/**
 * Store a hash of the user's password for validation on subsequent logins.
 * This allows us to verify the password without storing it directly.
 */
export async function storePasswordHash(userEmail: string, password: string): Promise<void> {
  const hashKey = `vault_password_hash_${userEmail}`;
  const enc = new TextEncoder();
  const data = enc.encode(password + userEmail); // Add email as salt
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(hashKey, hashHex);
}

/**
 * Verify if a password matches the stored hash.
 */
export async function verifyPassword(userEmail: string, password: string): Promise<boolean> {
  const hashKey = `vault_password_hash_${userEmail}`;
  const storedHash = localStorage.getItem(hashKey);
  
  if (!storedHash) {
    // No hash stored yet, so we can't verify
    return true;
  }
  
  const enc = new TextEncoder();
  const data = enc.encode(password + userEmail);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex === storedHash;
}