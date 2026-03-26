import { Page, Route } from '@playwright/test';
import { webcrypto } from 'node:crypto';

export type UserRecord = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  recoveryKey: string;
  salt: number[];
};

export type FileRecord = {
  id: string;
  userId: string;
  ownerEmail: string;
  ownerName: string;
  name: string;
  size: number;
  type: 'file' | 'folder';
  mimeType: string | null;
  encryptedData: number[];
  iv: number[];
  wrappedKey: number[];
  parentFolderId: string | null;
  isFolder: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShareRecord = {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: 'file' | 'folder';
  recipientEmail: string;
  recipientName: string;
  parentFolderId: string | null;
  permissions: 'view' | 'edit';
  sharedAt: string;
  sharedFileKey: number[] | null;
};

export type ShareLinkRecord = {
  id: string;
  fileId: string;
  token: string;
  createdByEmail: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  sharedFileKey: number[] | null;
};

export type AppState = {
  users: UserRecord[];
  files: FileRecord[];
  shares: ShareRecord[];
  shareLinks: ShareLinkRecord[];
  hiddenShares: Array<{ shareId: string; fileId: string; recipientEmail: string; hiddenAt: string }>;
  receiverTrashedShares: Array<{ shareId: string; fileId: string; recipientEmail: string; trashedAt: string; isDeleted: boolean }>;
  tempDeletedShares: Array<{ id: string; fileId: string; recipientEmail: string; deletedByOwnerAt: string }>;
  favorites: Array<{ fileId: string; userEmail: string }>;
};

const nowIso = () => new Date('2026-03-26T12:00:00.000Z').toISOString();

export function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-1',
    email: 'owner@example.com',
    firstName: 'Owner',
    lastName: 'Example',
    password: 'password123',
    recoveryKey: 'RECOVERY-KEY-123',
    salt: Array.from({ length: 16 }, (_, index) => index + 1),
    ...overrides,
  };
}

