import { expect, Page, test } from '@playwright/test';
import {
  createAppState,
  installAppMocks,
  seedAuthenticatedPage,
} from './test-utils';

function inputForLabel(page: Page, label: string) {
  return page.locator('label', { hasText: label }).locator('xpath=..').locator('input');
}

async function seedSettingsStorage(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'userAccounts',
      JSON.stringify([
        {
          email: 'owner@example.com',
          password: 'password123',
          firstName: 'Owner',
          lastName: 'Example',
        },
      ]),
    );
    localStorage.setItem('recovery_key_owner@example.com', 'RECOVERY-KEY-123');
  });
}

test.describe('Profile flows', () => {
  test('views and updates profile details, password, email, and recovery key access', async ({ page }) => {
    const state = createAppState();
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);
    await seedSettingsStorage(page);

    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.locator('input[type="email"]').first()).toHaveValue('owner@example.com');

    await inputForLabel(page, 'First name').fill('Updated');
    await inputForLabel(page, 'Last name').fill('Owner');
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await expect(page.getByText('Profile updated successfully!')).toBeVisible();

    await page.getByPlaceholder('Enter new password').fill('freshpassword123');
    await page.getByPlaceholder('Confirm new password').fill('freshpassword123');
    await page.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByText('Password changed successfully!')).toBeVisible();

    await page.getByPlaceholder('Enter new email').fill('updated-owner@example.com');
    await page.getByRole('button', { name: 'Change Email' }).click();
    await expect(page.getByText('Email updated successfully!')).toBeVisible();
    await expect(page.getByPlaceholder('Enter new email')).toHaveValue('updated-owner@example.com');

    await page.getByRole('button', { name: 'Back up key' }).click();
    await expect(page.getByText('Account recovery')).toBeVisible();
    await expect(page.getByText('RECOVERY-KEY-123')).toBeVisible();
  });

  test('deletes the current account from the danger zone', async ({ page }) => {
    const state = createAppState();
    await installAppMocks(page, state);
    await seedAuthenticatedPage(page, state.users[0]);
    await seedSettingsStorage(page);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Delete my account' }).click();

    await expect(page.getByText('Delete your account?')).toBeVisible();
    await page.getByPlaceholder('DELETE').fill('DELETE');
    await page.getByRole('button', { name: 'Delete permanently' }).click();

    await expect(page).toHaveURL(/\/start$/);
  });
});
