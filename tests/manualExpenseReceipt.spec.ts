import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Page, TestInfo } from '@playwright/test';
import { PendingTrayPage } from '../pages/PendingTrayPage';
import { UnclaimedExpensesPage } from '../pages/UnclaimedExpensesPage';
import scenario from '../test-data/manual-expense-receipt.json';
import { test } from '../utils/fixtures';
import { recordTestTraceability } from '../utils/traceability';

const receiptFiles = [
  path.resolve(__dirname, '..', 'test-data', 'receipts', 'sample.pdf'),
  path.resolve(__dirname, '..', 'test-data', 'receipts', 'sample-image.jpg'),
];

async function verifyReceiptUpload(
  page: Page,
  testInfo: TestInfo,
  expensesPage: UnclaimedExpensesPage,
  receiptUploadMethod: 'computer' | 'drag-and-drop' | 'pending-tray',
): Promise<void> {
  await recordTestTraceability(testInfo, scenario);

  // The pending-tray scenario uses the shared sample PDF kept in the tray rather than
  // seeding its own copy. Saving the expense marks it Attached, so reset it first.
  let pendingReceiptName: string | undefined;
  if (receiptUploadMethod === 'pending-tray') {
    pendingReceiptName = scenario.pendingTrayReceipt;
    const pendingTrayPage = new PendingTrayPage(page, testInfo);
    await pendingTrayPage.open();
    await pendingTrayPage.markReceiptUnprocessed(pendingReceiptName);
  }

  await expensesPage.open();

  const expense = await expensesPage.createManualExpense({
    description: `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}`,
    netAmount: scenario.netAmount,
    vatSelection: 'default',
    defaultVatCode: scenario.defaultVatCode,
    withReceipt: true,
    verifyReceiptUploadFlow: true,
    receiptUploadMethod,
    receiptFiles,
    pendingReceiptName,
  });

  const row = await expensesPage.verifyExpenseVisible(expense, scenario.netAmount);
  await expensesPage.verifyManualExpenseIcon(row);
  await expensesPage.verifyReceiptIcon(row, true);
  await expensesPage.reopenExpense(expense);
}

test(
  `${scenario.testCaseId}: Upload PDF and image receipts from computer @smoke`,
  async ({ page, expensesPage }, testInfo) => {
    await verifyReceiptUpload(page, testInfo, expensesPage, 'computer');
  },
);

test(
  `${scenario.testCaseId}: Drag and drop PDF and image receipts @smoke`,
  async ({ page, expensesPage }, testInfo) => {
    await verifyReceiptUpload(page, testInfo, expensesPage, 'drag-and-drop');
  },
);

test(
  `${scenario.testCaseId}: Attach a receipt from the pending tray @smoke`,
  async ({ page, expensesPage }, testInfo) => {
    // Allows time for the slow-loading pending tray page used to reset the receipt.
    test.slow();
    await verifyReceiptUpload(page, testInfo, expensesPage, 'pending-tray');
  },
);
