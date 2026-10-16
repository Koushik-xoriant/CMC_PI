import { test } from './fixtures';
import { PurchaseInvoicePage } from '../pages/PurchaseInvoicePage';

test.describe('Purchase Invoice', () => {
  test('AC: saves the invoice with Never Post status and Allow Posting action @smoke', async ({ page }) => {
    const purchaseInvoice = new PurchaseInvoicePage(page);

    await purchaseInvoice.clickNewInvoice();

    const invoiceRef = await purchaseInvoice.createInvoice();

    await purchaseInvoice.saveInvoiceAsNeverPost();
    await purchaseInvoice.verifyAllowPostingCTA(invoiceRef);
  });

  test('AC: saves and posts invoice, then shows Edit Invoice action @smoke', async ({ page }) => {
    const purchaseInvoice = new PurchaseInvoicePage(page);

    await purchaseInvoice.clickNewInvoice();

    const invoiceRef = await purchaseInvoice.createInvoice('POST');

    await purchaseInvoice.postInvoice();
    await purchaseInvoice.verifyProcessingThenPosted(invoiceRef);
  });

  test('AC: saves invoice only with Saved-RTP status and Post, Edit Invoice, Never Post actions @smoke', async ({ page }) => {
    const purchaseInvoice = new PurchaseInvoicePage(page);

    await purchaseInvoice.clickNewInvoice();

    const invoiceRef = await purchaseInvoice.createInvoice('SAVE');

    await purchaseInvoice.saveInvoiceOnly();
    await purchaseInvoice.verifySavedRtpActions(invoiceRef);
  });
});
