import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import os from 'node:os';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const baseURL = process.env.CMC_BASE_URL ?? 'https://alpha.constructionmanager.net';
const authFile = path.resolve(__dirname, 'playwright', '.auth', 'user.json');

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        environmentInfo: {
          'Application URL': baseURL,
          Environment: process.env.CMC_ENVIRONMENT ?? 'local',
          Browser: 'Chromium',
          'Node.js': process.version,
          'Operating system': `${os.type()} ${os.release()}`,
        },
        // Checked in order; a failure goes to the first category whose message matches.
        categories: [
          {
            name: 'Environment issues',
            messageRegex: '(?s).*(HTTP 5\\d\\d|net::ERR_|ENOTFOUND|showed the login page).*',
            matchedStatuses: ['failed', 'broken'],
          },
          {
            name: 'Test data issues',
            messageRegex: '(?s).*(should be listed as an unprocessed pending-tray receipt|in the pending tray but found|was not found for clean-up|No pending-tray attachments).*',
            matchedStatuses: ['failed', 'broken'],
          },
          {
            name: 'Locator or script issues',
            messageRegex: '(?s).*(strict mode violation|using its primary locator|locator for ".*" had).*',
            matchedStatuses: ['failed', 'broken'],
          },
          { name: 'Product defects', matchedStatuses: ['failed'] },
          { name: 'Test defects', matchedStatuses: ['broken'] },
        ],
      },
    ],
    ['./reporters/executionHistoryReporter.cjs', {}],
  ],
  outputDir: 'test-results',
  use: {
    baseURL,
    headless: false,
    navigationTimeout: 60_000,
    screenshot: 'on',
    video: 'on',
    trace: 'on',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testMatch: /\.spec\.ts$/,
      use: {
        browserName: 'chromium',
        storageState: authFile,
      },
    },
  ],
});
