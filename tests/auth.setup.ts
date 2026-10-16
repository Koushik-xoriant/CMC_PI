import { test as setup, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { LoginPage } from '../pages/LoginPage';

const authFile = path.join(__dirname, '..', 'playwright', '.auth', 'user.json');

setup('authenticate once for the test run', async ({ page }) => {
  const { CMC_USERNAME: username, CMC_PASSWORD: password } = process.env;
  if (!username || !password) {
    throw new Error('Set CMC_USERNAME and CMC_PASSWORD before running tests.');
  }

  await new LoginPage(page).login(username, password);
  await expect(page.getByRole('button', { name: /new invoice/i })).toBeVisible({
    timeout: 60_000,
  });

  await mkdir(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
