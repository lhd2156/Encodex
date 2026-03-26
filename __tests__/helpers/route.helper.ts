export async function loadApiModule<T>(modulePath: string): Promise<T> {
  jest.resetModules();

  jest.doMock('@/lib/auth', () => require('./auth.helper'));
  jest.doMock('@/lib/db', () => require('./db.helper'));
  jest.doMock('@/lib/prisma', () => require('./db.helper'));
  jest.doMock('@/lib/recoveryKey', () => require('./recovery.helper'));
  jest.doMock('@prisma/client', () => {
    const { prisma } = require('./db.helper');

    return {
      PrismaClient: jest.fn(() => prisma),
    };
  });

  return import(modulePath) as Promise<T>;
}
