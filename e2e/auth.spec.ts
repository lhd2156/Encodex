import { expect, Page, test } from '@playwright/test';
import {
  captureDialogs,
  createAppState,
  installAppMocks,
  unlockVault,
} from './test-utils';

async function openProfileMenu(page: Page) {
  await page.locator('div.h-16.border-b').getByRole('button').last().click();
}

test.describe('Auth flows', () => {
  test('signs up a new user and continues to the vault', async ({ page }) => {
    const state = createAppState({ users: [], files: [] });
    await installAppMocks(page, state);

    await page.goto('/register');
    const registerInputs = page.locator('input:not([type="checkbox"])');
    await registerInputs.nth(0).fill('Nova');
    await registerInputs.nth(1).fill('Tester');
    await registerInputs.nth(2).fill('nova@example.com');
    await registerInputs.nth(3).fill('password123');
    await registerInputs.nth(4).fill('password123');
    await page.locator('input[type="checkbox"]').nth(0).check();
    await page.locator('input[type="checkbox"]').nth(1).check();
    await page.getByRole('button', { name: /Sign up/i }).click();

    await expect(page.getByText('Account recovery')).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue to Vault/i })).toBeVisible();
    await page.getByRole('button', { name: /Continue to Vault/i }).click();

    await expect(page).toHaveURL(/\/vault$/);
    await unlockVault(page, 'password123');
    await expect(page.getByPlaceholder('Search Cloud drive')).toBeVisible();
  });

  test('logs in and logs out from the vault dropdown', async ({ page }) => {
    const state = createAppState();
    await installAppMocks(page, state);

    await page.goto('/login');
    const loginResponsePromise = page.waitForResponse((response) => {
      return response.url().includes('/api/auth/login') && response.request().method() === 'POST';
    });

    await page.locator('input').nth(0).fill('owner@example.com');
    await page.locator('input[type="password"]').first().fill('password123');
    await page.getByRole('button', { name: 'Log in' }).click();

    const loginResponse = await loginResponsePromise;
    expect(loginResponse.ok()).toBeTruthy();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('auth_token')))
      .toContain('token:');

    await page.goto('/vault');
    await unlockVault(page, 'password123');
    await expect(page.getByPlaceholder('Search Cloud drive')).toBeVisible();

    await openProfileMenu(page);
    await page.getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/login$/);
  });

  test('resets a password with the saved recovery key flow', async ({ page }) => {
    const state = createAppState();
    await installAppMocks(page, state);
    const dialogs = captureDialogs(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        'userAccounts',
        JSON.stringify([{ email: 'owner@example.com', password: 'password123' }]),
      );
      localStorage.setItem('recovery_key_owner@example.com', 'RECOVERY-KEY-123');
    });

    await page.goto('/forgot-password');
    await page.getByPlaceholder('Enter your email').fill('owner@example.com');
    await page.getByPlaceholder('Enter your recovery key').fill('RECOVERY-KEY-123');
    await page.getByRole('button', { name: /Verify/i }).click();

    await expect(page.getByText('Create new password')).toBeVisible();
    await page.getByPlaceholder('Enter new password (min. 8 characters)').fill('newpassword123');
    await page.getByPlaceholder('Confirm your new password').fill('newpassword123');
    await page.getByRole('button', { name: /Reset password/i }).click();

    await expect.poll(() => dialogs[0]).toContain('Password successfully reset');
    await expect(page).toHaveURL(/\/login$/);
  });
});
