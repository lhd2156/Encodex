import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

export type MockAuthUser = {
  userId: string;
  email: string;
  name?: string;
};

type SharedAuthMocks = {
  getUserFromRequest: jest.Mock<Promise<MockAuthUser | null>, [Request]>;
  getUserEmailFromToken: jest.Mock<Promise<string | null>, [string]>;
  hashPassword: jest.Mock<Promise<string>, [string]>;
  verifyPassword: jest.Mock<Promise<boolean>, [string, string]>;
  createToken: jest.Mock<string, [string, string, string?]>;
};

const DEFAULT_SECRET = 'test-secret';
const authGlobal = globalThis as typeof globalThis & {
  __encodexAuthMocks?: SharedAuthMocks;
};

function createAuthMocks(): SharedAuthMocks {
  return {
    getUserFromRequest: jest.fn<Promise<MockAuthUser | null>, [Request]>(),
    getUserEmailFromToken: jest.fn<Promise<string | null>, [string]>(),
    hashPassword: jest.fn<Promise<string>, [string]>(),
    verifyPassword: jest.fn<Promise<boolean>, [string, string]>(),
    createToken: jest.fn<string, [string, string, string?]>(),
  };
}

const sharedAuthMocks = authGlobal.__encodexAuthMocks ??= createAuthMocks();

export const getUserFromRequest = sharedAuthMocks.getUserFromRequest;
export const getUserEmailFromToken = sharedAuthMocks.getUserEmailFromToken;
export const hashPassword = sharedAuthMocks.hashPassword;
export const verifyPassword = sharedAuthMocks.verifyPassword;
export const createToken = sharedAuthMocks.createToken;

export function resetAuthMocks(): void {
  getUserFromRequest.mockReset();
  getUserEmailFromToken.mockReset();
  hashPassword.mockReset();
  verifyPassword.mockReset();
  createToken.mockReset();
}

export function createAuthUser(overrides: Partial<MockAuthUser> = {}): MockAuthUser {
  return {
    userId: 'user-1',
    email: 'owner@example.com',
    name: 'Owner Example',
    ...overrides,
  };
}

export function mockAuthenticatedUser(overrides: Partial<MockAuthUser> = {}): MockAuthUser {
  const user = createAuthUser(overrides);
  getUserFromRequest.mockResolvedValue(user);
  return user;
}

export function mockAuthenticatedEmail(email = 'owner@example.com'): string {
  getUserEmailFromToken.mockResolvedValue(email);
  return email;
}

export function createJwtToken(
  overrides: Partial<{ userId: string; email: string; name?: string }> = {},
): string {
  const payload = {
    userId: 'user-1',
    email: 'owner@example.com',
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET ?? DEFAULT_SECRET, {
    expiresIn: '30d',
  });
}

export function createDecodedToken(
  overrides: Partial<{ userId: string; email: string; name?: string }> = {},
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(
    JSON.stringify({
      userId: 'user-1',
      email: 'owner@example.com',
      ...overrides,
    }),
  ).toString('base64');

  return `${header}.${payload}.signature`;
}

export function createAuthHeaders(token = 'test-token'): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function createJsonRequest(url: string, init: RequestInit = {}): NextRequest {
  const headers = new Headers(init.headers ?? {});
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return new NextRequest(
    new Request(url, {
      ...init,
      headers,
    }),
  );
}
