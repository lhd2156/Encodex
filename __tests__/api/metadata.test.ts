import { createJsonRequest, mockAuthenticatedUser } from '../helpers/auth.helper';
import { prisma } from '../helpers/db.helper';
import { loadApiModule } from '../helpers/route.helper';

let listFavorites: typeof import('@/app/api/metadata/favorites/route').GET;
let addFavorite: typeof import('@/app/api/metadata/favorites/route').POST;
let deleteFavorite: typeof import('@/app/api/metadata/favorites/route').DELETE;
let listHiddenMetadata: typeof import('@/app/api/metadata/hidden/route').GET;
let addHiddenMetadata: typeof import('@/app/api/metadata/hidden/route').POST;
let deleteHiddenMetadata: typeof import('@/app/api/metadata/hidden/route').DELETE;
let listReceiverTrashed: typeof import('@/app/api/metadata/receiver-trashed/route').GET;
let addReceiverTrashed: typeof import('@/app/api/metadata/receiver-trashed/route').POST;
let deleteReceiverTrashed: typeof import('@/app/api/metadata/receiver-trashed/route').DELETE;
let listTempDeleted: typeof import('@/app/api/metadata/temp-deleted/route').GET;
let addTempDeleted: typeof import('@/app/api/metadata/temp-deleted/route').POST;
let updateTempDeleted: typeof import('@/app/api/metadata/temp-deleted/route').PATCH;
let deleteTempDeleted: typeof import('@/app/api/metadata/temp-deleted/route').DELETE;

