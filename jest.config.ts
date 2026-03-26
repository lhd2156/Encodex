import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/__tests__/helpers/setup.ts'],
  testMatch: ['<rootDir>/__tests__/api/**/*.test.ts'],
  moduleNameMapper: {
    '^@/lib/db$': '<rootDir>/__tests__/helpers/db.helper.ts',
    '^@/lib/prisma$': '<rootDir>/__tests__/helpers/db.helper.ts',
    '^@/lib/auth$': '<rootDir>/__tests__/helpers/auth.helper.ts',
    '^@/lib/recoveryKey$': '<rootDir>/__tests__/helpers/recovery.helper.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: ['app/api/**/*.ts'],
  clearMocks: false,
};

export default createJestConfig(config);
