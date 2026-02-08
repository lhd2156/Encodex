// lib/recoveryKey.ts
// Recovery Key Management Utilities

import { prisma } from '@/lib/db';
import crypto from 'crypto';

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
  
  return key;
}

/**
 * Hash the recovery key before storing in database
 */
async function hashRecoveryKey(recoveryKey: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(recoveryKey).digest('hex');
  return hash;
}

/**
 * Stores BOTH the recovery key AND its hash
 * Called during registration
 */
export async function storeRecoveryKey(userEmail: string, recoveryKey: string): Promise<void> {
  const normalizedEmail = userEmail.toLowerCase();
  const hashedKey = await hashRecoveryKey(recoveryKey);
  
  await prisma.user.update({
    where: { email: normalizedEmail },
    data: {
      recoveryKeyHash: hashedKey,
      recoveryKey: recoveryKey  // Store the actual key too!
    }
  });
}

/**
 * Gets the RAW recovery key for a user
 * Returns null if no key exists
 */
export async function getRecoveryKey(userEmail: string): Promise<string | null> {
  const normalizedEmail = userEmail.toLowerCase();
  
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { recoveryKey: true }
  });
  
  return user?.recoveryKey || null;
}

/**
 * Retrieves the recovery key hash for a user
 * Returns null if no key exists
 */
export async function getRecoveryKeyHash(userEmail: string): Promise<string | null> {
  const normalizedEmail = userEmail.toLowerCase();
  
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { recoveryKeyHash: true }
  });
  
  return user?.recoveryKeyHash || null;
}

/**
 * Checks if a user has a recovery key
 */
export async function hasRecoveryKey(userEmail: string): Promise<boolean> {
  const key = await getRecoveryKey(userEmail);
  return key !== null;
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
 * Verifies if a provided recovery key matches the stored hash
 * Used during account recovery process
 */
export async function verifyRecoveryKey(userEmail: string, providedKey: string): Promise<boolean> {
  const normalizedEmail = userEmail.toLowerCase();
  
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { recoveryKeyHash: true }
  });

  if (!user || !user.recoveryKeyHash) {
    return false;
  }

  const hashedProvidedKey = await hashRecoveryKey(providedKey);
  return hashedProvidedKey === user.recoveryKeyHash;
}