export function createFile(overrides: Partial<FileRecord> = {}): FileRecord {
  const isFolder = overrides.isFolder ?? overrides.type === 'folder' ?? false;
  return {
    id: 'file-1',
    userId: 'user-1',
    ownerEmail: 'owner@example.com',
    ownerName: 'Owner Example',
    name: isFolder ? 'Projects' : 'report.txt',
    size: isFolder ? 0 : 11,
    type: isFolder ? 'folder' : 'file',
    mimeType: isFolder ? null : 'text/plain',
    encryptedData: isFolder ? [] : Array.from(Buffer.from('hello world')),
    iv: [],
    wrappedKey: [],
    parentFolderId: null,
    isFolder,
    isDeleted: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

export function createShare(overrides: Partial<ShareRecord> = {}): ShareRecord {
  return {
    id: 'share-1',
    fileId: 'file-1',
    fileName: 'report.txt',
    fileSize: 11,
    fileType: 'file',
    recipientEmail: 'recipient@example.com',
    recipientName: 'Recipient Example',
    parentFolderId: null,
    permissions: 'view',
    sharedAt: nowIso(),
    sharedFileKey: null,
    ...overrides,
  };
}

export function createShareLink(overrides: Partial<ShareLinkRecord> = {}): ShareLinkRecord {
  return {
    id: 'link-1',
    fileId: 'file-1',
    token: 'share-token-123',
    createdByEmail: 'owner@example.com',
    expiresAt: '2099-01-01T00:00:00.000Z',
    revokedAt: null,
    createdAt: nowIso(),
    sharedFileKey: null,
    ...overrides,
  };
}

export function createAppState(overrides: Partial<AppState> = {}): AppState {
  const owner = createUser();
  const recipient = createUser({
    id: 'user-2',
    email: 'recipient@example.com',
    firstName: 'Recipient',
    lastName: 'Example',
    recoveryKey: 'RECOVERY-KEY-456',
    salt: Array.from({ length: 16 }, (_, index) => 32 - index),
  });

  return {
    users: [owner, recipient],
    files: [createFile()],
    shares: [],
    shareLinks: [],
    hiddenShares: [],
    receiverTrashedShares: [],
    tempDeletedShares: [],
    favorites: [],
    ...overrides,
  };
}

export function buildToken(email: string): string {
  return `token:${encodeURIComponent(email.toLowerCase())}`;
}

function getAuthedEmail(route: Route): string | null {
  const header = route.request().headers().authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  if (!token.startsWith('token:')) return null;
  return decodeURIComponent(token.slice(6));
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function parseBody(route: Route): any {
  const raw = route.request().postData();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function findUser(state: AppState, email: string | null) {
  if (!email) return null;
  return state.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

function findFile(state: AppState, fileId: string) {
  return state.files.find((file) => file.id === fileId) ?? null;
}

function serializeFile(file: FileRecord) {
  return {
    id: file.id,
    name: file.name,
    size: String(file.size),
    type: file.type,
    mimeType: file.mimeType,
    parentFolderId: file.parentFolderId,
    isFolder: file.isFolder,
    isFavorite: false,
    owner: file.ownerEmail,
    ownerEmail: file.ownerEmail,
    ownerName: file.ownerName,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

function shareToApi(state: AppState, share: ShareRecord) {
  const file = findFile(state, share.fileId);
  return {
    ...share,
    fileSize: String(share.fileSize),
    file: file
      ? {
          id: file.id,
          name: file.name,
          size: String(file.size),
          type: file.type,
          createdAt: file.createdAt,
          parentFolderId: file.parentFolderId,
          ownerEmail: file.ownerEmail,
          ownerName: file.ownerName,
        }
      : {
          id: share.fileId,
          name: share.fileName,
          size: String(share.fileSize),
          type: share.fileType,
          createdAt: nowIso(),
          parentFolderId: share.parentFolderId,
          ownerEmail: '',
          ownerName: '',
        },
  };
}

function makeUniqueName(state: AppState, ownerEmail: string, baseName: string, parentFolderId: string | null) {
  const existing = state.files.filter(
    (file) =>
      file.ownerEmail.toLowerCase() === ownerEmail.toLowerCase() &&
      file.parentFolderId === parentFolderId &&
      !file.isDeleted,
  );
  if (!existing.some((file) => file.name === baseName)) {
    return baseName;
  }

  const dotIndex = baseName.lastIndexOf('.');
  const hasExtension = dotIndex > 0;
  const stem = hasExtension ? baseName.slice(0, dotIndex) : baseName;
  const extension = hasExtension ? baseName.slice(dotIndex) : '';

  let counter = 1;
  while (existing.some((file) => file.name === `${stem} (${counter})${extension}`)) {
    counter += 1;
  }
  return `${stem} (${counter})${extension}`;
}

export async function computePasswordHash(email: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(password + email.toLowerCase());
  const digest = await webcrypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function seedAuthenticatedPage(
  page: Page,
  user: UserRecord,
  password = user.password,
) {
  const token = buildToken(user.email);
  const saltHex = user.salt.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const passwordHash = await computePasswordHash(user.email, password);
  const session = {
    userEmail: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    sessionToken: 'session-token',
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  const publicUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };

  await page.addInitScript(
    ({ authToken, hash, salt, sessionValue, userValue }) => {
      sessionStorage.setItem('auth_token', authToken);
      localStorage.setItem('user_session', JSON.stringify(sessionValue));
      localStorage.setItem('user', JSON.stringify(userValue));
      localStorage.setItem(`vault_salt_${userValue.email}`, salt);
      localStorage.setItem(`vault_password_hash_${userValue.email}`, hash);
    },
    {
      authToken: token,
      hash: passwordHash,
      salt: saltHex,
      sessionValue: session,
      userValue: publicUser,
    },
  );
}

export async function unlockVault(page: Page, password = 'password123') {
  const modal = page.getByText('Unlock Your Vault');
  if (await modal.isVisible().catch(() => false)) {
    await page.getByPlaceholder('Enter your password').fill(password);
    await page.getByRole('button', { name: 'Unlock Vault' }).click();
    await modal.waitFor({ state: 'hidden' });
  }
}

export function captureDialogs(page: Page) {
  const messages: string[] = [];
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message());
    await dialog.accept();
  });
  return messages;
}

export async function installAppMocks(page: Page, state: AppState) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const authEmail = getAuthedEmail(route);

    if (path === '/api/auth/signup' && method === 'POST') {
      const body = parseBody(route);
      const existing = findUser(state, body.email);
      if (existing) return json(route, 409, { error: 'User already exists' });
      const user: UserRecord = createUser({
        id: `user-${state.users.length + 1}`,
        email: body.email.toLowerCase(),
        firstName: body.firstName,
        lastName: body.lastName,
        password: body.password,
        recoveryKey: `RECOVERY-${state.users.length + 1}-KEY`,
        salt: Array.from({ length: 16 }, (_, index) => index + state.users.length + 1),
      });
      state.users.push(user);
      return json(route, 200, {
        success: true,
        token: buildToken(user.email),
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        salt: user.salt,
        recoveryKey: user.recoveryKey,
      });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = parseBody(route);
      const user = findUser(state, body.email);
      if (!user || user.password !== body.password) {
        return json(route, 401, { error: 'Invalid credentials' });
      }
      return json(route, 200, {
        success: true,
        token: buildToken(user.email),
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        salt: user.salt,
        recoveryKey: user.recoveryKey,
      });
    }

    if (path === '/api/auth/reset-password' && method === 'POST') {
      const body = parseBody(route);
      const user = findUser(state, body.email);
      if (!user) return json(route, 404, { error: 'User not found' });
      user.password = body.newPassword;
      return json(route, 200, { success: true });
    }

    if (path === '/api/auth/profile' && method === 'GET') {
      const user = findUser(state, authEmail);
      if (!user) return json(route, 401, { error: 'Unauthorized' });
      return json(route, 200, {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    }

    if (path === '/api/auth/profile' && method === 'PATCH') {
      const user = findUser(state, authEmail);
      const body = parseBody(route);
      if (!user) return json(route, 401, { error: 'Unauthorized' });
      user.firstName = body.firstName ?? user.firstName;
      user.lastName = body.lastName ?? user.lastName;
      return json(route, 200, {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    }

    if (path === '/api/auth/recovery-key' && method === 'GET') {
      const user = findUser(state, authEmail);
      if (!user) return json(route, 401, { error: 'Unauthorized' });
      return json(route, 200, { success: true, recoveryKey: user.recoveryKey });
    }

    if (path === '/api/auth/delete-account' && method === 'DELETE') {
      const user = findUser(state, authEmail);
      if (!user) return json(route, 401, { error: 'Not authenticated' });
      state.files = state.files.filter((file) => file.ownerEmail.toLowerCase() !== user.email.toLowerCase());
      state.shares = state.shares.filter((share) => share.recipientEmail.toLowerCase() !== user.email.toLowerCase());
      state.shareLinks = state.shareLinks.filter((link) => link.createdByEmail.toLowerCase() !== user.email.toLowerCase());
      state.users = state.users.filter((candidate) => candidate.email.toLowerCase() !== user.email.toLowerCase());
      return json(route, 200, { success: true, message: 'Account deleted successfully' });
    }

    if (path === '/api/files' && method === 'GET') {
      const user = findUser(state, authEmail);
      if (!user) return json(route, 401, { error: 'Unauthorized' });
      const files = state.files.filter(
        (file) => file.userId === user.id && !file.isDeleted,
      );
      return json(route, 200, { success: true, files: files.map(serializeFile) });
    }

    if (path === '/api/files/upload' && method === 'POST') {
      const user = findUser(state, authEmail);
      const body = parseBody(route);
      if (!user) return json(route, 401, { error: 'Unauthorized' });
      const parent = body.parentFolderId ? findFile(state, body.parentFolderId) : null;
      const finalName = makeUniqueName(state, user.email, body.fileName, body.parentFolderId ?? null);
      const file = createFile({
        id: `file-${state.files.length + 1}`,
        userId: user.id,
        ownerEmail: user.email,
        ownerName: parent && parent.ownerEmail !== user.email ? user.email : `${user.firstName} (${user.email})`,
        name: finalName,
        size: body.size ?? 0,
        type: body.isFolder ? 'folder' : 'file',
        mimeType: body.mimeType ?? (body.isFolder ? null : 'application/octet-stream'),
        encryptedData: body.encryptedData ?? [],
        iv: body.iv ?? [],
        wrappedKey: body.wrappedKey ?? [],
        parentFolderId: body.parentFolderId ?? null,
        isFolder: Boolean(body.isFolder),
        isDeleted: false,
      });
      state.files.push(file);
      return json(route, 200, { success: true, file: serializeFile(file) });
    }

    if (path.startsWith('/api/files/download/') && method === 'GET') {
      const fileId = path.split('/').pop() ?? '';
      const file = findFile(state, fileId);
      const share = state.shares.find(
        (candidate) =>
          candidate.fileId === fileId &&
          candidate.recipientEmail.toLowerCase() === (authEmail ?? '').toLowerCase(),
      );
      if (!file || (!authEmail || (file.ownerEmail !== authEmail && !share))) {
        return json(route, 404, { error: 'File not found' });
      }
      return json(route, 200, {
        success: true,
        encryptedData: file.encryptedData,
        iv: file.iv,
        wrappedKey: file.wrappedKey,
        sharedFileKey: share?.sharedFileKey ?? null,
        fileName: file.name,
        mimeType: file.mimeType,
      });
    }

    if (path.startsWith('/api/files/') && !path.includes('/download/') && method === 'PATCH') {
      const fileId = path.split('/').pop() ?? '';
      const file = findFile(state, fileId);
      const body = parseBody(route);
      if (!file || file.ownerEmail.toLowerCase() !== (authEmail ?? '').toLowerCase()) {
        return json(route, 404, { error: 'File not found' });
      }
      file.name = body.name ?? file.name;
      file.parentFolderId = body.parentFolderId ?? file.parentFolderId;
      file.updatedAt = nowIso();
      return json(route, 200, {
        success: true,
        file: {
          id: file.id,
          name: file.name,
          isFavorite: false,
          parentFolderId: file.parentFolderId,
        },
      });
    }

    if (path.startsWith('/api/files/') && !path.includes('/download/') && method === 'DELETE') {
      const fileId = path.split('/').pop() ?? '';
      const file = findFile(state, fileId);
      if (!file || file.ownerEmail.toLowerCase() !== (authEmail ?? '').toLowerCase()) {
        return json(route, 404, { error: 'File not found' });
      }
      file.isDeleted = true;
      return json(route, 200, { success: true, message: 'File moved to trash' });
    }

    if (path === '/api/files/permanent-delete' && method === 'DELETE') {
      const body = parseBody(route);
      state.files = state.files.filter((file) => !(body.fileIds ?? []).includes(file.id));
      return json(route, 200, {
        success: true,
        message: `${(body.fileIds ?? []).length} files permanently deleted`,
        deletedCount: (body.fileIds ?? []).length,
      });
    }

    if (path === '/api/trash' && method === 'GET') {
      const owner = url.searchParams.get('owner') ?? authEmail;
      if (!authEmail) return json(route, 401, { error: 'Unauthorized' });
      const files = state.files.filter((file) => file.ownerEmail === owner && file.isDeleted);
      return json(route, 200, { success: true, data: files.map((file) => ({
        id: file.id,
        name: file.name,
        size: String(file.size),
        type: file.type,
        parentFolderId: file.parentFolderId,
        owner: file.ownerEmail,
        ownerEmail: file.ownerEmail,
        deletedAt: nowIso(),
        createdAt: file.createdAt,
        mimeType: file.mimeType,
      })) });
    }

    if (path === '/api/trash/move' && method === 'POST') {
      const body = parseBody(route);
      for (const fileId of body.fileIds ?? []) {
        const file = findFile(state, fileId);
        if (file) file.isDeleted = true;
      }
      return json(route, 200, {
        success: true,
        message: `${(body.fileIds ?? []).length} file(s) moved to trash`,
        count: (body.fileIds ?? []).length,
      });
    }

    if (path === '/api/trash/restore' && method === 'POST') {
      const body = parseBody(route);
      for (const fileId of body.fileIds ?? []) {
        const file = findFile(state, fileId);
        if (file) file.isDeleted = false;
      }
      return json(route, 200, {
        success: true,
        message: `${(body.fileIds ?? []).length} file(s) restored`,
        count: (body.fileIds ?? []).length,
      });
    }

    if (path.startsWith('/api/trash/') && method === 'DELETE') {
      const fileId = path.split('/').pop() ?? '';
      state.files = state.files.filter((file) => file.id !== fileId);
      return json(route, 200, { success: true, message: 'File permanently deleted' });
    }

    if (path === '/api/metadata/favorites' && method === 'GET') {
      return json(route, 200, {
        success: true,
        data: state.favorites
          .filter((favorite) => favorite.userEmail.toLowerCase() === (authEmail ?? '').toLowerCase())
          .map((favorite) => favorite.fileId),
      });
    }

    if (path === '/api/metadata/favorites' && method === 'POST') {
      const body = parseBody(route);
      state.favorites = state.favorites.filter(
        (favorite) => !(favorite.fileId === body.fileId && favorite.userEmail.toLowerCase() === (authEmail ?? '').toLowerCase()),
      );
      state.favorites.push({ fileId: body.fileId, userEmail: authEmail ?? '' });
      return json(route, 200, { success: true });
    }

    if (path === '/api/metadata/favorites' && method === 'DELETE') {
      const body = parseBody(route);
      state.favorites = state.favorites.filter(
        (favorite) => !(favorite.fileId === body.fileId && favorite.userEmail.toLowerCase() === (authEmail ?? '').toLowerCase()),
      );
      return json(route, 200, { success: true });
    }

    if (path === '/api/shares' && method === 'GET') {
      const shares = state.shares.filter((share) => {
        const file = findFile(state, share.fileId);
        return share.recipientEmail.toLowerCase() === (authEmail ?? '').toLowerCase()
          || file?.ownerEmail.toLowerCase() === (authEmail ?? '').toLowerCase();
      });
      return json(route, 200, { success: true, data: shares.map((share) => shareToApi(state, share)) });
    }

    if (path === '/api/shares' && method === 'POST') {
      const body = parseBody(route);
      const file = findFile(state, body.fileId);
      if (!file) return json(route, 404, { error: 'File not found or unauthorized' });
      const recipient = findUser(state, body.recipientEmail);
      const share: ShareRecord = {
        id: `share-${state.shares.length + 1}`,
        fileId: file.id,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        recipientEmail: body.recipientEmail.toLowerCase(),
        recipientName: recipient ? `${recipient.firstName} ${recipient.lastName}` : body.recipientEmail,
        parentFolderId: body.parentFolderId ?? file.parentFolderId,
        permissions: body.permissions === 'edit' ? 'edit' : 'view',
        sharedAt: nowIso(),
        sharedFileKey: body.sharedFileKey ?? null,
      };
      state.shares.push(share);
      return json(route, 200, { success: true, data: { ...share, fileSize: String(share.fileSize) } });
    }

    if (path === '/api/shares' && method === 'PATCH') {
      const body = parseBody(route);
      if (body.permissions !== undefined) {
        state.shares = state.shares.map((share) =>
          share.fileId === body.fileId && share.recipientEmail.toLowerCase() === body.recipientEmail.toLowerCase()
            ? { ...share, permissions: body.permissions === 'edit' ? 'edit' : 'view' }
            : share,
        );
        return json(route, 200, { success: true, count: 1 });
      }
      state.shares = state.shares.map((share) =>
        share.fileId === body.fileId && (!authEmail || share.recipientEmail.toLowerCase() === authEmail.toLowerCase() || findFile(state, body.fileId)?.ownerEmail.toLowerCase() === authEmail.toLowerCase())
          ? {
              ...share,
              fileName: body.fileName ?? share.fileName,
              parentFolderId: body.parentFolderId ?? share.parentFolderId,
            }
          : share,
      );
      const file = findFile(state, body.fileId);
      if (file && body.fileName) file.name = body.fileName;
      if (file && body.parentFolderId !== undefined) file.parentFolderId = body.parentFolderId;
      return json(route, 200, { success: true, count: 1 });
    }

    if (path === '/api/shares' && method === 'DELETE') {
      const body = parseBody(route);
      const fileId = url.searchParams.get('fileId') ?? body.fileId;
      const recipientEmail = (url.searchParams.get('recipientEmail') ?? body.recipientEmail ?? '').toLowerCase();
      state.shares = state.shares.filter(
        (share) => !(share.fileId === fileId && share.recipientEmail.toLowerCase() === recipientEmail),
      );
      return json(route, 200, { success: true, count: 1 });
    }

    if (path === '/api/shares/all' && method === 'DELETE') {
      const fileId = url.searchParams.get('fileId');
      state.shares = state.shares.filter((share) => share.fileId !== fileId);
      return json(route, 200, { success: true, count: 1, affectedRecipients: 1 });
    }

    if (path === '/api/shares/recipients' && method === 'POST') {
      const body = parseBody(route);
      const fileIds = body.fileIds ?? (body.fileId ? [body.fileId] : []);
      if (body.fileId && !body.fileIds) {
        return json(route, 200, {
          success: true,
          recipients: state.shares
            .filter((share) => share.fileId === body.fileId)
            .map((share) => share.recipientEmail),
        });
      }
      const recipientsByFile = Object.fromEntries(
        fileIds.map((fileId: string) => [
          fileId,
          state.shares.filter((share) => share.fileId === fileId).map((share) => share.recipientEmail),
        ]),
      );
      return json(route, 200, { success: true, recipientsByFile });
    }

    if (path === '/api/shares/hidden' && method === 'GET') {
      return json(route, 200, {
        success: true,
        data: state.hiddenShares.filter((share) => share.recipientEmail.toLowerCase() === (authEmail ?? '').toLowerCase()),
      });
    }

    if (path === '/api/shares/hidden' && method === 'POST') {
      const body = parseBody(route);
      state.hiddenShares.push({
        shareId: body.shareId ?? body.fileId,
        fileId: body.fileId,
        recipientEmail: authEmail ?? '',
        hiddenAt: nowIso(),
      });
      return json(route, 200, { success: true, data: state.hiddenShares[state.hiddenShares.length - 1] });
    }

    if (path === '/api/shares/hidden' && method === 'DELETE') {
      const body = parseBody(route);
      state.hiddenShares = state.hiddenShares.filter(
        (share) => !(share.recipientEmail.toLowerCase() === (authEmail ?? '').toLowerCase() && (body.fileIds ?? []).includes(share.fileId)),
      );
      return json(route, 200, { success: true, count: 1 });
    }

    if (path === '/api/shares/temp-deleted' && method === 'GET') {
      return json(route, 200, {
        success: true,
        data: state.tempDeletedShares.filter((share) => share.recipientEmail.toLowerCase() === (authEmail ?? '').toLowerCase()),
      });
    }

    if (path === '/api/shares/temp-deleted' && method === 'POST') {
      const body = parseBody(route);
      if (body.isTrashed) {
        for (const fileId of body.fileIds ?? []) {
          for (const recipientEmail of body.recipientEmails ?? []) {
            state.tempDeletedShares.push({
              id: `temp-${state.tempDeletedShares.length + 1}`,
              fileId,
              recipientEmail,
              deletedByOwnerAt: nowIso(),
            });
          }
        }
      } else {
        state.tempDeletedShares = state.tempDeletedShares.filter(
          (share) => !(body.fileIds ?? []).includes(share.fileId),
        );
      }
      return json(route, 200, { success: true });
    }

    if (path === '/api/shares/trashed' && method === 'GET') {
      return json(route, 200, {
        success: true,
        data: state.receiverTrashedShares.filter((share) => share.recipientEmail.toLowerCase() === (authEmail ?? '').toLowerCase() && !share.isDeleted),
      });
    }

    if (path === '/api/shares/trashed' && method === 'POST') {
      const body = parseBody(route);
      const share = state.shares.find((candidate) => candidate.fileId === body.fileId || candidate.id === body.shareId);
      if (!share) return json(route, 404, { error: 'Share not found' });
      if (share.permissions !== 'edit') return json(route, 403, { error: 'Forbidden: edit permission required' });
      const trashed = {
        shareId: share.id,
        fileId: share.fileId,
        recipientEmail: share.recipientEmail,
        trashedAt: nowIso(),
        isDeleted: false,
      };
      state.receiverTrashedShares = state.receiverTrashedShares.filter(
        (candidate) => !(candidate.fileId === trashed.fileId && candidate.recipientEmail === trashed.recipientEmail),
      );
      state.receiverTrashedShares.push(trashed);
      return json(route, 200, { success: true, data: trashed });
    }

    if (path === '/api/shares/trashed' && method === 'DELETE') {
      const body = parseBody(route);
      state.receiverTrashedShares = state.receiverTrashedShares.filter(
        (share) => !(share.fileId === body.fileId && share.recipientEmail.toLowerCase() === (authEmail ?? '').toLowerCase()),
      );
      return json(route, 200, { success: true, message: 'Share restored from trash' });
    }

    if (path.startsWith('/api/shares/') && path.endsWith('/recipients') && method === 'GET') {
      const fileId = path.split('/')[3];
      return json(route, 200, {
        success: true,
        data: state.shares
          .filter((share) => share.fileId === fileId)
          .map((share) => ({
            email: share.recipientEmail,
            name: share.recipientName,
            sharedAt: share.sharedAt,
            permissions: share.permissions,
          })),
      });
    }

    if (path === '/api/share-links' && method === 'GET') {
      const fileId = url.searchParams.get('fileId');
      return json(route, 200, {
        success: true,
        data: state.shareLinks.filter((link) => link.createdByEmail.toLowerCase() === (authEmail ?? '').toLowerCase() && (!fileId || link.fileId === fileId)),
      });
    }

    if (path === '/api/share-links' && method === 'POST') {
      const body = parseBody(route);
      const link = createShareLink({
        id: `link-${state.shareLinks.length + 1}`,
        fileId: body.fileId,
        token: `share-token-${state.shareLinks.length + 1}`,
        createdByEmail: authEmail ?? '',
        expiresAt: body.expiresAt,
        sharedFileKey: body.sharedFileKey ?? null,
      });
      state.shareLinks.push(link);
      return json(route, 200, {
        success: true,
        data: {
          ...link,
          shareUrl: `${url.origin}/share/${link.token}`,
        },
      });
    }

    if (path.startsWith('/api/share-links/access/') && method === 'GET') {
      const token = path.split('/').pop() ?? '';
      const link = state.shareLinks.find((candidate) => candidate.token === token);
      if (!link) return json(route, 404, { error: 'Share link not found' });
      if (link.revokedAt) return json(route, 410, { error: 'Share link was revoked' });
      if (new Date(link.expiresAt) <= new Date()) return json(route, 410, { error: 'Share link expired' });
      const file = findFile(state, link.fileId);
      if (!file) return json(route, 404, { error: 'Share link not found' });
      return json(route, 200, {
        success: true,
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
        encryptedData: file.encryptedData,
        iv: file.iv,
        wrappedKey: file.wrappedKey,
        sharedFileKey: link.sharedFileKey,
        expiresAt: link.expiresAt,
      });
    }

    if (path.startsWith('/api/share-links/') && !path.includes('/access/') && method === 'DELETE') {
      const id = path.split('/').pop() ?? '';
      const link = state.shareLinks.find((candidate) => candidate.id === id);
      if (!link) return json(route, 404, { error: 'Share link not found' });
      link.revokedAt = nowIso();
      return json(route, 200, { success: true });
    }

    return json(route, 404, { error: `Unhandled mock route: ${method} ${path}` });
  });
}
