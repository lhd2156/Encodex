// lib/recoveryKey.ts
// Recovery Key Management Utilities

/**
 * Generates a unique recovery key for a user account
 * This should be called ONCE during user registration
 */
export function generateRecoveryKey(): string {
  // Generate 24 random bytes for a strong recovery key
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  
  // Convert to base64-like format (URL-safe characters)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const key = Array.from(array)
    .map(byte => chars[byte % chars.length])
    .join('');
  
  console.log('🔑 Generated new recovery key');
  return key;
}

/**
 * Stores the recovery key for a user
 * Called during registration
 */
export function storeRecoveryKey(userEmail: string, recoveryKey: string): void {
  // ✅ CRITICAL: Always use lowercase email for storage key
  const normalizedEmail = userEmail.toLowerCase();
  const keyStorageKey = `recovery_key_${normalizedEmail}`;
  localStorage.setItem(keyStorageKey, recoveryKey);
  console.log('💾 Stored recovery key for:', normalizedEmail);
}

/**
 * Retrieves the recovery key for a user
 * Returns null if no key exists
 */
export function getRecoveryKey(userEmail: string): string | null {
  // ✅ CRITICAL: Always use lowercase email for lookup
  const normalizedEmail = userEmail.toLowerCase();
  const keyStorageKey = `recovery_key_${normalizedEmail}`;
  
  // Try normalized key first
  let key = localStorage.getItem(keyStorageKey);
  
  // Fallback: try original casing (for backwards compatibility)
  if (!key) {
    const originalKey = `recovery_key_${userEmail}`;
    key = localStorage.getItem(originalKey);
    
    // If found with original casing, migrate to normalized
    if (key) {
      localStorage.setItem(keyStorageKey, key);
      localStorage.removeItem(originalKey);
      console.log('🔄 Migrated recovery key to normalized email:', normalizedEmail);
    }
  }
  
  return key;
}

/**
 * Checks if a user has a recovery key
 */
export function hasRecoveryKey(userEmail: string): boolean {
  return getRecoveryKey(userEmail) !== null;
}

/**
 * Creates a recovery key during registration if one doesn't exist
 * This is the main function to call during user registration
 */
export function ensureRecoveryKeyExists(userEmail: string): string {
  let key = getRecoveryKey(userEmail);
  
  if (!key) {
    key = generateRecoveryKey();
    storeRecoveryKey(userEmail, key);
    console.log('✅ Created recovery key during registration for:', userEmail);
  } else {
    console.log('ℹ️ Recovery key already exists for:', userEmail);
  }
  
  return key;
}

/**
 * Downloads the recovery key as a text file
 */
export function downloadRecoveryKey(userEmail: string, recoveryKey: string): void {
  const content = `ENCODEX RECOVERY KEY
===================

Your recovery key: ${recoveryKey}

IMPORTANT INFORMATION:
- Keep this key in a safe place
- You'll need this key to recover your account if you lose your password
- Never share this key with anyone
- ENCODEX cannot recover your account without this key

Account: ${userEmail}
Generated: ${new Date().toLocaleString()}

===================
ENCODEX - Secure Cloud Storage
`;

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ENCODEX-RECOVERYKEY.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  console.log('📥 Recovery key downloaded for:', userEmail);
}

/**
 * Validates a recovery key format
 */
export function isValidRecoveryKey(key: string): boolean {
  // Check if key matches expected format (24 characters of base64-url-safe chars)
  const validChars = /^[A-Za-z0-9_-]{24,}$/;
  return validChars.test(key);
}

/**
 * Verifies if a provided recovery key matches the stored one
 * Used during account recovery process
 */
export function verifyRecoveryKey(userEmail: string, providedKey: string): boolean {
  const storedKey = getRecoveryKey(userEmail);
  return storedKey === providedKey;
}