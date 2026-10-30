import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { parentSuite, suite } from 'allure-js-commons';
import { LoginPage } from '../pages/LoginPage';

const authFile = path.resolve(__dirname, '..', 'playwright', '.auth', 'user.json');

setup('SETUP-001: authenticate expense transaction author', async ({ page }) => {
  await parentSuite('Setup');
  await suite('Authentication');
  const username = process.env.CMC_USERNAME;
  const password = process.env.CMC_PASSWORD;
  if (!username || !password) {
    throw new Error('Set CMC_USERNAME and CMC_PASSWORD in the local environment or CI secrets.');
  }

  await new LoginPage(page).login(username, password);
  mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
