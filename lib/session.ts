// lib/session.ts
// Session management utilities with API integration

export interface Session {
  userEmail: string;
  firstName: string;
  lastName: string;
  sessionToken: string;
  createdAt: number;
  expiresAt: number;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  salt?: number[];
  message?: string;
  error?: string;
}

const SESSION_KEY = 'user_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const REMEMBER_ME_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ========= API Functions ========= */

export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<AuthResponse> {
  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Registration failed' };
    }

    return { success: true, ...data };
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthResponse> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Login failed' };
    }

    return { success: true, ...data };
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}

export function storeAuthData(token: string, user: any, salt?: number[]) {
  sessionStorage.setItem('auth_token', token);
  localStorage.setItem('user', JSON.stringify(user));
  if (salt) {
    localStorage.setItem('encryption_salt', JSON.stringify(salt));
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('auth_token');
}

export function getStoredUser(): any {
  if (typeof window === 'undefined') return null;
  const userData = localStorage.getItem('user');
  return userData ? JSON.parse(userData) : null;
}

export function clearAuthData() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('auth_token');
  localStorage.removeItem('user');
  // Keep encryption_salt and vault data
}

/* ========= Session Functions (Legacy Support) ========= */

export function createSession(
  email: string,
  firstName: string,
  lastName: string,
  rememberMe: boolean = false
): Session {
  const now = Date.now();
  const duration = rememberMe ? REMEMBER_ME_DURATION : SESSION_DURATION;
  const session: Session = {
    userEmail: email.toLowerCase(), // Always normalize email to lowercase
    firstName,
    lastName,
    sessionToken:
      Math.random().toString(36).substr(2) +
      Math.random().toString(36).substr(2),
    createdAt: now,
    expiresAt: now + duration,
  };

  if (typeof window !== 'undefined') {
    // Clear ALL old session data first to prevent contamination
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('session');
    sessionStorage.removeItem('session');
    
    // Now set the new session
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    
    if (rememberMe) {
      localStorage.setItem('session', JSON.stringify(session));
    } else {
      sessionStorage.setItem('session', JSON.stringify(session));
    }
  }

  return session;
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;

  const sessionData =
    localStorage.getItem(SESSION_KEY) ||
    sessionStorage.getItem('session') || 
    localStorage.getItem('session');
  if (!sessionData) return null;

  try {
    const session = JSON.parse(sessionData) as Session;

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
    
    if (sessionStorage.getItem('session')) {
      sessionStorage.setItem('session', JSON.stringify(session));
    }
    if (localStorage.getItem('session')) {
      localStorage.setItem('session', JSON.stringify(session));
    }
  }
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('session');
    sessionStorage.removeItem('session');
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('sessionEmail');
    // Also clear auth token and user data on sign out
    sessionStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }
}

export function isSessionValid(): boolean {
  const session = getSession();
  if (!session) return false;
  
  if (session.expiresAt) {
    return Date.now() < session.expiresAt;
  }
  
  const now = Date.now();
  const sessionAge = now - session.createdAt;
  return sessionAge < SESSION_DURATION;
}

export function isAuthenticated(): boolean {
  const token = getAuthToken();
  const session = getSession();
  return !!(token && session && isSessionValid());
}