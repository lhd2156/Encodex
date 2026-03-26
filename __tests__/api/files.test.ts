import { GET as listFiles } from '@/app/api/files/route';
import {
  DELETE as moveFileToTrash,
  GET as getFileById,
  PATCH as updateFileById,
} from '@/app/api/files/[id]/route';
import { GET as downloadFile } from '@/app/api/files/download/[id]/route';
import { DELETE as permanentDeleteFiles } from '@/app/api/files/permanent-delete/route';
import { GET as listReceivedFiles } from '@/app/api/files/received/route';
import { GET as listSentFiles } from '@/app/api/files/sent/route';
import { POST as uploadFile } from '@/app/api/files/upload/route';
import {
  createJsonRequest,
  mockAuthenticatedEmail,
  mockAuthenticatedUser,
} from '../helpers/auth.helper';
import {
  createFileFixture,
  createShareFixture,
  createUserFixture,
  prisma,
} from '../helpers/db.helper';
import { createUploadPayload } from '../helpers/file.helper';

const idContext = (id = 'file-1') => ({
  params: Promise.resolve({ id }),
});

describe('Files API routes', () => {
  describe('GET /api/files', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const response = await listFiles(createJsonRequest('http://localhost/api/files'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns formatted owned files with uploader names', async () => {
      mockAuthenticatedUser();
      prisma.file.findMany.mockResolvedValue([
        createFileFixture(),
        createFileFixture({
          id: 'file-2',
          name: 'shared-upload.pdf',
          ownerName: 'uploader@example.com',
        }),
      ]);
      prisma.user.findMany.mockResolvedValue([
        {
          email: 'uploader@example.com',
          firstName: 'Uploader',
          lastName: 'Example',
        },
      ]);

      const response = await listFiles(createJsonRequest('http://localhost/api/files'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.files).toHaveLength(2);
      expect(body.files[0]).toMatchObject({
        id: 'file-1',
        size: '1024',
        owner: 'owner@example.com',
      });
      expect(body.files[1]).toMatchObject({
        id: 'file-2',
        ownerName: 'uploader@example.com',
        uploaderName: 'Uploader (uploader@example.com)',
      });
    });

    it('returns an empty list when the user has no files', async () => {
      mockAuthenticatedUser();
      prisma.file.findMany.mockResolvedValue([]);

      const response = await listFiles(createJsonRequest('http://localhost/api/files'));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        files: [],
      });
    });

    it('returns 500 when listing files fails', async () => {
      mockAuthenticatedUser();
      prisma.file.findMany.mockRejectedValue(new Error('query failed'));

      const response = await listFiles(createJsonRequest('http://localhost/api/files'));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Internal server error',
      });
    });
  });

  describe('GET /api/files/[id]', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const response = await getFileById(
        createJsonRequest('http://localhost/api/files/file-1'),
        idContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 404 when the file is not owned by the user', async () => {
      mockAuthenticatedUser();
      prisma.file.findFirst.mockResolvedValue(null);

      const response = await getFileById(
        createJsonRequest('http://localhost/api/files/file-1'),
        idContext(),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'File not found' });
    });

    it('returns the serialized file payload for an owned file', async () => {
      mockAuthenticatedUser();
      prisma.file.findFirst.mockResolvedValue(createFileFixture());

      const response = await getFileById(
        createJsonRequest('http://localhost/api/files/file-1'),
        idContext(),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        file: expect.objectContaining({
          id: 'file-1',
          name: 'report.pdf',
          size: '1024',
          encryptedData: [1, 2, 3, 4],
          iv: [5, 6, 7, 8],
          wrappedKey: [9, 10, 11, 12],
        }),
      });
    });
  });

  describe('PATCH /api/files/[id]', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const response = await updateFileById(
        createJsonRequest('http://localhost/api/files/file-1', {
          method: 'PATCH',
          body: JSON.stringify({ name: 'renamed.pdf' }),
        }),
        idContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 404 when the file does not exist', async () => {
      mockAuthenticatedUser();
      prisma.file.findFirst.mockResolvedValue(null);

      const response = await updateFileById(
        createJsonRequest('http://localhost/api/files/file-1', {
          method: 'PATCH',
          body: JSON.stringify({ name: 'renamed.pdf' }),
        }),
        idContext(),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'File not found' });
    });

    it('updates file metadata for the owner', async () => {
      mockAuthenticatedUser();
      prisma.file.findFirst.mockResolvedValue(createFileFixture());
      prisma.file.update.mockResolvedValue(
        createFileFixture({
          name: 'renamed.pdf',
          isFavorite: true,
          parentFolderId: 'folder-2',
        }),
      );

      const response = await updateFileById(
        createJsonRequest('http://localhost/api/files/file-1', {
          method: 'PATCH',
          body: JSON.stringify({
            name: 'renamed.pdf',
            isFavorite: true,
            parentFolderId: 'folder-2',
          }),
        }),
        idContext(),
      );

      expect(response.status).toBe(200);
      expect(prisma.file.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: {
          name: 'renamed.pdf',
          isFavorite: true,
          parentFolderId: 'folder-2',
        },
      });
      await expect(response.json()).resolves.toEqual({
        success: true,
        file: {
          id: 'file-1',
          name: 'renamed.pdf',
          isFavorite: true,
          parentFolderId: 'folder-2',
        },
      });
    });
  });

  describe('DELETE /api/files/[id]', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const response = await moveFileToTrash(
        createJsonRequest('http://localhost/api/files/file-1', { method: 'DELETE' }),
        idContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 404 when the file does not exist', async () => {
      mockAuthenticatedUser();
      prisma.file.findFirst.mockResolvedValue(null);

      const response = await moveFileToTrash(
        createJsonRequest('http://localhost/api/files/file-1', { method: 'DELETE' }),
        idContext(),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'File not found' });
    });

    it('soft deletes an owned file', async () => {
      mockAuthenticatedUser();
      prisma.file.findFirst.mockResolvedValue(createFileFixture());
      prisma.file.update.mockResolvedValue(
        createFileFixture({ isDeleted: true, deletedAt: new Date('2026-03-01T00:00:00.000Z') }),
      );

      const response = await moveFileToTrash(
        createJsonRequest('http://localhost/api/files/file-1', { method: 'DELETE' }),
        idContext(),
      );

      expect(response.status).toBe(200);
      expect(prisma.file.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'file-1' },
          data: expect.objectContaining({ isDeleted: true, deletedAt: expect.any(Date) }),
        }),
      );
      await expect(response.json()).resolves.toEqual({
        success: true,
        message: 'File moved to trash',
      });
    });
  });

  describe('GET /api/files/download/[id]', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const response = await downloadFile(
        createJsonRequest('http://localhost/api/files/download/file-1'),
        idContext(),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 404 when the file is inaccessible', async () => {
      mockAuthenticatedUser();
      prisma.file.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.share.findFirst.mockResolvedValue(null);

      const response = await downloadFile(
        createJsonRequest('http://localhost/api/files/download/file-1'),
        idContext(),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'File not found' });
    });

    it('returns 400 when attempting to download a folder', async () => {
      mockAuthenticatedUser();
      prisma.file.findFirst.mockResolvedValue(createFileFixture({ isFolder: true, type: 'folder' }));

      const response = await downloadFile(
        createJsonRequest('http://localhost/api/files/download/file-1'),
        idContext(),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Cannot download a folder' });
    });

    it('returns encrypted file data for the owner', async () => {
      mockAuthenticatedUser();
      prisma.file.findFirst.mockResolvedValue(createFileFixture());

      const response = await downloadFile(
        createJsonRequest('http://localhost/api/files/download/file-1'),
        idContext(),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        encryptedData: [1, 2, 3, 4],
        iv: [5, 6, 7, 8],
        wrappedKey: [9, 10, 11, 12],
        sharedFileKey: null,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      });
    });

    it('returns shared file access for a recipient', async () => {
      mockAuthenticatedUser({ email: 'recipient@example.com' });
      prisma.file.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(createFileFixture());
      prisma.share.findFirst.mockResolvedValue({
        id: 'share-1',
        sharedFileKey: Buffer.from([25, 26, 27]),
      });

      const response = await downloadFile(
        createJsonRequest('http://localhost/api/files/download/file-1'),
        idContext(),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        encryptedData: [1, 2, 3, 4],
        iv: [5, 6, 7, 8],
        wrappedKey: [9, 10, 11, 12],
        sharedFileKey: [25, 26, 27],
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      });
    });
  });

  describe('DELETE /api/files/permanent-delete', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await permanentDeleteFiles(
        createJsonRequest('http://localhost/api/files/permanent-delete', {
          method: 'DELETE',
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      mockAuthenticatedEmail(undefined as unknown as string);

      const response = await permanentDeleteFiles(
        createJsonRequest('http://localhost/api/files/permanent-delete', {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer invalid',
          },
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns 400 when fileIds is missing or empty', async () => {
      mockAuthenticatedEmail();

      const response = await permanentDeleteFiles(
        createJsonRequest('http://localhost/api/files/permanent-delete', {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer token',
          },
          body: JSON.stringify({ fileIds: [] }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'fileIds array is required' });
    });

    it('returns 404 when nothing valid is found in trash', async () => {
      mockAuthenticatedEmail();
      prisma.file.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.receiverTrashedShare.findMany.mockResolvedValue([]);

      const response = await permanentDeleteFiles(
        createJsonRequest('http://localhost/api/files/permanent-delete', {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer token',
          },
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'No valid files found in trash that you own',
      });
    });

    it('permanently deletes owned files and related metadata', async () => {
      mockAuthenticatedEmail();
      prisma.file.findMany.mockResolvedValueOnce([
        {
          id: 'file-1',
          name: 'report.pdf',
          ownerEmail: 'owner@example.com',
          isDeleted: true,
          parentFolderId: null,
        },
      ]);
      prisma.receiverTrashedShare.findMany.mockResolvedValue([]);
      prisma.share.deleteMany.mockResolvedValue({ count: 1 });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.hiddenShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.file.deleteMany.mockResolvedValue({ count: 1 });

      const response = await permanentDeleteFiles(
        createJsonRequest('http://localhost/api/files/permanent-delete', {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer token',
          },
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.share.deleteMany).toHaveBeenCalledWith({ where: { fileId: { in: ['file-1'] } } });
      expect(prisma.file.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['file-1'] } } });
      await expect(response.json()).resolves.toEqual({
        success: true,
        message: '1 files permanently deleted',
        deletedCount: 1,
      });
    });

    it('removes receiver-trash records and unshares descendant items for recipients', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.file.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'shared-folder' }])
        .mockResolvedValueOnce([{ id: 'shared-child', isFolder: false }]);
      prisma.receiverTrashedShare.findMany.mockResolvedValue([{ fileId: 'shared-folder' }]);
      prisma.receiverTrashedShare.deleteMany.mockResolvedValue({ count: 2 });
      prisma.share.deleteMany.mockResolvedValue({ count: 2 });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.hiddenShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.file.deleteMany.mockResolvedValue({ count: 0 });

      const response = await permanentDeleteFiles(
        createJsonRequest('http://localhost/api/files/permanent-delete', {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer token',
          },
          body: JSON.stringify({ fileIds: ['shared-folder'] }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.receiverTrashedShare.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fileId: { in: ['shared-folder', 'shared-child'] },
          }),
        }),
      );
      expect(prisma.share.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fileId: { in: ['shared-folder', 'shared-child'] },
            recipientEmail: {
              equals: 'recipient@example.com',
              mode: 'insensitive',
            },
          }),
        }),
      );
      await expect(response.json()).resolves.toEqual({
        success: true,
        message: '0 files permanently deleted',
        deletedCount: 0,
      });
    });

    it('returns 500 when permanent deletion throws', async () => {
      mockAuthenticatedEmail();
      prisma.file.findMany.mockRejectedValue(new Error('delete failed'));

      const response = await permanentDeleteFiles(
        createJsonRequest('http://localhost/api/files/permanent-delete', {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer token',
          },
          body: JSON.stringify({ fileIds: ['file-1'] }),
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to permanently delete files',
      });
    });
  });

  describe('GET /api/files/received', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await listReceivedFiles(createJsonRequest('http://localhost/api/files/received'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      mockAuthenticatedEmail(undefined as unknown as string);

      const response = await listReceivedFiles(
        createJsonRequest('http://localhost/api/files/received', {
          headers: {
            authorization: 'Bearer invalid',
          },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns files shared with the current user', async () => {
      mockAuthenticatedEmail('recipient@example.com');
      prisma.share.findMany.mockResolvedValue([
        createShareFixture({
          recipientEmail: 'recipient@example.com',
          file: createFileFixture({
            user: {
              firstName: 'Owner',
              lastName: 'Example',
              email: 'owner@example.com',
            },
          }),
        }),
      ]);

      const response = await listReceivedFiles(
        createJsonRequest('http://localhost/api/files/received', {
          headers: {
            authorization: 'Bearer token',
          },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [
          expect.objectContaining({
            fileId: 'file-1',
            fileName: 'report.pdf',
            senderEmail: 'owner@example.com',
            senderName: 'Owner Example',
          }),
        ],
      });
    });
  });

  describe('GET /api/files/sent', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await listSentFiles(createJsonRequest('http://localhost/api/files/sent'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the token is invalid', async () => {
      mockAuthenticatedEmail(undefined as unknown as string);

      const response = await listSentFiles(
        createJsonRequest('http://localhost/api/files/sent', {
          headers: {
            authorization: 'Bearer invalid',
          },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid token' });
    });

    it('returns files shared by the current user with recipient display names', async () => {
      mockAuthenticatedEmail('owner@example.com');
      prisma.share.findMany.mockResolvedValue([
        createShareFixture({
          recipientEmail: 'recipient@example.com',
          file: createFileFixture(),
        }),
      ]);
      prisma.user.findMany.mockResolvedValue([
        {
          email: 'recipient@example.com',
          firstName: 'Recipient',
          lastName: 'Example',
        },
      ]);

      const response = await listSentFiles(
        createJsonRequest('http://localhost/api/files/sent', {
          headers: {
            authorization: 'Bearer token',
          },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: [
          expect.objectContaining({
            fileId: 'file-1',
            recipientEmail: 'recipient@example.com',
            recipientName: 'Recipient (recipient@example.com)',
          }),
        ],
      });
    });
  });

  describe('POST /api/files/upload', () => {
    it('returns 401 when the request is unauthenticated', async () => {
      const response = await uploadFile(
        createJsonRequest('http://localhost/api/files/upload', {
          method: 'POST',
          body: JSON.stringify(createUploadPayload()),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the authenticated user no longer exists', async () => {
      mockAuthenticatedUser();
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await uploadFile(
        createJsonRequest('http://localhost/api/files/upload', {
          method: 'POST',
          body: JSON.stringify(createUploadPayload()),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'User not found' });
    });

    it('returns 400 when fileName is missing', async () => {
      mockAuthenticatedUser();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
      });

      const response = await uploadFile(
        createJsonRequest('http://localhost/api/files/upload', {
          method: 'POST',
          body: JSON.stringify(createUploadPayload({ fileName: '' })),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'File name is required' });
    });

    it('returns 401 when the authenticated email is invalid', async () => {
      mockAuthenticatedUser({ email: '' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: '',
      });

      const response = await uploadFile(
        createJsonRequest('http://localhost/api/files/upload', {
          method: 'POST',
          body: JSON.stringify(createUploadPayload()),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid user authentication' });
    });

    it('auto-renames duplicates and records uploader email inside shared folders', async () => {
      mockAuthenticatedUser();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
      });
      prisma.file.findUnique.mockResolvedValue({
        userId: 'user-2',
        ownerEmail: 'folder-owner@example.com',
        name: 'Shared Parent',
      });
      prisma.file.findFirst
        .mockResolvedValueOnce(createFileFixture({ name: 'report.pdf' }))
        .mockResolvedValueOnce(null);
      prisma.file.create.mockResolvedValue(
        createFileFixture({
          id: 'file-99',
          name: 'report (1).pdf',
          ownerName: 'owner@example.com',
          parentFolderId: 'folder-1',
        }),
      );

      const response = await uploadFile(
        createJsonRequest('http://localhost/api/files/upload', {
          method: 'POST',
          body: JSON.stringify(
            createUploadPayload({
              fileName: 'report.pdf',
              parentFolderId: 'folder-1',
            }),
          ),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.file.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'report (1).pdf',
            ownerName: 'owner@example.com',
            parentFolderId: 'folder-1',
          }),
        }),
      );
      await expect(response.json()).resolves.toEqual({
        success: true,
        file: expect.objectContaining({
          id: 'file-99',
          name: 'report (1).pdf',
          parentFolderId: 'folder-1',
        }),
      });
    });

    it('creates folders with empty encryption payloads', async () => {
      mockAuthenticatedUser();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
      });
      prisma.file.create.mockResolvedValue(
        createFileFixture({
          id: 'folder-1',
          name: 'Projects',
          type: 'folder',
          isFolder: true,
          size: BigInt(0),
          mimeType: null,
          encryptedData: Buffer.alloc(0),
          iv: Buffer.alloc(0),
          wrappedKey: Buffer.alloc(0),
        }),
      );

      const response = await uploadFile(
        createJsonRequest('http://localhost/api/files/upload', {
          method: 'POST',
          body: JSON.stringify(
            createUploadPayload({
              encryptedData: [],
              iv: [],
              wrappedKey: [],
              fileName: 'Projects',
              mimeType: null,
              size: 0,
              isFolder: true,
            }),
          ),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        file: expect.objectContaining({
          id: 'folder-1',
          name: 'Projects',
          isFolder: true,
          size: '0',
        }),
      });
    });

    it('returns 409 when Prisma reports a duplicate name conflict', async () => {
      mockAuthenticatedUser();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
      });
      prisma.file.findFirst.mockResolvedValue(null);
      prisma.file.create.mockRejectedValue({ code: 'P2002' });

      const response = await uploadFile(
        createJsonRequest('http://localhost/api/files/upload', {
          method: 'POST',
          body: JSON.stringify(createUploadPayload()),
        }),
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'A file with this name already exists in this location',
      });
    });

    it('returns 500 when file creation fails unexpectedly', async () => {
      mockAuthenticatedUser();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
      });
      prisma.file.findFirst.mockResolvedValue(null);
      prisma.file.create.mockRejectedValue(new Error('write failed'));

      const response = await uploadFile(
        createJsonRequest('http://localhost/api/files/upload', {
          method: 'POST',
          body: JSON.stringify(createUploadPayload()),
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Internal server error',
        message: undefined,
      });
    });
  });
});
