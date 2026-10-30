import { expect, Locator, Page } from '@playwright/test';

export class LoginPage {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;
  private readonly acceptCookiesButton: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByPlaceholder('you@example.com');
    this.passwordInput = page.getByPlaceholder('Password');
    this.loginButton = page.getByRole('button', { name: /^log in$/i });
    this.acceptCookiesButton = page.getByRole('button', {
      name: /accept analytics cookies/i,
    });
  }

  async login(username: string, password: string): Promise<void> {
    await this.page.goto('/auth/login?redirectUrl=%2Fwelcome', {
      waitUntil: 'domcontentloaded',
    });
    await this.emailInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.page.waitForURL((url) => !url.pathname.includes('/auth/login'));

    if (await this.acceptCookiesButton.isVisible()) {
      await this.acceptCookiesButton.click();
    }

    await expect(this.page).not.toHaveURL(/\/auth\/login/);
  }
}
