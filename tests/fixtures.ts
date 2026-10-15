import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

export const test = base.extend({});

test.beforeEach(async ({ page }) => {
  const { CMC_USERNAME: username, CMC_PASSWORD: password } = process.env;
  if (!username || !password) {
    throw new Error('Set CMC_USERNAME and CMC_PASSWORD before running tests.');
  }

  await new LoginPage(page).login(username, password);
});

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('screenshot', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

export { expect };
