import {
  DELETE as deleteShare,
  GET as listShares,
  PATCH as updateShare,
  POST as createShare,
} from '@/app/api/shares/route';
import { DELETE as deleteAllShares } from '@/app/api/shares/all/route';
import {
  DELETE as unhideShares,
  GET as listHiddenShares,
  POST as hideShare,
} from '@/app/api/shares/hidden/route';
import { POST as listRecipients } from '@/app/api/shares/recipients/route';
import {
  GET as listTempDeletedShares,
  POST as updateTempDeletedShares,
} from '@/app/api/shares/temp-deleted/route';
import {
  DELETE as restoreTrashedShare,
  GET as listTrashedShares,
  POST as trashShare,
} from '@/app/api/shares/trashed/route';
import { GET as listFileRecipients } from '@/app/api/shares/[fileId]/recipients/route';
import {
  createJsonRequest,
  getUserEmailFromToken,
  mockAuthenticatedEmail,
  mockAuthenticatedUser,
} from '../helpers/auth.helper';
import {
  createFileFixture,
  createShareFixture,
  prisma,
} from '../helpers/db.helper';

const fileContext = (fileId = 'file-1') => ({
  params: Promise.resolve({ fileId }),
});

describe('Shares API routes', () => {
  describe('GET /api/shares', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await listShares(createJsonRequest('http://localhost/api/shares'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await listShares(
        createJsonRequest('http://localhost/api/shares', {
          headers: { authorization: 'Bearer invalid' },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns sent and received shares with owner and uploader display names', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.share.findMany.mockResolvedValue([
        createShareFixture({
          file: createFileFixture({
            ownerName: 'uploader@example.com',
            user: {
              firstName: 'Owner',
              lastName: 'Example',
              email: 'owner@example.com',
            },
          }),
        }),
      ]);
      prisma.user.findMany.mockResolvedValue([
        {
          email: 'uploader@example.com',
          firstName: 'Uploader',
          lastName: 'Example',
        },
      ]);

      const response = await listShares(
        createJsonRequest('http://localhost/api/shares', {
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [
          expect.objectContaining({
            fileSize: '1024',
            file: expect.objectContaining({
              ownerEmail: 'owner@example.com',
              ownerName: 'Owner (owner@example.com)',
              uploaderEmail: 'uploader@example.com',
              uploaderName: 'Uploader (uploader@example.com)',
            }),
          }),
        ],
      });
    });
  });

  describe('POST /api/shares', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await createShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'POST',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await createShare(
        createJsonRequest('http://localhost/api/shares', {
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

      const response = await createShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileId: 'file-1', fileName: 'report.pdf' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Missing required fields' });
    });

    it('returns 400 when permissions are invalid', async () => {
      mockAuthenticatedEmail();

      const response = await createShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            fileName: 'report.pdf',
            recipientEmail: 'recipient@example.com',
            permissions: 'owner',
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid permissions value. Allowed values: view, edit',
      });
    });

    it('returns 400 when sharedFileKey is not a byte array', async () => {
      mockAuthenticatedEmail();

      const response = await createShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            fileName: 'report.pdf',
            recipientEmail: 'recipient@example.com',
            sharedFileKey: 'bad-key',
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'sharedFileKey must be an array of bytes',
      });
    });

    it('returns 404 when the file is not owned by the sender', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(null);

      const response = await createShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            fileName: 'report.pdf',
            recipientEmail: 'recipient@example.com',
          }),
        }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'File not found or unauthorized',
      });
    });

    it('returns a handled edge-case response when the share already exists', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue(createFileFixture());
      prisma.share.findFirst.mockResolvedValueOnce(createShareFixture());

      const response = await createShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            fileName: 'report.pdf',
            recipientEmail: 'recipient@example.com',
          }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: false,
        message: 'File already shared with this user',
      });
    });

    it('blocks re-sharing when the recipient still has the file in trash', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue(createFileFixture());
      prisma.share.findFirst.mockResolvedValueOnce(null);
      prisma.receiverTrashedShare.findFirst.mockResolvedValueOnce({ fileId: 'file-1' });

      const response = await createShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            fileName: 'report.pdf',
            recipientEmail: 'recipient@example.com',
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false,
        message: 'Recipient has this file in trash. They must permanently delete it first.',
      });
    });

    it('creates a share and auto-adds it to receiver trash when the parent folder is already trashed', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue(createFileFixture());
      prisma.share.findFirst.mockResolvedValueOnce(null);
      prisma.receiverTrashedShare.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ fileId: 'folder-1', recipientEmail: 'recipient@example.com' });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.hiddenShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.user.findFirst.mockResolvedValue({ firstName: 'Recipient', lastName: 'Example' });
      prisma.share.create.mockResolvedValue(
        createShareFixture({
          id: 'share-1',
          recipientEmail: 'recipient@example.com',
          recipientName: 'Recipient Example',
          parentFolderId: 'folder-1',
          sharedFileKey: Buffer.from([1, 2, 3]),
        }),
      );
      prisma.receiverTrashedShare.upsert.mockResolvedValue({});

      const response = await createShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            fileName: 'report.pdf',
            recipientEmail: 'recipient@example.com',
            parentFolderId: 'folder-1',
            permissions: 'edit',
            sharedFileKey: [1, 2, 3],
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.receiverTrashedShare.upsert).toHaveBeenCalled();
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: expect.objectContaining({
          id: 'share-1',
          fileSize: '1024',
        }),
      });
    });
  });

  describe('PATCH /api/shares', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await updateShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'PATCH',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await updateShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'PATCH',
          headers: { authorization: 'Bearer invalid' },
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 400 when fileId is missing', async () => {
      mockAuthenticatedEmail();

      const response = await updateShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'PATCH',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileName: 'renamed.pdf' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileId required' });
    });

    it('returns 400 when permission updates are missing recipientEmail', async () => {
      mockAuthenticatedEmail();

      const response = await updateShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'PATCH',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileId: 'file-1', permissions: 'edit' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'recipientEmail required when updating permissions',
      });
    });

    it('returns 404 when recursive permission updates do not find an owned file', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue(null);

      const response = await updateShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'PATCH',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'folder-1',
            recipientEmail: 'recipient@example.com',
            permissions: 'edit',
            recursive: true,
          }),
        }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'File not found or unauthorized',
      });
    });

    it('updates permissions recursively for all descendant shares', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue({ id: 'folder-1' });
      prisma.file.findMany
        .mockResolvedValueOnce([{ id: 'child-1' }])
        .mockResolvedValueOnce([]);
      prisma.share.updateMany.mockResolvedValue({ count: 2 });

      const response = await updateShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'PATCH',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'folder-1',
            recipientEmail: 'recipient@example.com',
            permissions: 'edit',
            recursive: true,
          }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true, count: 2 });
    });

    it('returns 400 when a metadata update does not provide fields to change', async () => {
      mockAuthenticatedEmail();

      const response = await updateShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'PATCH',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'No fields provided to update',
      });
    });

    it('returns 403 when a recipient has only view permissions', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.file.findFirst.mockResolvedValue({ id: 'file-1', ownerEmail: 'owner@example.com' });
      prisma.share.findFirst.mockResolvedValue({ permissions: 'view' });

      const response = await updateShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'PATCH',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            fileName: 'renamed.pdf',
          }),
        }),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: 'Forbidden: edit permission required',
      });
    });

    it('allows recipients with edit access to update their own share metadata', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.file.findFirst.mockResolvedValue({ id: 'file-1', ownerEmail: 'owner@example.com' });
      prisma.share.findFirst.mockResolvedValue({ permissions: 'edit' });
      prisma.share.updateMany.mockResolvedValue({ count: 1 });

      const response = await updateShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'PATCH',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            fileName: 'renamed.pdf',
            parentFolderId: 'folder-2',
          }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true, count: 1 });
    });
  });

  describe('DELETE /api/shares', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await deleteShare(createJsonRequest('http://localhost/api/shares', { method: 'DELETE' }));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await deleteShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'DELETE',
          headers: { authorization: 'Bearer invalid' },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 400 when fileId and recipientEmail are missing', async () => {
      mockAuthenticatedEmail();

      const response = await deleteShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({}),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'fileId and recipientEmail required',
      });
    });

    it('returns 403 when neither owner nor recipient is deleting the share', async () => {
      mockAuthenticatedEmail('outsider@example.com');
      prisma.file.findFirst.mockResolvedValue({ id: 'file-1', ownerEmail: 'owner@example.com' });

      const response = await deleteShare(
        createJsonRequest('http://localhost/api/shares?fileId=file-1&recipientEmail=recipient@example.com', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: 'Unauthorized - only owner or recipient can remove share',
      });
    });

    it('deletes recursive shares for the owner and cleans receiver trash', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.findFirst.mockResolvedValue({ id: 'folder-1', ownerEmail: 'owner@example.com' });
      prisma.file.findMany
        .mockResolvedValueOnce([{ id: 'child-1' }])
        .mockResolvedValueOnce([]);
      prisma.share.deleteMany.mockResolvedValue({ count: 2 });
      prisma.receiverTrashedShare.deleteMany.mockResolvedValue({ count: 2 });

      const response = await deleteShare(
        createJsonRequest('http://localhost/api/shares?fileId=folder-1&recipientEmail=recipient@example.com', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true, count: 2 });
    });

    it('allows recipients to unshare themselves', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.file.findFirst.mockResolvedValue({ id: 'file-1', ownerEmail: 'owner@example.com' });
      prisma.file.findMany.mockResolvedValue([]);
      prisma.share.deleteMany.mockResolvedValue({ count: 1 });
      prisma.receiverTrashedShare.deleteMany.mockResolvedValue({ count: 1 });

      const response = await deleteShare(
        createJsonRequest('http://localhost/api/shares', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileId: 'file-1',
            recipientEmail: 'recipient@example.com',
          }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true, count: 1 });
    });
  });

  describe('DELETE /api/shares/all', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await deleteAllShares(createJsonRequest('http://localhost/api/shares/all', { method: 'DELETE' }));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await deleteAllShares(
        createJsonRequest('http://localhost/api/shares/all?fileId=file-1', {
          method: 'DELETE',
          headers: { authorization: 'Bearer invalid' },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 400 when fileId is missing', async () => {
      mockAuthenticatedEmail();

      const response = await deleteAllShares(
        createJsonRequest('http://localhost/api/shares/all', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileId required' });
    });

    it('recursively deletes shares and cleans related metadata', async () => {
      mockAuthenticatedEmail();
      prisma.file.findFirst.mockResolvedValue({ id: 'folder-1', ownerEmail: 'owner@example.com' });
      prisma.file.findMany
        .mockResolvedValueOnce([{ id: 'child-1' }])
        .mockResolvedValueOnce([]);
      prisma.share.findMany.mockResolvedValue([{ recipientEmail: 'recipient@example.com' }]);
      prisma.share.deleteMany.mockResolvedValue({ count: 2 });
      prisma.receiverTrashedShare.deleteMany.mockResolvedValue({ count: 2 });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 2 });
      prisma.hiddenShare.deleteMany.mockResolvedValue({ count: 2 });

      const response = await deleteAllShares(
        createJsonRequest('http://localhost/api/shares/all?fileId=folder-1&recursive=true', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        count: 2,
        affectedRecipients: 1,
      });
    });
  });

  describe('Hidden share endpoints', () => {
    it('GET /api/shares/hidden returns 401 when the bearer token is missing', async () => {
      const response = await listHiddenShares(createJsonRequest('http://localhost/api/shares/hidden'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('GET /api/shares/hidden returns the hidden shares for the receiver', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.hiddenShare.findMany.mockResolvedValue([
        { shareId: 'share-1', fileId: 'file-1', hiddenAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);

      const response = await listHiddenShares(
        createJsonRequest('http://localhost/api/shares/hidden', {
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [
          expect.objectContaining({
            shareId: 'share-1',
            fileId: 'file-1',
          }),
        ],
      });
    });

    it('POST /api/shares/hidden validates fileId and creates a hidden record', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.hiddenShare.upsert.mockResolvedValue({
        shareId: 'share-1',
        fileId: 'file-1',
        recipientEmail: 'recipient@example.com',
      });

      const badResponse = await hideShare(
        createJsonRequest('http://localhost/api/shares/hidden', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ shareId: 'share-1' }),
        }),
      );
      expect(badResponse.status).toBe(400);

      const goodResponse = await hideShare(
        createJsonRequest('http://localhost/api/shares/hidden', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ shareId: 'share-1', fileId: 'file-1' }),
        }),
      );

      expect(goodResponse.status).toBe(200);
      await expect(goodResponse.json()).resolves.toEqual({
        success: true,
        data: expect.objectContaining({
          shareId: 'share-1',
          fileId: 'file-1',
        }),
      });
    });

    it('DELETE /api/shares/hidden validates fileIds and removes hidden records', async () => {
      const unauthenticated = await unhideShares(
        createJsonRequest('http://localhost/api/shares/hidden', {
          method: 'DELETE',
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );
      expect(unauthenticated.status).toBe(401);

      mockAuthenticatedEmail('recipient@example.com');
      const invalid = await unhideShares(
        createJsonRequest('http://localhost/api/shares/hidden', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileIds: 'file-1' }),
        }),
      );
      expect(invalid.status).toBe(400);

      prisma.hiddenShare.deleteMany.mockResolvedValue({ count: 1 });
      const valid = await unhideShares(
        createJsonRequest('http://localhost/api/shares/hidden', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(valid.status).toBe(200);
      await expect(valid.json()).resolves.toEqual({ success: true, count: 1 });
    });
  });

  describe('POST /api/shares/recipients', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const response = await listRecipients(
        createJsonRequest('http://localhost/api/shares/recipients', {
          method: 'POST',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 400 when no file id input is provided', async () => {
      mockAuthenticatedUser();

      const response = await listRecipients(
        createJsonRequest('http://localhost/api/shares/recipients', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileId or fileIds required' });
    });

    it('returns recipients for a single file', async () => {
      mockAuthenticatedUser();
      prisma.share.findMany.mockResolvedValue([
        { fileId: 'file-1', recipientEmail: 'a@example.com' },
        { fileId: 'file-1', recipientEmail: 'b@example.com' },
      ]);

      const response = await listRecipients(
        createJsonRequest('http://localhost/api/shares/recipients', {
          method: 'POST',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        recipients: ['a@example.com', 'b@example.com'],
      });
    });

    it('returns recipients grouped by file for batch requests', async () => {
      mockAuthenticatedUser();
      prisma.share.findMany.mockResolvedValue([
        { fileId: 'file-1', recipientEmail: 'a@example.com' },
        { fileId: 'file-2', recipientEmail: 'b@example.com' },
      ]);

      const response = await listRecipients(
        createJsonRequest('http://localhost/api/shares/recipients', {
          method: 'POST',
          body: JSON.stringify({ fileIds: ['file-1', 'file-2'] }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        recipientsByFile: {
          'file-1': ['a@example.com'],
          'file-2': ['b@example.com'],
        },
      });
    });
  });

  describe('Temp-deleted share endpoints', () => {
    it('GET /api/shares/temp-deleted returns 401 when the bearer token is missing', async () => {
      const response = await listTempDeletedShares(createJsonRequest('http://localhost/api/shares/temp-deleted'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('GET /api/shares/temp-deleted returns temp-deleted shares for the receiver', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.tempDeletedShare.findMany.mockResolvedValue([
        { id: 'temp-1', fileId: 'file-1', deletedByOwnerAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);

      const response = await listTempDeletedShares(
        createJsonRequest('http://localhost/api/shares/temp-deleted', {
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [
          expect.objectContaining({
            id: 'temp-1',
            fileId: 'file-1',
          }),
        ],
      });
    });

    it('POST /api/shares/temp-deleted returns 401 when the bearer token is missing', async () => {
      const response = await updateTempDeletedShares(
        createJsonRequest('http://localhost/api/shares/temp-deleted', {
          method: 'POST',
          body: JSON.stringify({ fileIds: ['file-1'], recipientEmails: ['recipient@example.com'], isTrashed: true }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('POST /api/shares/temp-deleted skips creation when none of the files are actually in trash', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.findMany.mockResolvedValue([]);

      const response = await updateTempDeletedShares(
        createJsonRequest('http://localhost/api/shares/temp-deleted', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileIds: ['file-1'],
            recipientEmails: ['recipient@example.com'],
            isTrashed: true,
          }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true, skipped: true });
    });

    it('POST /api/shares/temp-deleted creates or removes temp-deleted share entries', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.findMany.mockResolvedValue([{ id: 'file-1' }]);
      prisma.tempDeletedShare.createMany.mockResolvedValue({ count: 1 });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 1 });

      const createResponse = await updateTempDeletedShares(
        createJsonRequest('http://localhost/api/shares/temp-deleted', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileIds: ['file-1'],
            recipientEmails: ['recipient@example.com'],
            isTrashed: true,
          }),
        }),
      );
      expect(createResponse.status).toBe(200);

      const deleteResponse = await updateTempDeletedShares(
        createJsonRequest('http://localhost/api/shares/temp-deleted', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({
            fileIds: ['file-1'],
            recipientEmails: ['recipient@example.com'],
            isTrashed: false,
          }),
        }),
      );

      expect(deleteResponse.status).toBe(200);
      await expect(deleteResponse.json()).resolves.toEqual({ success: true });
    });
  });

  describe('Receiver trash share endpoints', () => {
    it('GET /api/shares/trashed returns 401 when the bearer token is missing', async () => {
      const response = await listTrashedShares(createJsonRequest('http://localhost/api/shares/trashed'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('GET /api/shares/trashed returns shares in the receiver trash', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.receiverTrashedShare.findMany.mockResolvedValue([
        { shareId: 'share-1', fileId: 'file-1', trashedAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);

      const response = await listTrashedShares(
        createJsonRequest('http://localhost/api/shares/trashed', {
          headers: { authorization: 'Bearer token' },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [
          expect.objectContaining({
            shareId: 'share-1',
            fileId: 'file-1',
          }),
        ],
      });
    });

    it('POST /api/shares/trashed returns 401 when the bearer token is missing', async () => {
      const response = await trashShare(
        createJsonRequest('http://localhost/api/shares/trashed', {
          method: 'POST',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('POST /api/shares/trashed validates input and edit permissions', async () => {
      mockAuthenticatedEmail('recipient@example.com');

      const invalidResponse = await trashShare(
        createJsonRequest('http://localhost/api/shares/trashed', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({}),
        }),
      );
      expect(invalidResponse.status).toBe(400);

      prisma.share.findFirst.mockResolvedValue({
        id: 'share-1',
        fileId: 'file-1',
        permissions: 'view',
      });
      const forbiddenResponse = await trashShare(
        createJsonRequest('http://localhost/api/shares/trashed', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(forbiddenResponse.status).toBe(403);
      await expect(forbiddenResponse.json()).resolves.toEqual({
        error: 'Forbidden: edit permission required',
      });
    });

    it('POST /api/shares/trashed adds a share to the receiver trash', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.share.findFirst.mockResolvedValue({
        id: 'share-1',
        fileId: 'file-1',
        permissions: 'edit',
      });
      prisma.receiverTrashedShare.upsert.mockResolvedValue({
        shareId: 'share-1',
        fileId: 'file-1',
      });

      const response = await trashShare(
        createJsonRequest('http://localhost/api/shares/trashed', {
          method: 'POST',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: expect.objectContaining({
          shareId: 'share-1',
          fileId: 'file-1',
        }),
      });
    });

    it('DELETE /api/shares/trashed validates input and restores trashed shares', async () => {
      const unauthenticated = await restoreTrashedShare(
        createJsonRequest('http://localhost/api/shares/trashed', {
          method: 'DELETE',
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );
      expect(unauthenticated.status).toBe(401);

      mockAuthenticatedEmail('recipient@example.com');
      const invalid = await restoreTrashedShare(
        createJsonRequest('http://localhost/api/shares/trashed', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({}),
        }),
      );
      expect(invalid.status).toBe(400);

      prisma.receiverTrashedShare.deleteMany.mockResolvedValue({ count: 1 });
      const valid = await restoreTrashedShare(
        createJsonRequest('http://localhost/api/shares/trashed', {
          method: 'DELETE',
          headers: { authorization: 'Bearer token' },
          body: JSON.stringify({ fileId: 'file-1' }),
        }),
      );

      expect(valid.status).toBe(200);
      await expect(valid.json()).resolves.toEqual({
        success: true,
        message: 'Share restored from trash',
      });
    });
  });

  describe('GET /api/shares/[fileId]/recipients', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await listFileRecipients(
        createJsonRequest('http://localhost/api/shares/file-1/recipients'),
        fileContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      getUserEmailFromToken.mockResolvedValue(null);

      const response = await listFileRecipients(
        createJsonRequest('http://localhost/api/shares/file-1/recipients', {
          headers: { authorization: 'Bearer invalid' },
        }),
        fileContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 404 when the requester does not own the file', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.findFirst.mockResolvedValue(null);

      const response = await listFileRecipients(
        createJsonRequest('http://localhost/api/shares/file-1/recipients', {
          headers: { authorization: 'Bearer token' },
        }),
        fileContext(),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'File not found or you do not own this file',
      });
    });

    it('returns all recipients with live display names', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.file.findFirst.mockResolvedValue({ id: 'file-1' });
      prisma.share.findMany.mockResolvedValue([
        {
          id: 'share-1',
          recipientEmail: 'recipient@example.com',
          recipientName: 'Recipient Example',
          sharedAt: new Date('2026-01-01T00:00:00.000Z'),
          permissions: 'edit',
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        {
          email: 'recipient@example.com',
          firstName: 'Recipient',
          lastName: 'Example',
        },
      ]);

      const response = await listFileRecipients(
        createJsonRequest('http://localhost/api/shares/file-1/recipients', {
          headers: { authorization: 'Bearer token' },
        }),
        fileContext(),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [
          {
            email: 'recipient@example.com',
            name: 'Recipient (recipient@example.com)',
            sharedAt: new Date('2026-01-01T00:00:00.000Z'),
            permissions: 'edit',
          },
        ],
      });
    });
  });
});
