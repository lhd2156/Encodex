import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET!;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a JWT token for a user
 */
export function createToken(userId: string, email: string, name?: string): string {
  return jwt.sign(
    { 
      userId, 
      email,
      name, // Added name to token payload
      sub: userId // Standard JWT claim for subject
    }, 
    JWT_SECRET, 
    { expiresIn: '30d' }
  );
}

/**
 * Verify a JWT token and return the payload
 * Email is always normalized to lowercase for consistent comparisons
 */
export function verifyToken(token: string): { userId: string; email: string; name?: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { 
      userId: string; 
      email: string;
      name?: string;
      sub?: string;
    };
    return {
      userId: decoded.userId || decoded.sub!,
      email: decoded.email?.toLowerCase() || '',
      name: decoded.name
    };
  } catch (error) {
    console.error('❌ [AUTH] Token verification failed:', error);
    return null;
  }
}

/**
 * Extract user info from Authorization header
 * Used in API routes
 */
export async function getUserFromRequest(req: Request): Promise<{ userId: string; email: string; name?: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  return verifyToken(token);
}

/**
 * Extract just the email from a JWT token
 * This is what the API routes use
 * Always returns lowercase email for case-insensitive comparisons
 */
export async function getUserEmailFromToken(token: string): Promise<string | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { 
      email: string;
      userId?: string;
      name?: string;
    };
    // Always return lowercase for case-insensitive comparisons
    return decoded.email?.toLowerCase() || null;
  } catch (error) {
    console.error('❌ [AUTH] Token verification failed:', error);
    return null;
  }
}

/**
 * Extract full user info from a JWT token
 * Alternative to getUserEmailFromToken when you need more info
 * Email is always normalized to lowercase
 */
export async function getUserFromToken(token: string): Promise<{
  email: string;
  userId?: string;
  name?: string;
} | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    return {
      email: decoded.email?.toLowerCase() || '',
      userId: decoded.userId || decoded.sub,
      name: decoded.name,
    };
  } catch (error) {
    console.error('❌ [AUTH] Token verification failed:', error);
    return null;
  }
}