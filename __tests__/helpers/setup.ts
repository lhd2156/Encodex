import { webcrypto } from 'node:crypto';
import {
  createJwtToken,
  createToken,
  hashPassword,
  resetAuthMocks,
  verifyPassword,
} from './auth.helper';
import { resetDbMocks } from './db.helper';
import {
  generateRecoveryKey,
  isValidRecoveryKey,
  resetRecoveryMocks,
  storeRecoveryKey,
} from './recovery.helper';

jest.mock('@/lib/auth', () => jest.requireActual('./auth.helper'));
jest.mock('@/lib/db', () => jest.requireActual('./db.helper'));
jest.mock('@/lib/prisma', () => jest.requireActual('./db.helper'));
jest.mock('@/lib/recoveryKey', () => jest.requireActual('./recovery.helper'));

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

if (!global.crypto) {
  Object.defineProperty(global, 'crypto', {
    value: webcrypto,
  });
}

if (!global.atob) {
  global.atob = (input: string) => Buffer.from(input, 'base64').toString('binary');
}

if (!global.btoa) {
  global.btoa = (input: string) => Buffer.from(input, 'binary').toString('base64');
}

beforeEach(() => {
  resetDbMocks();
  resetAuthMocks();
  resetRecoveryMocks();

  createToken.mockImplementation((userId, email, name) =>
    createJwtToken({ userId, email, name }),
  );
  hashPassword.mockImplementation(async (password) => `hashed:${password}`);
  verifyPassword.mockImplementation(async (password, storedHash) => {
    return storedHash === `hashed:${password}` || storedHash === 'stored-hash';
  });
  generateRecoveryKey.mockReturnValue('RECOVERY-KEY-123');
  storeRecoveryKey.mockResolvedValue();
  isValidRecoveryKey.mockImplementation((value) => value.length >= 8);

  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});
