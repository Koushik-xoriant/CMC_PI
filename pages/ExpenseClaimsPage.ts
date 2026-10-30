import { expect, Locator, Page, TestInfo } from '@playwright/test';
import { resolveLocator } from '../utils/locatorResolver';

export interface ClaimExpense {
  description: string;
  grossAmount: string;
}

export interface CreatedClaim {
  description: string;
  startDate: string;
  endDate: string;
  expenses: ClaimExpense[];
  grossAmount: string;
}

export class ExpenseClaimsPage {
  private readonly descriptionInput: Locator;
  private readonly createdClaims: (CreatedClaim & { id: number })[] = [];

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {
    this.descriptionInput = page.getByRole('textbox', { name: 'Enter description', exact: true });
  }

  async openNewClaim(): Promise<void> {
    // Call from any Expenses page; the sub-navigation shows the New expense claim button.
    const newClaimButton = await resolveLocator(
      this.testInfo,
      'New expense claim button',
      [
        {
          name: 'accessible button name',
          locator: this.page.getByRole('button', { name: 'New expense claim', exact: true }),
        },
      ],
    );
    await newClaimButton.click();
    await expect(this.page).toHaveURL(/\/expenses\/claims\/new$/);
    await expect(this.page.getByRole('heading', { name: 'New expense claim', exact: true })).toBeVisible();
  }

