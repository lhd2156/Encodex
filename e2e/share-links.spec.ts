import { expect, Page, test } from '@playwright/test';
import {
  createAppState,
  installAppMocks,
  seedAuthenticatedPage,
  unlockVault,
} from './test-utils';

async function uploadEncryptedFile(page: Page, name: string) {
  await page.locator('input[type="file"]').first().setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(`encrypted:${name}`),
  });
  await expect(page.getByText(name)).toBeVisible();
}

test.describe('Share-link flows', () => {
  test('creates a temporary link and opens it by token', async ({ page }) => {
    const state = createAppState({ files: [] });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);

    await page.goto('/vault');
    await unlockVault(page, 'password123');
    await uploadEncryptedFile(page, 'secret.txt');

    const row = page.locator('[data-file-id]').filter({ hasText: 'secret.txt' }).first();
    await row.hover();
    await row.getByTitle('Share').click();
    await page.getByRole('button', { name: 'Create link' }).click();

    const successMessage = page.locator('text=Temporary link created:');
    await expect(successMessage).toBeVisible();
    const shareText = await successMessage.textContent();
    const shareUrl = shareText?.match(/https?:\/\/\S+/)?.[0];

    expect(shareUrl).toBeTruthy();
    await page.goto(shareUrl!);

    await expect(page.getByRole('heading', { name: 'Shared file' })).toBeVisible();
    await expect(page.getByText('secret.txt')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  });

  test('revokes an existing temporary link from the share modal', async ({ page }) => {
    const state = createAppState({ files: [] });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);

    await page.goto('/vault');
    await unlockVault(page, 'password123');
    await uploadEncryptedFile(page, 'revoke-me.txt');

    const row = page.locator('[data-file-id]').filter({ hasText: 'revoke-me.txt' }).first();
    await row.hover();
    await row.getByTitle('Share').click();
    await page.getByRole('button', { name: 'Create link' }).click();
    await expect(page.locator('text=Temporary link created:')).toBeVisible();

    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText('Temporary link revoked.')).toBeVisible();
  });
});
