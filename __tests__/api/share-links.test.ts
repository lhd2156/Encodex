import { createJsonRequest, getUserEmailFromToken, mockAuthenticatedEmail } from '../helpers/auth.helper';
import { createFileFixture, createShareLinkFixture, prisma } from '../helpers/db.helper';
import { loadApiModule } from '../helpers/route.helper';

let revokeShareLink: typeof import('@/app/api/share-links/[id]/route').DELETE;
let accessShareLink: typeof import('@/app/api/share-links/access/[token]/route').GET;
let listShareLinks: typeof import('@/app/api/share-links/route').GET;
let createShareLink: typeof import('@/app/api/share-links/route').POST;

const tokenContext = (token = 'share-token-123') => ({
  params: Promise.resolve({ token }),
});

const idContext = (id = 'link-1') => ({
  params: Promise.resolve({ id }),
});

describe('Share-link API routes', () => {
  beforeEach(async () => {
    ({ DELETE: revokeShareLink } =
      await loadApiModule<typeof import('@/app/api/share-links/[id]/route')>(
        '@/app/api/share-links/[id]/route',
      ));
    ({ GET: accessShareLink } =
      await loadApiModule<typeof import('@/app/api/share-links/access/[token]/route')>(
        '@/app/api/share-links/access/[token]/route',
      ));
    ({ GET: listShareLinks, POST: createShareLink } =
      await loadApiModule<typeof import('@/app/api/share-links/route')>(
        '@/app/api/share-links/route',
      ));
  });

  describe('GET /api/share-links', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await listShareLinks(createJsonRequest('http://localhost/api/share-links'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await listShareLinks(
        createJsonRequest('http://localhost/api/share-links', {
          headers: { authorization: 'Bearer invalid' },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns the current user share links filtered by fileId', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.shareLink.findMany.mockResolvedValue([
        {
          id: 'link-1',
          fileId: 'file-1',
          token: 'share-token-123',
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
          revokedAt: null,
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
        },
      ]);

      const response = await listShareLinks(
        createJsonRequest('http://localhost/api/share-links?fileId=file-1', {
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [
          expect.objectContaining({
            id: 'link-1',
            fileId: 'file-1',
            token: 'share-token-123',
          }),
        ],
      });
    });
  });

  describe('POST /api/share-links', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await createShareLink(
        createJsonRequest('http://localhost/api/share-links', {
          method: 'POST',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await createShareLink(
        createJsonRequest('http://localhost/api/share-links', {
          method: 'POST',
          headers: { authorization: 'Bearer invalid' },
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 400 when required fields are missing', async () => {
      mockAuthenticatedEmail();

      const response = await createShareLink(
        createJsonRequest('http://localhost/api/share-links', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'fileId and expiresAt are required',
      });
    });

    it('returns 400 when expiresAt is not a valid future date', async () => {
      mockAuthenticatedEmail();

      const response = await createShareLink(
        createJsonRequest('http://localhost/api/share-links', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            expiresAt: '2020-01-01T00:00:00.000Z',
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'expiresAt must be a valid future date',
      });
    });

    it('returns 404 when the file is not owned by the user', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue(null);

      const response = await createShareLink(
        createJsonRequest('http://localhost/api/share-links', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
        }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'File not found or unauthorized',
      });
    });

    it('returns 400 when the target is a folder', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue({ id: 'file-1', isFolder: true });

      const response = await createShareLink(
        createJsonRequest('http://localhost/api/share-links', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Temporary share links are supported for files only',
      });
    });

    it('returns 400 when sharedFileKey is not a byte array', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue({ id: 'file-1', isFolder: false });

      const response = await createShareLink(
        createJsonRequest('http://localhost/api/share-links', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            expiresAt: '2099-01-01T00:00:00.000Z',
            sharedFileKey: 'bad-key',
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'sharedFileKey must be an array of bytes',
      });
    });

    it('creates a share link and returns a share URL', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.findFirst.mockResolvedValue({ id: 'file-1', isFolder: false });
      prisma.shareLink.findUnique.mockResolvedValue(null);
      prisma.shareLink.create.mockImplementation(async ({ data }) => ({
        id: 'link-1',
        fileId: data.fileId,
        token: data.token,
        expiresAt: data.expiresAt,
        revokedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }));

      const response = await createShareLink(
        createJsonRequest('http://localhost/api/share-links', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            expiresAt: '2099-01-01T00:00:00.000Z',
            sharedFileKey: [1, 2, 3],
          }),
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        id: 'link-1',
        fileId: 'file-1',
      });
      expect(body.data.token).toBeTruthy();
      expect(body.data.shareUrl).toContain(`/share/${body.data.token}`);
    });
  });

  describe('GET /api/share-links/access/[token]', () => {
    it('returns 404 when the share link does not exist', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(null);

      const response = await accessShareLink(
        createJsonRequest('http://localhost/api/share-links/access/share-token-123'),
        tokenContext(),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'Share link not found' });
    });

    it('returns 410 when the share link was revoked', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(
        createShareLinkFixture({ revokedAt: new Date('2026-01-01T00:00:00.000Z') }),
      );

      const response = await accessShareLink(
        createJsonRequest('http://localhost/api/share-links/access/share-token-123'),
        tokenContext(),
      );

      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toEqual({ error: 'Share link was revoked' });
    });

    it('returns 410 when the share link has expired', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(
        createShareLinkFixture({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
      );

      const response = await accessShareLink(
        createJsonRequest('http://localhost/api/share-links/access/share-token-123'),
        tokenContext(),
      );

      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toEqual({ error: 'Share link expired' });
    });

    it('returns 400 when the share link targets a folder', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(
        createShareLinkFixture({
          file: createFileFixture({ isFolder: true, type: 'folder' }),
        }),
      );

      const response = await accessShareLink(
        createJsonRequest('http://localhost/api/share-links/access/share-token-123'),
        tokenContext(),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Folder links are not supported' });
    });

    it('returns encrypted file data for valid share links', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(createShareLinkFixture());

      const response = await accessShareLink(
        createJsonRequest('http://localhost/api/share-links/access/share-token-123'),
        tokenContext(),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        fileId: 'file-1',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        encryptedData: [1, 2, 3, 4],
        iv: [5, 6, 7, 8],
        wrappedKey: [9, 10, 11, 12],
        sharedFileKey: [21, 22, 23],
        expiresAt: '2026-12-31T00:00:00.000Z',
      });
    });
  });

  describe('DELETE /api/share-links/[id]', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await revokeShareLink(
        createJsonRequest('http://localhost/api/share-links/link-1', { method: 'DELETE' }),
        idContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await revokeShareLink(
        createJsonRequest('http://localhost/api/share-links/link-1', {
          method: 'DELETE',
          headers: { authorization: 'Bearer invalid' },
        }),
        idContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 404 when the link does not belong to the current user', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.shareLink.findFirst.mockResolvedValue(null);

      const response = await revokeShareLink(
        createJsonRequest('http://localhost/api/share-links/link-1', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
        }),
        idContext(),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'Share link not found' });
    });

    it('returns success immediately when the link is already revoked', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.shareLink.findFirst.mockResolvedValue({
        id: 'link-1',
        revokedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const response = await revokeShareLink(
        createJsonRequest('http://localhost/api/share-links/link-1', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
        }),
        idContext(),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('marks an active share link as revoked', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.shareLink.findFirst.mockResolvedValue({
        id: 'link-1',
        revokedAt: null,
      });
      prisma.shareLink.update.mockResolvedValue({
        id: 'link-1',
        revokedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const response = await revokeShareLink(
        createJsonRequest('http://localhost/api/share-links/link-1', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
        }),
        idContext(),
      );

      expect(response.status).toBe(200);
      expect(prisma.shareLink.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { revokedAt: expect.any(Date) },
      });
      await expect(response.json()).resolves.toEqual({ success: true });
    });
  });
});
