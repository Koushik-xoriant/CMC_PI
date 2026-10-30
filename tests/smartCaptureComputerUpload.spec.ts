import path from 'node:path';
import { test } from '@playwright/test';
import { UnclaimedExpensesPage } from '../pages/UnclaimedExpensesPage';
import scenario from '../test-data/smart-capture-computer-upload.json';
import { recordTestTraceability } from '../utils/traceability';

for (const receipt of scenario.receiptFixtures) {
  test(
    `${scenario.testCaseId}: ${scenario.testCaseTitle} (${receipt.format}) @smoke`,
    async ({ page }, testInfo) => {
      await recordTestTraceability(testInfo, scenario);
      const expensesPage = new UnclaimedExpensesPage(page, testInfo);
      const receiptFile = path.resolve(__dirname, '..', 'test-data', receipt.file);
      let receiptName = '';

      await test.step('1. Open Labour > Unclaimed Expenses', async () => {
        await expensesPage.open();
      });

      await test.step('2. Open the receipt smart-capture option', async () => {
        await expensesPage.openReceiptSmartCapture();
      });

      await test.step('3. Choose to upload a receipt from the computer', async () => {
        await expensesPage.openComputerReceiptUploadModal();
      });

      await test.step('4. Upload the receipt and verify it is shown in the modal', async () => {
        receiptName = await expensesPage.uploadSmartCaptureReceipt(receiptFile);
      });

      await test.step('5. Create the expense from the uploaded receipt', async () => {
        await expensesPage.createExpenseFromSmartCapture();
      });

      await test.step('6. Verify captured receipt values in the expense form', async () => {
        await expensesPage.verifySmartCapturedValues({
          vendor: scenario.expectedVendor,
          date: scenario.expectedDate,
          grossAmount: scenario.expectedGrossAmount,
          netAmount: scenario.expectedNetAmount,
          taxCode: new RegExp(scenario.expectedTaxCodePattern, 'i'),
        });
      });

      await test.step('7. Verify the receipt is attached to the expense', async () => {
        await expensesPage.verifySmartCaptureReceiptAttached(receiptName);
      });
    },
  );
}
