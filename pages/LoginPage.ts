import { Locator, Page } from '@playwright/test';

export class LoginPage {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;
  private readonly rejectCookiesButton: Locator;

  constructor(private page: Page) {
    this.emailInput = page.getByPlaceholder('you@example.com');
    this.passwordInput = page.getByPlaceholder('Password');
    this.loginButton = page.getByRole('button', { name: 'Log In', exact: true });
    this.rejectCookiesButton = page.getByRole('button', {
      name: 'Reject analytics cookies',
    });
  }

  async login(username: string, password: string) {
    await this.page.goto('/supplier_purchases');
    await this.emailInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();

    if (await this.rejectCookiesButton.isVisible()) {
      await this.rejectCookiesButton.click();
    }
  }
}