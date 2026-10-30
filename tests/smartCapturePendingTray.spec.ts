import { test } from '@playwright/test';
import { UnclaimedExpensesPage } from '../pages/UnclaimedExpensesPage';
import scenario from '../test-data/smart-capture-pending-tray.json';
import { recordTestTraceability } from '../utils/traceability';

test(
  `${scenario.testCaseId}: ${scenario.testCaseTitle} @smoke`,
  async ({ page }, testInfo) => {
    await recordTestTraceability(testInfo, scenario);
    const expensesPage = new UnclaimedExpensesPage(page, testInfo);
    // Uses the shared sample image kept in the pending tray rather than seeding its own copy.
    const receiptName = scenario.pendingTrayReceipt;

    await test.step('1. Open Labour > Unclaimed Expenses', async () => {
      await expensesPage.open();
    });

    await test.step('2. Open the receipt smart-capture option', async () => {
      await expensesPage.openReceiptSmartCapture();
    });

    await test.step('3. Open the pending tray receipt selection modal', async () => {
      await expensesPage.openPendingTrayReceiptModal();
    });

    await test.step('4. Verify the pending tray receipt is listed as unprocessed', async () => {
      await expensesPage.verifySmartCaptureReceiptAvailable(receiptName);
    });

    await test.step('5. Select the pending tray receipt', async () => {
      await expensesPage.selectSmartCaptureReceipt(receiptName);
    });

    await test.step('6. Create the expense from the selected receipt', async () => {
      await expensesPage.createExpenseFromSmartCapture();
    });

    await test.step('7. Verify captured receipt values in the expense form', async () => {
      await expensesPage.verifySmartCapturedValues({
        vendor: scenario.expectedVendor,
        date: scenario.expectedDate,
        grossAmount: scenario.expectedGrossAmount,
        netAmount: scenario.expectedNetAmount,
        taxCode: new RegExp(scenario.expectedTaxCodePattern, 'i'),
      });
    });

    await test.step('8. Verify the receipt is attached to the expense', async () => {
      await expensesPage.verifySmartCaptureReceiptAttached(receiptName);
    });
  },
);
