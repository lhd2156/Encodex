import { expect, test } from '@playwright/test';
import {
  createAppState,
  createFile,
  createShare,
  installAppMocks,
  seedAuthenticatedPage,
  unlockVault,
} from './test-utils';

test.describe('Sharing flows', () => {
  test('shares a file, updates permissions, and unshares it', async ({ page }) => {
    const state = createAppState({
      files: [createFile({ id: 'file-1', name: 'proposal.txt' })],
    });
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);

    await page.goto('/vault');
    await unlockVault(page, 'password123');

    const row = page.locator('[data-file-id="file-1"]');
    await row.hover();
    await row.getByTitle('Share').click();

    await page.getByPlaceholder("Enter user's email address").fill('recipient@example.com');
    await page.locator('select').last().selectOption('edit');
    await page.locator('button').filter({ hasText: /^Share$/ }).last().click();

    await expect(page.getByText('File shared successfully!')).toBeVisible();
    await page.waitForTimeout(2200);

    await row.hover();
    await row.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByText('recipient@example.com')).toBeVisible();
    await page.locator('select').first().selectOption('view');

    await page.getByPlaceholder("Enter user's email address").fill('recipient@example.com');
    await page.getByRole('button', { name: 'Unshare', exact: true }).click();

    await expect(page.getByText('File unshared successfully!')).toBeVisible();
  });

  test('shows received files in the Shared items tab', async ({ page }) => {
    const state = createAppState({
      files: [
        createFile({
          id: 'shared-1',
          userId: 'user-1',
          ownerEmail: 'owner@example.com',
          ownerName: 'Owner Example',
          name: 'shared-plan.txt',
        }),
      ],
      shares: [
        createShare({
          id: 'share-1',
          fileId: 'shared-1',
          fileName: 'shared-plan.txt',
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

    await expect(page.locator('[data-file-id="shared-1"]')).toBeVisible();
    await expect(page.getByText('shared-plan.txt')).toBeVisible();
  });
});
