import { expect, test } from '@playwright/test';
import {
  createAppState,
  createFile,
  installAppMocks,
  seedAuthenticatedPage,
  unlockVault,
} from './test-utils';

test.describe('Trash flows', () => {
  test('moves a file to the recycle bin and restores it', async ({ page }) => {
    const state = createAppState({
      files: [createFile({ id: 'file-1', name: 'restore-me.txt' })],
    });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);

    await page.goto('/vault');
    await unlockVault(page, 'password123');

    const row = page.locator('[data-file-id="file-1"]');
    await row.hover();
    await row.getByTitle('More actions').click();
    await page.getByRole('button', { name: 'Move to trash' }).click();

    await page.getByRole('button', { name: /Rubbish bin|Recycle bin/i }).click();
    await expect(page.locator('[data-file-id="file-1"]')).toBeVisible();
    await page.getByRole('button', { name: /Recover all/i }).click();

    await page.getByRole('button', { name: /Cloud drive/i }).click();
    await expect(page.locator('[data-file-id="file-1"]')).toBeVisible();
  });

  test('permanently deletes a file from the recycle bin', async ({ page }) => {
    const state = createAppState({
      files: [createFile({ id: 'file-1', name: 'delete-me.txt', isDeleted: true })],
    });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);

    await page.goto('/vault');
    await unlockVault(page, 'password123');

    await page.getByRole('button', { name: /Rubbish bin|Recycle bin/i }).click();
    const row = page.locator('[data-file-id="file-1"]');
    await expect(row).toBeVisible();
    await row.hover();
    await row.getByTitle('Delete permanently').click();
    await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();

    await expect(page.locator('[data-file-id="file-1"]')).toHaveCount(0);
  });
});
