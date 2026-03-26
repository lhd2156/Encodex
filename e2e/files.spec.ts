import { expect, test } from '@playwright/test';
import {
  createAppState,
  createFile,
  installAppMocks,
  seedAuthenticatedPage,
  unlockVault,
} from './test-utils';

test.describe('File flows', () => {
  test('uploads a file and renames it from the table actions', async ({ page }) => {
    const state = createAppState({ files: [] });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);

    await page.goto('/vault');
    await unlockVault(page, 'password123');

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello from playwright'),
    });

    const row = page.locator('[data-file-id]').filter({ hasText: 'notes.txt' }).first();
    await expect(row).toBeVisible();
    await row.hover();
    await row.getByTitle('Rename').click();
    await page.getByPlaceholder('Enter file name...').fill('renamed-notes.txt');
    await page.getByRole('button', { name: 'Rename', exact: true }).last().click();

    await expect(page.getByText('renamed-notes.txt')).toBeVisible();
  });

  test('downloads, trashes, restores, and permanently deletes a file', async ({ page }) => {
    const state = createAppState({
      files: [
        createFile({
          id: 'file-1',
          name: 'report.txt',
          encryptedData: Array.from(Buffer.from('downloadable report')),
        }),
      ],
    });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);

    await page.goto('/vault');
    await unlockVault(page, 'password123');

    const row = page.locator('[data-file-id="file-1"]');
    await expect(row).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await row.hover();
    await row.getByTitle('Download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('report.txt');

    await row.getByTitle('More actions').click();
    await page.getByRole('button', { name: 'Move to trash' }).click();
    await expect(page.getByText('report.txt')).not.toBeVisible();

    await page.getByRole('button', { name: /Rubbish bin|Recycle bin/i }).click();
    const trashedRow = page.locator('[data-file-id="file-1"]');
    await expect(trashedRow).toBeVisible();

    await trashedRow.hover();
    await trashedRow.getByTitle('Restore').click();
    await expect(page.getByText('report.txt')).not.toBeVisible();

    await page.getByRole('button', { name: /Cloud drive/i }).click();
    await expect(page.locator('[data-file-id="file-1"]')).toBeVisible();

    await row.hover();
    await row.getByTitle('More actions').click();
    await page.getByRole('button', { name: 'Move to trash' }).click();
    await page.getByRole('button', { name: /Rubbish bin|Recycle bin/i }).click();
    await expect(trashedRow).toBeVisible();

    await trashedRow.hover();
    await trashedRow.getByTitle('Delete permanently').click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page.locator('[data-file-id="file-1"]')).toHaveCount(0);
  });
});
