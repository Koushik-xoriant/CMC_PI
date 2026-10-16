import { test as base, expect } from '@playwright/test';

export const test = base.extend({});

test.beforeEach(async ({ page }) => {
  await page.goto('/supplier_purchases');
});

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('screenshot', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

export { expect };
