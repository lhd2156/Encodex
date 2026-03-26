import { expect, test } from '@playwright/test';
import {
  createAppState,
  createFile,
  createShare,
  installAppMocks,
  seedAuthenticatedPage,
  unlockVault,
} from './test-utils';

test.describe('Metadata flows', () => {
  test('favorites a file and removes it from the favourites tab', async ({ page }) => {
    const state = createAppState({
      files: [createFile({ id: 'file-1', name: 'favorite-me.txt' })],
    });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);

    await page.goto('/vault');
    await unlockVault(page, 'password123');

    const row = page.locator('[data-file-id="file-1"]');
    await row.hover();
    await row.getByTitle('Add to favorites').click();

    await page.getByRole('button', { name: /Favourites/i }).click();
    const favouriteRow = page.locator('[data-file-id="file-1"]');
    await expect(favouriteRow).toBeVisible();

    await favouriteRow.hover();
    await favouriteRow.getByTitle('Remove from favorites').click();
    await expect(page.locator('[data-file-id="file-1"]')).toHaveCount(0);
  });

  test('bulk-selects files and moves them to the recycle bin', async ({ page }) => {
    const state = createAppState({
      files: [
        createFile({ id: 'file-1', name: 'bulk-a.txt' }),
        createFile({ id: 'file-2', name: 'bulk-b.txt' }),
      ],
    });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);

    await page.goto('/vault');
    await unlockVault(page, 'password123');

    await page.getByRole('button', { name: /Select all/i }).click();
    await expect(page.getByText('2 items selected')).toBeVisible();
    await page.getByRole('button', { name: 'Move to trash' }).click();

    await page.getByRole('button', { name: /Rubbish bin|Recycle bin/i }).click();
    await expect(page.locator('[data-file-id="file-1"]')).toBeVisible();
    await expect(page.locator('[data-file-id="file-2"]')).toBeVisible();
  });

  test('permanently hides a received shared file after deleting it from trash', async ({ page }) => {
    const state = createAppState({
      files: [
        createFile({
          id: 'shared-1',
          userId: 'user-1',
          ownerEmail: 'owner@example.com',
          ownerName: 'Owner Example',
          name: 'hidden-share.txt',
        }),
      ],
      shares: [
        createShare({
          id: 'share-1',
          fileId: 'shared-1',
          fileName: 'hidden-share.txt',
          recipientEmail: 'recipient@example.com',
          recipientName: 'Recipient Example',
          permissions: 'edit',
        }),
      ],
    });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[1], 'password123');

    await page.goto('/vault');
    await unlockVault(page, 'password123');

    await page.getByRole('button', { name: /Shared items/i }).click();
    const sharedRow = page.locator('[data-file-id="shared-1"]');
    await expect(sharedRow).toBeVisible();

    await sharedRow.hover();
    await sharedRow.getByTitle('More actions').click();
    await page.getByRole('button', { name: 'Move to trash' }).click();

    await page.getByRole('button', { name: /Rubbish bin|Recycle bin/i }).click();
    const trashedRow = page.locator('[data-file-id="shared-1"]');
    await expect(trashedRow).toBeVisible();

    await trashedRow.hover();
    await trashedRow.getByTitle('Delete permanently').click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page.locator('[data-file-id="shared-1"]')).toHaveCount(0);

    await page.getByRole('button', { name: /Shared items/i }).click();
    await expect(page.locator('[data-file-id="shared-1"]')).toHaveCount(0);
  });
});
