// Session management utilities

export interface Session {
  userEmail: string;
  firstName: string;
  lastName: string;
  sessionToken: string;
  createdAt: number;
  expiresAt: number;
}

const SESSION_KEY = 'user_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const REMEMBER_ME_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

// Keys that must NEVER be wiped on logout — they hold the user's vault data.
// Clearing these would silently destroy uploaded files and trash.
const VAULT_KEY_PREFIXES = [
  'vault_',          // file metadata list
  'trash_',          // deleted files
  'storage_',        // storage-used counter
  'vault_salt_',     // encryption salt (needed to re-derive the master key)
  'vault_password_hash_', // password verification hash
];

function isVaultKey(key: string): boolean {
  return VAULT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function createSession(
  email: string,
  firstName: string,
  lastName: string,
  rememberMe: boolean = false
): Session {
  const now = Date.now();
  const duration = rememberMe ? REMEMBER_ME_DURATION : SESSION_DURATION;
  const session: Session = {
    userEmail: email,
    firstName,
    lastName,
    sessionToken:
      Math.random().toString(36).substr(2) +
      Math.random().toString(36).substr(2),
    createdAt: now,
    expiresAt: now + duration,
  };

  if (typeof window !== 'undefined') {
    // Store in both locations for compatibility
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    
    if (rememberMe) {
      localStorage.setItem('session', JSON.stringify(session));
    } else {
      sessionStorage.setItem('session', JSON.stringify(session));
    }
  }

  // Try to restore any backed-up vault data for this user if present.
  try {
    if (typeof window !== 'undefined') {
      const backupKey = `vault_backup_${email}`;
      const backupRaw = localStorage.getItem(backupKey);
      if (backupRaw) {
        console.debug('session: found backup raw length', backupRaw.length, 'for', backupKey);
        const backup = JSON.parse(backupRaw) as Record<string, string | null>;
        Object.keys(backup).forEach((key) => {
          try {
            const exists = localStorage.getItem(key);
            const backupVal = backup[key];
            const backupLen = backupVal?.length ?? 0;
            console.debug('session: restore candidate', key, 'exists?', exists != null, 'backupLen', backupLen);

            // Determine whether to overwrite existing value:
            // - If key missing, restore.
            // - If existing value is an empty array/object placeholder (e.g. '[]' or '{}' or length < 4), prefer backup.
            let shouldRestore = false;
            if (exists == null) {
              shouldRestore = true;
            } else {
              // check for JSON placeholders
              try {
                const parsed = JSON.parse(exists);
                if ((Array.isArray(parsed) && parsed.length === 0) || (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0)) {
                  shouldRestore = true;
                }
              } catch (e) {
                // not JSON or parse failed; if stored value is very short, consider it placeholder
                if ((exists || '').length < 4) {
                  shouldRestore = true;
                }
              }
            }

            if (shouldRestore && backupVal !== null) {
              localStorage.setItem(key, backupVal as string);
              console.log('🔁 Restored vault key from backup (overwrite?:', exists != null, ')', key, 'len', backupLen);
              try { console.log('🔁 [RESTORE] Key preview (first 200 chars):', (backupVal as string).slice(0,200)); } catch(e){}
            } else {
              console.debug('session: skipping restore for', key, 'shouldRestore', shouldRestore);
            }
          } catch (e) {
            console.warn('session: failed restoring key', key, e);
          }
        });
        // Remove the backup after attempting restore
        localStorage.removeItem(backupKey);
        console.debug('session: removed backup', backupKey);
      } else {
        console.debug('session: no backup found for', backupKey);
      }
    }
  } catch (err) {
    console.error('Failed to restore vault backup:', err);
  }

  // If the user's vault metadata is still empty (e.g. '[]'), attempt a best-effort
  // reconstruction from IndexedDB blobs. This runs async and won't block session creation.
  if (typeof window !== 'undefined') {
    (async () => {
      try {
        const vaultKey = `vault_${email}`;
        const vRaw = localStorage.getItem(vaultKey);
        let isEmpty = false;
        if (!vRaw) isEmpty = true;
        else {
          try {
                const trashKeyCheck = `trash_${email}`;
                const trashRawCheck = localStorage.getItem(trashKeyCheck);
                if (trashRawCheck && trashRawCheck.length > 2) {
                  console.log('🔧 [SESSION] Skipping IndexedDB migration because trash is not empty for', email);
                  return; // Skip migration if trash is not empty
                }
            const parsed = JSON.parse(vRaw);
            if (Array.isArray(parsed) && parsed.length === 0) isEmpty = true;
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0) isEmpty = true;
          } catch (e) {
            if ((vRaw || '').length < 4) isEmpty = true;
          }
        }

        if (isEmpty) {
          // Lazy-import fileStorage to avoid circular imports at module-eval time
          try {
            const { fileStorage } = await import('@/components/pdf/fileStorage');
            const keys = await fileStorage.getAllKeys();
            if (keys && keys.length > 0) {
              // Safer migration: Only reconstruct vault metadata from IndexedDB
              // when keys clearly belong to this user. Blind migration risks
              // exposing other users' files when multiple accounts share the same
              // browser/profile. We only proceed if at least one key contains
              // the user's email as a substring (this covers keys created with
              // explicit owner info). Otherwise we skip and log guidance.
              const ownerLike = keys.filter(k => k.includes(email));
              if (ownerLike.length === 0) {
                console.warn('⚠️ [SESSION] IndexedDB contains blobs but none appear to belong to', email, '- skipping automatic migration to avoid cross-account leakage.');
                console.debug('⚠️ [SESSION] Found keys:', keys.slice(0, 10));
              } else {
                const items: any[] = [];
                let total = 0;
                for (const k of ownerLike) {
                  try {
                    const blob = await fileStorage.getFile(k);
                    if (!blob) continue;
                    const name = (blob as any).name || k;
                    const size = (blob as any).size || 0;
                    items.push({
                      id: k,
                      name,
                      size,
                      type: 'file',
                      createdAt: new Date().toISOString(),
                      parentFolderId: null,
                      owner: email,
                    });
                    total += size;
                  } catch (e) {
                    console.warn('session migration: failed reading blob for', k, e);
                  }
                }

                if (items.length > 0) {
                  localStorage.setItem(vaultKey, JSON.stringify(items));
                  localStorage.setItem(`storage_${email}`, String(total));
                  console.log('🔧 Session migration: rebuilt vault metadata from IndexedDB files for', email, 'files:', items.length);
                } else {
                  console.debug('session migration: no owner-matching blobs found to rebuild vault for', email);
                }
              }
            }
          } catch (e) {
            console.warn('session: migration from IndexedDB failed', e);
          }
        }
      } catch (e) {
        console.error('session: async migration error', e);
      }
    })();
  }

  return session;
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;

  // Try both storage locations
  const sessionData =
    localStorage.getItem(SESSION_KEY) ||
    sessionStorage.getItem('session') || 
    localStorage.getItem('session');
  if (!sessionData) return null;

  try {
    const session = JSON.parse(sessionData) as Session;

    // Check expiration if expiresAt exists
    if (session.expiresAt && Date.now() > session.expiresAt) {
      clearSession();
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function updateSession(userEmail: string, firstName: string, lastName: string): void {
  const existingSession = getSession();
  const now = Date.now();
  
  const session: Session = {
    userEmail,
    firstName,
    lastName,
    sessionToken: existingSession?.sessionToken || 
      Math.random().toString(36).substr(2) +
      Math.random().toString(36).substr(2),
    createdAt: existingSession?.createdAt || now,
    expiresAt: existingSession?.expiresAt || now + SESSION_DURATION,
  };
  
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    
    // Update in other location if it exists there
    if (sessionStorage.getItem('session')) {
      sessionStorage.setItem('session', JSON.stringify(session));
    }
    if (localStorage.getItem('session')) {
      localStorage.setItem('session', JSON.stringify(session));
    }
  }
}

/**
 * Clears the auth session only.
 * Vault data (files, trash, salt, password hash) is intentionally preserved
 * so it survives logout → login cycles.
 */
export function clearSession(): void {
  if (typeof window !== 'undefined') {
    try {
      // Before removing the session, back up any vault-related keys so
      // they can be restored if something accidentally wipes them.
      const sessionData = 
        localStorage.getItem(SESSION_KEY) ||
        sessionStorage.getItem('session') || 
        localStorage.getItem('session');
      if (sessionData) {
        try {
          const ses = JSON.parse(sessionData) as Session;
          const email = ses.userEmail;
          const backupKey = `vault_backup_${email}`;
          const backup: Record<string, string | null> = {};

          const prefixes = VAULT_KEY_PREFIXES;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (prefixes.some((p) => key.startsWith(p))) {
              const val = localStorage.getItem(key);
              backup[key] = val;
              try {
                const len = val ? val.length : 0;
                console.log(`🔒 [BACKUP] Key: ${key} len:${len}`);
              } catch (e) {
                console.log('🔒 [BACKUP] Key:', key);
              }
            }
          }

          if (Object.keys(backup).length > 0) {
            localStorage.setItem(backupKey, JSON.stringify(backup));
            console.log('🔒 Backed up vault keys to', backupKey);
          }
        } catch (e) {
          console.warn('Could not back up vault keys before clearing session', e);
        }
      }

      // Only remove session-related keys; leave vault data untouched.
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('session');
      sessionStorage.removeItem('session');
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('sessionEmail');
    } catch (error) {
      console.error('Error during clearSession backup/cleanup:', error);
    }
  }
}

export function isSessionValid(): boolean {
  const session = getSession();
  if (!session) return false;
  
  // If expiresAt exists, use it
  if (session.expiresAt) {
    return Date.now() < session.expiresAt;
  }
  
  // Fallback to checking age if only createdAt exists
  const now = Date.now();
  const sessionAge = now - session.createdAt;
  return sessionAge < SESSION_DURATION;
}