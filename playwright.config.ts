import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  outputDir: 'test-results',

  use: {
    browserName: 'chromium',
    baseURL: 'https://alpha.constructionmanager.net',
    headless: false,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on'
  }
});
