import { test } from './fixtures';
import { PurchaseInvoicePage } from '../pages/PurchaseInvoicePage';

test.describe('Purchase Invoice - Never Post', () => {
  test('AC: saves the invoice with Never Post status and Allow Posting action @smoke', async ({ page }) => {
    const purchaseInvoice = new PurchaseInvoicePage(page);

    await purchaseInvoice.clickNewInvoice();

    const invoiceRef = await purchaseInvoice.createInvoice();

    await purchaseInvoice.saveInvoiceAsNeverPost();
    await purchaseInvoice.verifyAllowPostingCTA(invoiceRef);
  });
});
