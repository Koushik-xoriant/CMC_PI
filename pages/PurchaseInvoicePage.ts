import { expect, Locator, Page } from '@playwright/test';

export class PurchaseInvoicePage {
  private readonly newInvoiceButton: Locator;
  private readonly draftRow: Locator;
  private readonly invoiceReferenceInput: Locator;
  private readonly supplierInput: Locator;
  private readonly searchInput: Locator;
  private readonly supplierOption: Locator;
  private readonly detailsCell: Locator;
  private readonly detailsInput: Locator;
  private readonly quantityInput: Locator;
  private readonly unitPriceInput: Locator;
  private readonly nominalCell: Locator;
  private readonly nominalOption: Locator;
  private readonly saveOrPostButton: Locator;
  private readonly neverPostButton: Locator;
  private readonly saveConfirmation: Locator;
  private readonly invoiceRows: Locator;
  private readonly allowPostingButton: Locator;

  constructor(private page: Page) {
    this.newInvoiceButton = page.getByRole('button', { name: /new invoice/i });
    this.draftRow = page.getByRole('row').filter({
      has: page.getByRole('button', { name: 'Unsaved', exact: true }),
    });
    this.invoiceReferenceInput = this.draftRow.getByRole('textbox').nth(0);
    this.supplierInput = this.draftRow.getByRole('textbox').nth(1);
    this.searchInput = page.getByRole('textbox', { name: 'Type to search' });
    this.supplierOption = page.getByRole('option', { name: /1STCALLS/ });
    this.detailsCell = this.draftRow.getByRole('cell').nth(11);
    this.detailsInput = this.detailsCell.locator('input');
    this.quantityInput = this.draftRow.getByRole('cell').nth(12).locator('input');
    this.unitPriceInput = this.draftRow.getByRole('cell').nth(13).locator('input');
    this.nominalCell = this.draftRow.getByRole('cell').nth(6);
    this.nominalOption = page.getByRole('option', { name: /M0064/ });
    this.saveOrPostButton = page.getByRole('button', { name: 'Save or Post' });
    this.neverPostButton = page.getByRole('button', { name: 'Never Post', exact: true });
    this.saveConfirmation = page.getByText('Changes saved successfully.');
    this.invoiceRows = page.getByRole('row');
    this.allowPostingButton = page.getByRole('button', { name: 'Allow Posting' });
  }

  async clickNewInvoice() {
    await this.newInvoiceButton.click();
  }

  async createInvoice(): Promise<string> {
    const invoiceRef = `NP-${Date.now()}`;

    await this.invoiceReferenceInput.fill(invoiceRef);
    await this.supplierInput.click();
    await this.searchInput.fill('1STCALLS');
    await this.supplierOption.click();

    await this.detailsCell.click();
    await this.detailsInput.fill('Playwright Never Post test');
    await this.quantityInput.fill('1');
    await this.unitPriceInput.fill('10.00');

    await this.nominalCell.click();
    await this.searchInput.fill('M0064');
    await this.nominalOption.click();

    return invoiceRef;
  }

  async saveInvoiceAsNeverPost() {
    await this.saveOrPostButton.click();
    await this.neverPostButton.last().click();
    await expect(this.saveConfirmation).toBeVisible();
  }

  async verifyAllowPostingCTA(invoiceRef: string) {
    const invoiceRow = this.invoiceRows.filter({
      has: this.page.getByRole('cell', { name: invoiceRef, exact: true }),
    });

    await invoiceRow.getByRole('button', { name: 'Never Post' }).click();
    await expect(this.allowPostingButton).toBeVisible();
  }
}