describe('Metadata API routes', () => {
  beforeEach(async () => {
    ({ GET: listFavorites, POST: addFavorite, DELETE: deleteFavorite } =
      await loadApiModule<typeof import('@/app/api/metadata/favorites/route')>(
        '@/app/api/metadata/favorites/route',
      ));
    ({ GET: listHiddenMetadata, POST: addHiddenMetadata, DELETE: deleteHiddenMetadata } =
      await loadApiModule<typeof import('@/app/api/metadata/hidden/route')>(
        '@/app/api/metadata/hidden/route',
      ));
    ({ GET: listReceiverTrashed, POST: addReceiverTrashed, DELETE: deleteReceiverTrashed } =
      await loadApiModule<typeof import('@/app/api/metadata/receiver-trashed/route')>(
        '@/app/api/metadata/receiver-trashed/route',
      ));
    ({ GET: listTempDeleted, POST: addTempDeleted, PATCH: updateTempDeleted, DELETE: deleteTempDeleted } =
      await loadApiModule<typeof import('@/app/api/metadata/temp-deleted/route')>(
        '@/app/api/metadata/temp-deleted/route',
      ));
  });

  describe('Favorites metadata', () => {
    it('GET /api/metadata/favorites returns 401 when unauthenticated', async () => {
      const response = await listFavorites(createJsonRequest('http://localhost/api/metadata/favorites'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('GET /api/metadata/favorites returns the current user favorites', async () => {
      mockAuthenticatedUser();
      prisma.userFavorite.findMany.mockResolvedValue([{ fileId: 'file-1' }, { fileId: 'file-2' }]);

      const response = await listFavorites(createJsonRequest('http://localhost/api/metadata/favorites'));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: ['file-1', 'file-2'],
      });
    });

    it('POST /api/metadata/favorites returns 401 when unauthenticated', async () => {
      const response = await addFavorite(
        createJsonRequest('http://localhost/api/metadata/favorites', {
          method: 'POST',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('POST /api/metadata/favorites returns 400 when fileId is missing', async () => {
      mockAuthenticatedUser();

      const response = await addFavorite(
        createJsonRequest('http://localhost/api/metadata/favorites', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileId required' });
    });

    it('POST /api/metadata/favorites upserts a favorite for the current user', async () => {
      mockAuthenticatedUser({ email: 'owner@example.com' });
      prisma.userFavorite.upsert.mockResolvedValue({
        fileId: 'file-1',
        userEmail: 'owner@example.com',
      });

      const response = await addFavorite(
        createJsonRequest('http://localhost/api/metadata/favorites', {
          method: 'POST',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.userFavorite.upsert).toHaveBeenCalledWith({
        where: {
          fileId_userEmail: {
            fileId: 'file-1',
            userEmail: 'owner@example.com',
          },
        },
        update: {},
        create: {
          fileId: 'file-1',
          userEmail: 'owner@example.com',
        },
      });
      await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('DELETE /api/metadata/favorites returns 401 when unauthenticated', async () => {
      const response = await deleteFavorite(
        createJsonRequest('http://localhost/api/metadata/favorites', {
          method: 'DELETE',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('DELETE /api/metadata/favorites returns 400 when fileId is missing', async () => {
      mockAuthenticatedUser();

      const response = await deleteFavorite(
        createJsonRequest('http://localhost/api/metadata/favorites', {
          method: 'DELETE',
          body: JSON.stringify({}),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileId required' });
    });

    it('DELETE /api/metadata/favorites removes the favorite for the user', async () => {
      mockAuthenticatedUser({ email: 'owner@example.com' });
      prisma.userFavorite.deleteMany.mockResolvedValue({ count: 1 });

      const response = await deleteFavorite(
        createJsonRequest('http://localhost/api/metadata/favorites', {
          method: 'DELETE',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.userFavorite.deleteMany).toHaveBeenCalledWith({
        where: {
          fileId: 'file-1',
          userEmail: {
            equals: 'owner@example.com',
            mode: 'insensitive',
          },
        },
      });
      await expect(response.json()).resolves.toEqual({ success: true });
    });
  });

  describe('Hidden share metadata', () => {
    it('GET /api/metadata/hidden returns 401 when unauthenticated', async () => {
      const response = await listHiddenMetadata(createJsonRequest('http://localhost/api/metadata/hidden'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('GET /api/metadata/hidden returns hidden file ids', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.hiddenShare.findMany.mockResolvedValue([{ fileId: 'share-1' }]);

      const response = await listHiddenMetadata(createJsonRequest('http://localhost/api/metadata/hidden'));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        fileIds: ['share-1'],
      });
    });

    it('POST /api/metadata/hidden returns 401 when unauthenticated', async () => {
      const response = await addHiddenMetadata(
        createJsonRequest('http://localhost/api/metadata/hidden', {
          method: 'POST',
          body: JSON.stringify({ fileIds: ['share-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('POST /api/metadata/hidden returns 400 when fileIds is not an array', async () => {
      mockAuthenticatedUser();

      const response = await addHiddenMetadata(
        createJsonRequest('http://localhost/api/metadata/hidden', {
          method: 'POST',
          body: JSON.stringify({ fileIds: 'share-1' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileIds must be an array' });
    });

    it('POST /api/metadata/hidden upserts file ids and returns the updated list', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.hiddenShare.upsert.mockResolvedValue({});
      prisma.hiddenShare.findMany.mockResolvedValue([{ fileId: 'share-1' }, { fileId: 'share-2' }]);

      const response = await addHiddenMetadata(
        createJsonRequest('http://localhost/api/metadata/hidden', {
          method: 'POST',
          body: JSON.stringify({ fileIds: ['share-1', 'share-2'] }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.hiddenShare.upsert).toHaveBeenCalledTimes(2);
      await expect(response.json()).resolves.toEqual({
        success: true,
        fileIds: ['share-1', 'share-2'],
      });
    });

    it('DELETE /api/metadata/hidden returns 401 when unauthenticated', async () => {
      const response = await deleteHiddenMetadata(
        createJsonRequest('http://localhost/api/metadata/hidden', {
          method: 'DELETE',
          body: JSON.stringify({ fileIds: ['share-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('DELETE /api/metadata/hidden returns 400 when fileIds is not an array', async () => {
      mockAuthenticatedUser();

      const response = await deleteHiddenMetadata(
        createJsonRequest('http://localhost/api/metadata/hidden', {
          method: 'DELETE',
          body: JSON.stringify({ fileIds: 'share-1' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileIds must be an array' });
    });

    it('DELETE /api/metadata/hidden removes hidden file ids and returns the updated list', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.hiddenShare.deleteMany.mockResolvedValue({ count: 2 });
      prisma.hiddenShare.findMany.mockResolvedValue([{ fileId: 'share-3' }]);

      const response = await deleteHiddenMetadata(
        createJsonRequest('http://localhost/api/metadata/hidden', {
          method: 'DELETE',
          body: JSON.stringify({ fileIds: ['share-1', 'share-2'] }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        fileIds: ['share-3'],
      });
    });
  });

  describe('Receiver trashed metadata', () => {
    it('GET /api/metadata/receiver-trashed returns 401 when unauthenticated', async () => {
      const response = await listReceiverTrashed(
        createJsonRequest('http://localhost/api/metadata/receiver-trashed'),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('GET /api/metadata/receiver-trashed returns trashed file ids', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.receiverTrashedShare.findMany.mockResolvedValue([{ fileId: 'share-1' }]);

      const response = await listReceiverTrashed(
        createJsonRequest('http://localhost/api/metadata/receiver-trashed'),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        fileIds: ['share-1'],
      });
    });

    it('POST /api/metadata/receiver-trashed returns 401 when unauthenticated', async () => {
      const response = await addReceiverTrashed(
        createJsonRequest('http://localhost/api/metadata/receiver-trashed', {
          method: 'POST',
          body: JSON.stringify({ fileIds: ['share-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('POST /api/metadata/receiver-trashed returns 400 when fileIds is not an array', async () => {
      mockAuthenticatedUser();

      const response = await addReceiverTrashed(
        createJsonRequest('http://localhost/api/metadata/receiver-trashed', {
          method: 'POST',
          body: JSON.stringify({ fileIds: 'share-1' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileIds must be an array' });
    });

    it('POST /api/metadata/receiver-trashed upserts receiver trash entries', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.receiverTrashedShare.upsert.mockResolvedValue({});
      prisma.receiverTrashedShare.findMany.mockResolvedValue([{ fileId: 'share-1' }, { fileId: 'share-2' }]);

      const response = await addReceiverTrashed(
        createJsonRequest('http://localhost/api/metadata/receiver-trashed', {
          method: 'POST',
          body: JSON.stringify({ fileIds: ['share-1', 'share-2'] }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.receiverTrashedShare.upsert).toHaveBeenCalledTimes(2);
      await expect(response.json()).resolves.toEqual({
        success: true,
        fileIds: ['share-1', 'share-2'],
      });
    });

    it('DELETE /api/metadata/receiver-trashed returns 401 when unauthenticated', async () => {
      const response = await deleteReceiverTrashed(
        createJsonRequest('http://localhost/api/metadata/receiver-trashed', {
          method: 'DELETE',
          body: JSON.stringify({ fileIds: ['share-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('DELETE /api/metadata/receiver-trashed returns 400 when fileIds is not an array', async () => {
      mockAuthenticatedUser();

      const response = await deleteReceiverTrashed(
        createJsonRequest('http://localhost/api/metadata/receiver-trashed', {
          method: 'DELETE',
          body: JSON.stringify({ fileIds: 'share-1' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileIds must be an array' });
    });

    it('DELETE /api/metadata/receiver-trashed removes receiver trash entries', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.receiverTrashedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.receiverTrashedShare.findMany.mockResolvedValue([]);

      const response = await deleteReceiverTrashed(
        createJsonRequest('http://localhost/api/metadata/receiver-trashed', {
          method: 'DELETE',
          body: JSON.stringify({ fileIds: ['share-1'] }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        fileIds: [],
      });
    });
  });

  describe('Temp-deleted metadata', () => {
    it('GET /api/metadata/temp-deleted returns 401 when unauthenticated', async () => {
      const response = await listTempDeleted(createJsonRequest('http://localhost/api/metadata/temp-deleted'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('GET /api/metadata/temp-deleted returns temp-deleted file ids', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.tempDeletedShare.findMany.mockResolvedValue([{ fileId: 'share-1' }]);

      const response = await listTempDeleted(createJsonRequest('http://localhost/api/metadata/temp-deleted'));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        fileIds: ['share-1'],
      });
    });

    it('POST /api/metadata/temp-deleted returns 401 when unauthenticated', async () => {
      const response = await addTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'POST',
          body: JSON.stringify({ fileId: 'share-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('POST /api/metadata/temp-deleted returns 400 when fileId is missing', async () => {
      mockAuthenticatedUser();

      const response = await addTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileId is required' });
    });

    it('POST /api/metadata/temp-deleted creates a new temp-deleted marker when needed', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.tempDeletedShare.findFirst.mockResolvedValue(null);
      prisma.tempDeletedShare.create.mockResolvedValue({
        fileId: 'share-1',
        recipientEmail: 'recipient@example.com',
      });

      const response = await addTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'POST',
          body: JSON.stringify({ fileId: 'share-1' }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.tempDeletedShare.create).toHaveBeenCalledWith({
        data: {
          fileId: 'share-1',
          recipientEmail: 'recipient@example.com',
        },
      });
      await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('DELETE /api/metadata/temp-deleted returns 401 when unauthenticated', async () => {
      const response = await deleteTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'DELETE',
          body: JSON.stringify({ fileId: 'share-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('DELETE /api/metadata/temp-deleted returns 400 when fileId is missing', async () => {
      mockAuthenticatedUser();

      const response = await deleteTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'DELETE',
          body: JSON.stringify({}),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileId is required' });
    });

    it('DELETE /api/metadata/temp-deleted removes the temp-deleted marker', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 1 });

      const response = await deleteTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'DELETE',
          body: JSON.stringify({ fileId: 'share-1' }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('PATCH /api/metadata/temp-deleted returns 401 when unauthenticated', async () => {
      const response = await updateTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'PATCH',
          body: JSON.stringify({ fileId: 'share-1', tempDeleted: true }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('PATCH /api/metadata/temp-deleted returns 400 when fileId is missing', async () => {
      mockAuthenticatedUser();

      const response = await updateTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'PATCH',
          body: JSON.stringify({ tempDeleted: true }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileId is required' });
    });

    it('PATCH /api/metadata/temp-deleted creates a marker when tempDeleted is true', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.tempDeletedShare.findFirst.mockResolvedValue(null);
      prisma.tempDeletedShare.create.mockResolvedValue({
        fileId: 'share-1',
        recipientEmail: 'recipient@example.com',
      });

      const response = await updateTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'PATCH',
          body: JSON.stringify({ fileId: 'share-1', tempDeleted: true }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.tempDeletedShare.create).toHaveBeenCalledWith({
        data: {
          fileId: 'share-1',
          recipientEmail: 'recipient@example.com',
        },
      });
      await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('PATCH /api/metadata/temp-deleted clears the marker when tempDeleted is false', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 1 });

      const response = await updateTempDeleted(
        createJsonRequest('http://localhost/api/metadata/temp-deleted', {
          method: 'PATCH',
          body: JSON.stringify({ fileId: 'share-1', tempDeleted: false }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.tempDeletedShare.deleteMany).toHaveBeenCalledWith({
        where: {
          fileId: 'share-1',
          recipientEmail: 'recipient@example.com',
        },
      });
      await expect(response.json()).resolves.toEqual({ success: true });
    });
  });
});
