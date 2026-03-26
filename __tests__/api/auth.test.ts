import { DELETE as deleteAccount } from '@/app/api/auth/delete-account/route';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as getProfile, PATCH as updateProfile } from '@/app/api/auth/profile/route';
import { GET as getRecoveryKey } from '@/app/api/auth/recovery-key/route';
import { POST as resetPassword } from '@/app/api/auth/reset-password/route';
import { POST as signup } from '@/app/api/auth/signup/route';
import {
  createDecodedToken,
  createJsonRequest,
  createJwtToken,
  createToken,
  hashPassword,
  verifyPassword,
} from '../helpers/auth.helper';
import { createUserFixture, prisma } from '../helpers/db.helper';
import { generateRecoveryKey, storeRecoveryKey } from '../helpers/recovery.helper';

describe('Auth API routes', () => {
  describe('POST /api/auth/signup', () => {
    it('creates a user, stores a recovery key, and returns auth payload', async () => {
      const createdUser = createUserFixture({
        email: 'new.user@example.com',
        firstName: 'New',
        lastName: 'User',
      });

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(createdUser);
      generateRecoveryKey.mockReturnValue('RECOVERY-NEW-999');
      createToken.mockReturnValue('signup-token');

      const response = await signup(
        createJsonRequest('http://localhost/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: 'New.User@Example.com',
            password: 'password123',
            firstName: 'New',
            lastName: 'User',
          }),
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        token: 'signup-token',
        recoveryKey: 'RECOVERY-NEW-999',
        user: {
          id: createdUser.id,
          email: createdUser.email,
          firstName: createdUser.firstName,
          lastName: createdUser.lastName,
        },
      });
      expect(hashPassword).toHaveBeenCalledWith('password123');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new.user@example.com',
            firstName: 'New',
            lastName: 'User',
            passwordHash: 'hashed:password123',
          }),
        }),
      );
      expect(storeRecoveryKey).toHaveBeenCalledWith('new.user@example.com', 'RECOVERY-NEW-999');
      expect(body.salt).toHaveLength(16);
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await signup(
        createJsonRequest('http://localhost/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: 'missing@example.com',
            password: 'password123',
            firstName: 'Missing',
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Missing required fields',
      });
    });

    it('returns 400 for a short password', async () => {
      const response = await signup(
        createJsonRequest('http://localhost/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: 'short@example.com',
            password: 'short',
            firstName: 'Short',
            lastName: 'Password',
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Password must be at least 8 characters',
      });
    });

    it('returns 409 when the user already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(createUserFixture());

      const response = await signup(
        createJsonRequest('http://localhost/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: 'owner@example.com',
            password: 'password123',
            firstName: 'Owner',
            lastName: 'Example',
          }),
        }),
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'User already exists',
      });
    });

    it('returns 500 when user creation fails', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(new Error('db down'));

      const response = await signup(
        createJsonRequest('http://localhost/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: 'broken@example.com',
            password: 'password123',
            firstName: 'Broken',
            lastName: 'Signup',
          }),
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Internal server error',
      });
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a token and profile payload for valid credentials', async () => {
      const user = createUserFixture();
      prisma.user.findUnique.mockResolvedValue(user);
      verifyPassword.mockResolvedValue(true);
      createToken.mockReturnValue('login-token');

      const response = await login(
        createJsonRequest('http://localhost/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: 'OWNER@EXAMPLE.COM',
            password: 'password123',
          }),
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        success: true,
        token: 'login-token',
        recoveryKey: user.recoveryKey,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        salt: Array.from(user.salt),
      });
      expect(verifyPassword).toHaveBeenCalledWith('password123', user.passwordHash);
    });

    it('returns 400 when email or password is missing', async () => {
      const response = await login(
        createJsonRequest('http://localhost/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: 'owner@example.com' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Email and password are required',
      });
    });

    it('returns 401 when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await login(
        createJsonRequest('http://localhost/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: 'missing@example.com',
            password: 'password123',
          }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid credentials',
      });
    });

    it('returns 401 when the password is invalid', async () => {
      prisma.user.findUnique.mockResolvedValue(createUserFixture());
      verifyPassword.mockResolvedValue(false);

      const response = await login(
        createJsonRequest('http://localhost/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: 'owner@example.com',
            password: 'wrong-password',
          }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid credentials',
      });
    });

    it('returns 500 when the login flow throws', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('lookup failed'));

      const response = await login(
        createJsonRequest('http://localhost/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: 'owner@example.com',
            password: 'password123',
          }),
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Internal server error',
      });
    });
  });

  describe('GET /api/auth/profile', () => {
    it('returns 401 when the Authorization header is missing', async () => {
      const response = await getProfile(createJsonRequest('http://localhost/api/auth/profile'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Unauthorized',
      });
    });

    it('returns 401 when the token payload has no email', async () => {
      const response = await getProfile(
        createJsonRequest('http://localhost/api/auth/profile', {
          headers: {
            Authorization: `Bearer ${createDecodedToken({ email: '' })}`,
          },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid token',
      });
    });

    it('returns 404 when the profile is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await getProfile(
        createJsonRequest('http://localhost/api/auth/profile', {
          headers: {
            Authorization: `Bearer ${createDecodedToken()}`,
          },
        }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'User not found',
      });
    });

    it('returns the user profile for a valid token', async () => {
      const user = createUserFixture();
      prisma.user.findUnique.mockResolvedValue(user);

      const response = await getProfile(
        createJsonRequest('http://localhost/api/auth/profile', {
          headers: {
            Authorization: `Bearer ${createDecodedToken()}`,
          },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    });

    it('returns 500 when fetching the profile throws', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('profile lookup failed'));

      const response = await getProfile(
        createJsonRequest('http://localhost/api/auth/profile', {
          headers: {
            Authorization: `Bearer ${createDecodedToken()}`,
          },
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Internal server error',
      });
    });
  });

  describe('PATCH /api/auth/profile', () => {
    it('returns 401 when the Authorization header is missing', async () => {
      const response = await updateProfile(
        createJsonRequest('http://localhost/api/auth/profile', {
          method: 'PATCH',
          body: JSON.stringify({ firstName: 'Updated', lastName: 'Name' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Unauthorized',
      });
    });

    it('returns 401 when the decoded token does not include an email', async () => {
      const response = await updateProfile(
        createJsonRequest('http://localhost/api/auth/profile', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${createDecodedToken({ email: '' })}`,
          },
          body: JSON.stringify({ firstName: 'Updated', lastName: 'Name' }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid token',
      });
    });

    it('updates the profile for the authenticated user', async () => {
      const updatedUser = createUserFixture({
        firstName: 'Updated',
        lastName: 'Profile',
      });
      prisma.user.update.mockResolvedValue(updatedUser);

      const response = await updateProfile(
        createJsonRequest('http://localhost/api/auth/profile', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${createDecodedToken()}`,
          },
          body: JSON.stringify({
            firstName: 'Updated',
            lastName: 'Profile',
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'owner@example.com' },
          data: {
            firstName: 'Updated',
            lastName: 'Profile',
          },
        }),
      );
      await expect(response.json()).resolves.toEqual({
        success: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
        },
      });
    });

    it('returns 500 when updating the profile throws', async () => {
      prisma.user.update.mockRejectedValue(new Error('update failed'));

      const response = await updateProfile(
        createJsonRequest('http://localhost/api/auth/profile', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${createDecodedToken()}`,
          },
          body: JSON.stringify({
            firstName: 'Updated',
            lastName: 'Profile',
          }),
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Internal server error',
      });
    });
  });

  describe('GET /api/auth/recovery-key', () => {
    it('returns 401 when the Authorization header is missing', async () => {
      const response = await getRecoveryKey(createJsonRequest('http://localhost/api/auth/recovery-key'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Unauthorized',
      });
    });

    it('returns 401 when the decoded token does not include an email', async () => {
      const response = await getRecoveryKey(
        createJsonRequest('http://localhost/api/auth/recovery-key', {
          headers: {
            Authorization: `Bearer ${createDecodedToken({ email: '' })}`,
          },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid token',
      });
    });

    it('returns 404 when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await getRecoveryKey(
        createJsonRequest('http://localhost/api/auth/recovery-key', {
          headers: {
            Authorization: `Bearer ${createDecodedToken()}`,
          },
        }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'User not found',
      });
    });

    it('returns the stored recovery key for the authenticated user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        recoveryKey: 'RECOVERY-STORED-123',
      });

      const response = await getRecoveryKey(
        createJsonRequest('http://localhost/api/auth/recovery-key', {
          headers: {
            Authorization: `Bearer ${createDecodedToken()}`,
          },
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        recoveryKey: 'RECOVERY-STORED-123',
      });
    });

    it('returns 500 when recovery key lookup throws', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('lookup failed'));

      const response = await getRecoveryKey(
        createJsonRequest('http://localhost/api/auth/recovery-key', {
          headers: {
            Authorization: `Bearer ${createDecodedToken()}`,
          },
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Internal server error',
      });
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('returns 400 when email or password is missing', async () => {
      const response = await resetPassword(
        createJsonRequest('http://localhost/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email: 'owner@example.com' }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Email and new password are required',
      });
    });

    it('returns 400 when the new password is too short', async () => {
      const response = await resetPassword(
        createJsonRequest('http://localhost/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            email: 'owner@example.com',
            newPassword: 'short',
          }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Password must be at least 8 characters',
      });
    });

    it('returns 404 when the account does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await resetPassword(
        createJsonRequest('http://localhost/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            email: 'missing@example.com',
            newPassword: 'password123',
          }),
        }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'User not found',
      });
    });

    it('hashes the new password and updates the user record', async () => {
      prisma.user.findUnique.mockResolvedValue(createUserFixture());
      prisma.user.update.mockResolvedValue(createUserFixture());

      const response = await resetPassword(
        createJsonRequest('http://localhost/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            email: 'OWNER@example.com',
            newPassword: 'password123',
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(hashPassword).toHaveBeenCalledWith('password123');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'owner@example.com' },
        data: { passwordHash: 'hashed:password123' },
      });
      await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('returns 500 when password reset throws', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('reset failed'));

      const response = await resetPassword(
        createJsonRequest('http://localhost/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            email: 'owner@example.com',
            newPassword: 'password123',
          }),
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Internal server error',
      });
    });
  });

  describe('DELETE /api/auth/delete-account', () => {
    it('returns 401 when the bearer token is missing', async () => {
      const response = await deleteAccount(createJsonRequest('http://localhost/api/auth/delete-account', {
        method: 'DELETE',
      }));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Not authenticated',
      });
    });

    it('returns 401 when the bearer token is invalid', async () => {
      const response = await deleteAccount(
        createJsonRequest('http://localhost/api/auth/delete-account', {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer invalid-token',
          },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid token',
      });
    });

    it('returns 401 when the decoded token has no userId', async () => {
      const token = createJwtToken({ userId: '' });
      const response = await deleteAccount(
        createJsonRequest('http://localhost/api/auth/delete-account', {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${token}`,
          },
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid token payload',
      });
    });

    it('deletes user-owned records and returns success', async () => {
      prisma.shareLink.deleteMany.mockResolvedValue({ count: 1 });
      prisma.share.deleteMany.mockResolvedValue({ count: 2 });
      prisma.hiddenShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.receiverTrashedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.userFavorite.deleteMany.mockResolvedValue({ count: 1 });
      prisma.file.deleteMany.mockResolvedValue({ count: 3 });
      prisma.user.delete.mockResolvedValue(createUserFixture());

      const response = await deleteAccount(
        createJsonRequest('http://localhost/api/auth/delete-account', {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${createJwtToken()}`,
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(prisma.file.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      await expect(response.json()).resolves.toEqual({
        success: true,
        message: 'Account deleted successfully',
      });
    });

    it('returns 500 when account deletion throws', async () => {
      prisma.shareLink.deleteMany.mockResolvedValue({ count: 1 });
      prisma.share.deleteMany.mockResolvedValue({ count: 1 });
      prisma.hiddenShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.receiverTrashedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.tempDeletedShare.deleteMany.mockResolvedValue({ count: 1 });
      prisma.userFavorite.deleteMany.mockResolvedValue({ count: 1 });
      prisma.file.deleteMany.mockResolvedValue({ count: 1 });
      prisma.user.delete.mockRejectedValue(new Error('delete failed'));

      const response = await deleteAccount(
        createJsonRequest('http://localhost/api/auth/delete-account', {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${createJwtToken()}`,
          },
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to delete account',
      });
    });
  });
});
