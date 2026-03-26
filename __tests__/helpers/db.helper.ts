type MockFn = jest.Mock;

type MockModel = Record<string, MockFn>;

type MockPrisma = {
  user: MockModel;
  file: MockModel;
  share: MockModel;
  shareLink: MockModel;
  hiddenShare: MockModel;
  receiverTrashedShare: MockModel;
  tempDeletedShare: MockModel;
  userFavorite: MockModel;
};

function createMockModel(methodNames: string[]): MockModel {
  return Object.fromEntries(methodNames.map((methodName) => [methodName, jest.fn()]));
}

function createPrismaMock(): MockPrisma {
  return {
    user: createMockModel([
      'findUnique',
      'findFirst',
      'findMany',
      'create',
      'update',
      'delete',
      'deleteMany',
    ]),
    file: createMockModel([
      'findUnique',
      'findFirst',
      'findMany',
      'create',
      'update',
      'updateMany',
      'delete',
      'deleteMany',
    ]),
    share: createMockModel([
      'findUnique',
      'findFirst',
      'findMany',
      'create',
      'updateMany',
      'deleteMany',
    ]),
    shareLink: createMockModel([
      'findUnique',
      'findFirst',
      'findMany',
      'create',
      'update',
      'deleteMany',
    ]),
    hiddenShare: createMockModel([
      'findMany',
      'upsert',
      'deleteMany',
    ]),
    receiverTrashedShare: createMockModel([
      'findMany',
      'findFirst',
      'upsert',
      'createMany',
      'deleteMany',
    ]),
    tempDeletedShare: createMockModel([
      'findMany',
      'findFirst',
      'create',
      'createMany',
      'deleteMany',
    ]),
    userFavorite: createMockModel([
      'findMany',
      'upsert',
      'deleteMany',
    ]),
  };
}

const dbGlobal = globalThis as typeof globalThis & {
  __encodexPrismaMock?: MockPrisma;
};

export const prisma = dbGlobal.__encodexPrismaMock ??= createPrismaMock();

export function resetDbMocks(): void {
  const models = Object.values(prisma);
  for (const model of models) {
    for (const method of Object.values(model)) {
      method.mockReset();
    }
  }
}

export function createUserFixture(
  overrides: Partial<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
    salt: Buffer;
    recoveryKey: string;
  }> = {},
) {
  return {
    id: 'user-1',
    email: 'owner@example.com',
    firstName: 'Owner',
    lastName: 'Example',
    passwordHash: 'stored-hash',
    salt: Buffer.from([1, 2, 3, 4]),
    recoveryKey: 'RECOVERY-KEY-123',
    ...overrides,
  };
}

export function createFileFixture(
  overrides: Partial<{
    id: string;
    userId: string;
    ownerEmail: string;
    ownerName: string | null;
    name: string;
    size: bigint;
    type: 'file' | 'folder';
    mimeType: string | null;
    encryptedData: Buffer;
    iv: Buffer;
    wrappedKey: Buffer;
    parentFolderId: string | null;
    isFolder: boolean;
    isFavorite: boolean;
    isDeleted: boolean;
    deletedAt: Date | null;
    deletedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  }> = {},
) {
  const inferredIsFolder =
    overrides.isFolder ?? (overrides.type === 'folder');

  return {
    id: 'file-1',
    userId: 'user-1',
    ownerEmail: 'owner@example.com',
    ownerName: 'Owner Example',
    name: inferredIsFolder ? 'Projects' : 'report.pdf',
    size: BigInt(inferredIsFolder ? 0 : 1024),
    type: inferredIsFolder ? 'folder' : 'file',
    mimeType: inferredIsFolder ? null : 'application/pdf',
    encryptedData: Buffer.from([1, 2, 3, 4]),
    iv: Buffer.from([5, 6, 7, 8]),
    wrappedKey: Buffer.from([9, 10, 11, 12]),
    parentFolderId: null,
    isFolder: inferredIsFolder,
    isFavorite: false,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    user: {
      firstName: 'Owner',
      lastName: 'Example',
      email: 'owner@example.com',
    },
    ...overrides,
  };
}

export function createShareFixture(
  overrides: Partial<{
    id: string;
    fileId: string;
    fileName: string;
    fileSize: bigint;
    fileType: 'file' | 'folder';
    recipientEmail: string;
    recipientName: string;
    parentFolderId: string | null;
    permissions: 'view' | 'edit';
    sharedAt: Date;
    sharedFileKey: Buffer | null;
    file: ReturnType<typeof createFileFixture>;
  }> = {},
) {
  const file = overrides.file ?? createFileFixture({
    id: overrides.fileId ?? 'file-1',
    name: overrides.fileName ?? 'report.pdf',
    type: overrides.fileType ?? 'file',
    isFolder: (overrides.fileType ?? 'file') === 'folder',
  });

  return {
    id: 'share-1',
    fileId: file.id,
    fileName: file.name,
    fileSize: BigInt(1024),
    fileType: file.type,
    recipientEmail: 'recipient@example.com',
    recipientName: 'Recipient Example',
    parentFolderId: file.parentFolderId,
    permissions: 'view' as const,
    sharedAt: new Date('2026-01-02T00:00:00.000Z'),
    sharedFileKey: Buffer.from([13, 14, 15]),
    file,
    ...overrides,
  };
}

export function createShareLinkFixture(
  overrides: Partial<{
    id: string;
    fileId: string;
    token: string;
    createdByEmail: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
    sharedFileKey: Buffer | null;
    file: ReturnType<typeof createFileFixture>;
  }> = {},
) {
  const file = overrides.file ?? createFileFixture({
    id: overrides.fileId ?? 'file-1',
    isFolder: false,
  });

  return {
    id: 'link-1',
    fileId: file.id,
    token: 'share-token-123',
    createdByEmail: 'owner@example.com',
    expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    revokedAt: null,
    createdAt: new Date('2026-01-03T00:00:00.000Z'),
    sharedFileKey: Buffer.from([21, 22, 23]),
    file,
    ...overrides,
  };
}

export function bytesToBuffer(bytes: number[]): Buffer {
  return Buffer.from(bytes);
}
