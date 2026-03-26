import { createJsonRequest, getUserEmailFromToken, mockAuthenticatedEmail } from '../helpers/auth.helper';
import { prisma } from '../helpers/db.helper';
import { loadApiModule } from '../helpers/route.helper';

let permanentlyDeleteTrashedFile: typeof import('@/app/api/trash/[id]/route').DELETE;
let moveToTrash: typeof import('@/app/api/trash/move/route').POST;
let restoreFromTrash: typeof import('@/app/api/trash/restore/route').POST;
let listTrash: typeof import('@/app/api/trash/route').GET;

const idContext = (id = 'file-1') => ({
  params: Promise.resolve({ id }),
});

describe('Trash API routes', () => {
  beforeEach(async () => {
    ({ DELETE: permanentlyDeleteTrashedFile } =
      await loadApiModule<typeof import('@/app/api/trash/[id]/route')>(
        '@/app/api/trash/[id]/route',
      ));
    ({ POST: moveToTrash } =
      await loadApiModule<typeof import('@/app/api/trash/move/route')>(
        '@/app/api/trash/move/route',
      ));
    ({ POST: restoreFromTrash } =
      await loadApiModule<typeof import('@/app/api/trash/restore/route')>(
        '@/app/api/trash/restore/route',
      ));
    ({ GET: listTrash } =
      await loadApiModule<typeof import('@/app/api/trash/route')>(
        '@/app/api/trash/route',
      ));
  });

  describe('GET /api/trash', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await listTrash(createJsonRequest('http://localhost/api/trash'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await listTrash(
        createJsonRequest('http://localhost/api/trash', {
          headers: { authorization: 'Bearer invalid' },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns the current user trash by default', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.findMany.mockResolvedValue([
        {
          id: 'file-1',
          name: 'report.pdf',
          size: BigInt(1024),
          type: 'file',
          parentFolderId: null,
          ownerEmail: 'owner@example.com',
          deletedAt: new Date('2026-01-05T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          mimeType: 'application/pdf',
        },
      ]);

      const response = await listTrash(
        createJsonRequest('http://localhost/api/trash', {
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [
          {
            id: 'file-1',
            name: 'report.pdf',
            size: '1024',
            type: 'file',
            parentFolderId: null,
            owner: 'owner@example.com',
            ownerEmail: 'owner@example.com',
            deletedAt: '2026-01-05T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
            mimeType: 'application/pdf',
          },
        ],
      });
    });

    it('returns the requested owner trash when owner query param is provided', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.file.findMany.mockResolvedValue([]);

      const response = await listTrash(
        createJsonRequest('http://localhost/api/trash?owner=owner@example.com', {
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerEmail: 'owner@example.com',
          }),
        }),
      );
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe('POST /api/trash/move', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await moveToTrash(
        createJsonRequest('http://localhost/api/trash/move', {
          method: 'POST',
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await moveToTrash(
        createJsonRequest('http://localhost/api/trash/move', {
          method: 'POST',
          headers: { authorization: 'Bearer invalid' },
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 400 when fileIds is not a non-empty array', async () => {
      mockAuthenticatedEmail();

      const response = await moveToTrash(
        createJsonRequest('http://localhost/api/trash/move', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileIds: [] }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'fileIds must be a non-empty array',
      });
    });

    it('moves files to trash and syncs temp-deleted records for recipients', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.updateMany.mockResolvedValue({ count: 1 });
      prisma.share.findMany.mockResolvedValue([{ recipientEmail: 'recipient@example.com' }]);
      prisma.tempDeletedShare.createMany.mockResolvedValue({ count: 1 });

      const response = await moveToTrash(
        createJsonRequest('http://localhost/api/trash/move', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.tempDeletedShare.createMany).toHaveBeenCalledWith({
        data: [
          {
            fileId: 'file-1',
            recipientEmail: 'recipient@example.com',
            deletedByOwnerAt: expect.any(Date),
          },
        ],
        skipDuplicates: true,
      });
      await expect(response.json()).resolves.toEqual({
        success: true,
        message: '1 file(s) moved to trash',
        count: 1,
      });
    });
  });

  describe('POST /api/trash/restore', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await restoreFromTrash(
        createJsonRequest('http://localhost/api/trash/restore', {
          method: 'POST',
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await restoreFromTrash(
        createJsonRequest('http://localhost/api/trash/restore', {
          method: 'POST',
          headers: { authorization: 'Bearer invalid' },
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 400 when fileIds is not a non-empty array', async () => {
      mockAuthenticatedEmail();

      const response = await restoreFromTrash(
        createJsonRequest('http://localhost/api/trash/restore', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileIds: [] }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'fileIds must be a non-empty array',
      });
    });

    it('restores files and removes temp-deleted share records', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.updateMany.mockResolvedValue({ count: 2 });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 2 });

      const response = await restoreFromTrash(
        createJsonRequest('http://localhost/api/trash/restore', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileIds: ['file-1', 'file-2'] }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.tempDeletedShare.deleteMany).toHaveBeenCalledWith({
        where: { fileId: 'file-1' },
      });
      expect(prisma.tempDeletedShare.deleteMany).toHaveBeenCalledWith({
        where: { fileId: 'file-2' },
      });
      await expect(response.json()).resolves.toEqual({
        success: true,
        message: '2 file(s) restored',
        count: 2,
      });
    });
  });

  describe('DELETE /api/trash/[id]', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await permanentlyDeleteTrashedFile(
        createJsonRequest('http://localhost/api/trash/file-1', { method: 'DELETE' }),
        idContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await permanentlyDeleteTrashedFile(
        createJsonRequest('http://localhost/api/trash/file-1', {
          method: 'DELETE',
          headers: { authorization: 'Bearer invalid' },
        }),
        idContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 404 when the file is not in the current user trash', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.findFirst.mockResolvedValue(null);

      const response = await permanentlyDeleteTrashedFile(
        createJsonRequest('http://localhost/api/trash/file-1', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
        }),
        idContext(),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'File not found in trash or you do not own this file',
      });
    });

    it('permanently deletes the trashed file and related share metadata', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.findFirst.mockResolvedValue({
        id: 'file-1',
        ownerEmail: 'owner@example.com',
        isDeleted: true,
      });
      prisma.share.deleteMany.mockResolvedValue({ count: 1 });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.hiddenShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.receiverTrashedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.file.delete.mockResolvedValue({ id: 'file-1' });

      const response = await permanentlyDeleteTrashedFile(
        createJsonRequest('http://localhost/api/trash/file-1', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
        }),
        idContext(),
      );

      expect(response.status).toBe(200);
      expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
      await expect(response.json()).resolves.toEqual({
        success: true,
        message: 'File permanently deleted',
      });
    });
  });
});