  async verifyNewClaimForm(): Promise<void> {
    // CMC-33715: description, dates, notes and a save button; CMC-30197: total starts at
    // 0.00 and Submit for approval is inactive.
    await expect(this.descriptionInput).toBeVisible();
    await expect(this.dateInputs()).toHaveCount(2);
    await expect(this.page.getByRole('textbox', { name: 'Notes', exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Save expense claim', exact: true })).toBeVisible();
    await expect(this.totalAmount()).toHaveText(/^\s*0\.00\s*$/);
    await expect(this.page.getByRole('button', { name: 'Submit for approval', exact: true })).toBeDisabled();
  }

  async enterClaimDetails(description: string): Promise<{ startDate: string; endDate: string }> {
    await this.descriptionInput.fill(description);
    // The form defaults the claim period to the current month.
    const startDate = await this.dateInputs().first().inputValue();
    const endDate = await this.dateInputs().last().inputValue();
    for (const date of [startDate, endDate]) {
      expect(date, 'Claim dates must use DD/MM/YYYY format.').toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
    return { startDate, endDate };
  }

  async addExpenses(expenses: ClaimExpense[]): Promise<void> {
    await this.page.getByRole('button', { name: 'Add expenses', exact: true }).click();
    // CMC-33716: unclaimed expenses are listed with checkboxes and the add button
    // stays disabled until one is selected.
    const addButton = this.page.getByRole('button', { name: 'add to expense claim', exact: true });
    for (const expense of expenses) {
      await expect(this.expenseRow(expense.description)).toHaveCount(1, { timeout: 30_000 });
    }
    await expect(addButton).toBeDisabled();
    for (const expense of expenses) {
      await this.selectExpenseRow(expense.description);
    }
    await expect(addButton).toBeEnabled();
    await addButton.click();
    await expect(addButton).toBeHidden();
  }

  async verifyClaimExpenses(expenses: ClaimExpense[]): Promise<string> {
    // Call while the claim form is open; returns the claim's gross total.
    const totalCents = expenses.reduce(
      (total, expense) => total + Math.round(Number(expense.grossAmount) * 100),
      0,
    );
    for (const expense of expenses) {
      const row = this.expenseRow(expense.description);
      await expect(row).toHaveCount(1);
      expect(
        Math.round(this.parseCurrency(await row.getByRole('cell').last().innerText()) * 100),
        `The claim should show the gross amount of "${expense.description}".`,
      ).toBe(Math.round(Number(expense.grossAmount) * 100));
    }
    const grossAmount = (totalCents / 100).toFixed(2);
    expect(
      Math.round(this.parseCurrency(await this.totalAmount().innerText()) * 100),
      'The claim total should be the sum of its expenses.',
    ).toBe(totalCents);
    return grossAmount;
  }

  async saveClaim(claim: CreatedClaim): Promise<void> {
    // The new claim's id is kept so clean-up can open it directly.
    const createResponse = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/claims',
    );
    await this.page.getByRole('button', { name: 'Save expense claim', exact: true }).click();
    const response = await createResponse;
    expect(response.ok(), `Saving the claim failed with HTTP ${response.status()}.`).toBe(true);
    const { data } = await response.json();
    this.createdClaims.push({ ...claim, id: data.id });
    // CMC-30207: saving returns to the Expense claims list.
    await expect(this.page).toHaveURL(/\/expenses\/claims(?:\?.*)?$/, { timeout: 60_000 });
    await expect(this.claimRow(claim.description)).toHaveCount(1, { timeout: 60_000 });
  }

  async submitClaim(): Promise<void> {
    // Call while a saved claim is open. The application shows no message when a
    // submission is refused, so the refusal reason is recorded for the report.
    const submitButton = this.page.getByRole('button', { name: 'Submit for approval', exact: true });
    await expect(submitButton).toBeEnabled();
    const submitResponse = this.page.waitForResponse((response) =>
      /^\/api\/v1\/claims\/submit\/\d+$/.test(new URL(response.url()).pathname),
    );
    await submitButton.click();
    const result = await (await submitResponse).json();
    if (!result.success) {
      this.testInfo.annotations.push({ type: 'submit-refused', description: String(result.error) });
    }
  }

  async openClaimsList(): Promise<void> {
    await this.page.goto('/expenses/claims', { waitUntil: 'domcontentloaded' });
    await expect(this.page.getByRole('columnheader', { name: 'Date range', exact: true })).toBeVisible({
      timeout: 60_000,
    });
  }

  async verifyClaimListed(claim: CreatedClaim): Promise<void> {
    const row = this.claimRow(claim.description);
    await expect(row).toHaveCount(1);
    // The claims list has no selection column, so the date range is the first cell.
    const cells = row.getByRole('cell');
    await expect(cells.nth(0)).toHaveText(`${claim.startDate} - ${claim.endDate}`);
    await expect(cells.nth(1)).toHaveText(claim.description);
    await expect(cells.nth(2)).toHaveText(String(claim.expenses.length));
    await expect(cells.nth(2).locator('eq2-icon[name="wallet"]')).toBeVisible();
    expect(
      Math.round(this.parseCurrency(await cells.nth(3).innerText()) * 100),
      'The claims list should show the claim gross total.',
    ).toBe(Math.round(Number(claim.grossAmount) * 100));
  }

  async verifyListColumns(): Promise<void> {
    // CMC-33712: Date range, Description, No. of expenses, Gross and Status, plus the
    // View action.
    const headers = (
      await this.page.getByRole('row').first().getByRole('columnheader').allTextContents()
    ).map((header) => header.trim());
    expect(headers).toEqual(['Date range', 'Description', 'No. of expenses', 'GROSS', 'Status', 'Action']);
  }

  async verifyClaimActions(claim: CreatedClaim): Promise<void> {
    const cells = this.claimRow(claim.description).getByRole('cell');
    await expect(cells.nth(5).getByRole('button', { name: 'View', exact: true })).toBeVisible();
  }

  async verifyClaimStatus(claim: CreatedClaim, status: string): Promise<void> {
    const statusCell = this.claimRow(claim.description).getByRole('cell').nth(4);
    await expect(statusCell, `A saved claim should have status "${status}".`).toHaveText(status);
    await expect(statusCell.locator('eq2-status-pill')).toBeVisible();
  }

  async reopenClaim(claim: CreatedClaim): Promise<void> {
    await this.claimRow(claim.description).getByRole('button', { name: 'View', exact: true }).click();
    await expect(this.descriptionInput).toHaveValue(claim.description, { timeout: 60_000 });
    await expect(this.dateInputs().first()).toHaveValue(claim.startDate);
    await expect(this.dateInputs().last()).toHaveValue(claim.endDate);
  }

  async cleanUpCreatedClaims(removeExpenses: boolean): Promise<void> {
    if (this.createdClaims.length === 0) {
      return;
    }
    // Claims cannot be deleted in the application, so each run leaves its claim behind.
    await this.testInfo.attach('created-claims', {
      body: JSON.stringify(
        {
          outcome: removeExpenses
            ? 'Expenses removed from the claim so they can be deleted; the empty claim remains because claims cannot be deleted.'
            : 'Kept with its expenses for investigation because the test failed.',
          claims: this.createdClaims.map((claim) => ({
            id: claim.id,
            description: claim.description,
            expenses: claim.expenses.map((expense) => expense.description),
          })),
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    if (!removeExpenses) {
      return;
    }

    for (const claim of this.createdClaims) {
      await this.page.goto(`/expenses/claims/${claim.id}`, { waitUntil: 'domcontentloaded' });
      await expect(this.descriptionInput).toHaveValue(claim.description, { timeout: 60_000 });
      for (const expense of claim.expenses) {
        await this.selectExpenseRow(expense.description);
      }
      await this.page.getByRole('button', { name: 'Remove from claim', exact: true }).click();
      for (const expense of claim.expenses) {
        await expect(this.expenseRow(expense.description)).toHaveCount(0, { timeout: 30_000 });
      }
    }
  }

  private async selectExpenseRow(description: string): Promise<void> {
    const row = this.expenseRow(description);
    // The checkbox icon sits over the native input and receives the click.
    await row.locator('eq2-icon[name="checkbox_unchecked"]').click();
    await expect(row.getByRole('checkbox')).toBeChecked();
  }

  private expenseRow(description: string): Locator {
    return this.page.getByRole('row').filter({
      has: this.page.getByRole('cell', { name: description, exact: true }),
    });
  }

  private claimRow(description: string): Locator {
    return this.page.getByRole('row').filter({
      has: this.page.getByRole('button', { name: description, exact: true }),
    });
  }

  private dateInputs(): Locator {
    return this.page.locator('input[placeholder="dd/mm/yyyy"]');
  }

  private totalAmount(): Locator {
    return this.page.locator('.totals-section .gross-column .total-amount');
  }

  private parseCurrency(value: string): number {
    const amount = Number(value.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(amount)) {
      throw new Error(`Unable to parse claim currency value "${value}".`);
    }
    return amount;
  }
}
