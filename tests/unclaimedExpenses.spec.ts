import { randomUUID } from 'node:crypto';
import { Locator } from '@playwright/test';
import { UnclaimedExpensesPage } from '../pages/UnclaimedExpensesPage';
import scenario from '../test-data/unclaimed-expenses.json';
import { expect, test } from '../utils/fixtures';
import { recordTestTraceability } from '../utils/traceability';

test(
  `${scenario.testCaseId}: ${scenario.testCaseTitle} @smoke`,
  async ({ expensesPage }, testInfo) => {
    await recordTestTraceability(testInfo, scenario);

    const uniqueSuffix = `${testInfo.retry}-${randomUUID().slice(0, 8)}`;
    let noReceiptExpense!: Awaited<ReturnType<UnclaimedExpensesPage['createManualExpense']>>;
    let withReceiptExpense!: Awaited<ReturnType<UnclaimedExpensesPage['createManualExpense']>>;
    let noReceiptRow!: Locator;
    let withReceiptRow!: Locator;

    await test.step('1. Open Labour > Unclaimed Expenses', async () => {
      await expensesPage.open();
    });

    await test.step('2. Create manual expenses with and without a receipt', async () => {
      noReceiptExpense = await expensesPage.createManualExpense({
        description: `${scenario.descriptionPrefix}-${uniqueSuffix}-NO-RECEIPT`,
        netAmount: scenario.netAmount,
        vatSelection: 'default',
        defaultVatCode: scenario.defaultVatCode,
        withReceipt: false,
      });
      withReceiptExpense = await expensesPage.createManualExpense({
        description: `${scenario.descriptionPrefix}-${uniqueSuffix}-WITH-RECEIPT`,
        netAmount: scenario.netAmount,
        vatSelection: 'random-alternative',
        defaultVatCode: scenario.defaultVatCode,
        withReceipt: true,
      });

      expect(noReceiptExpense.vatRateCode).toBe(scenario.defaultVatCode);
      expect(withReceiptExpense.vatRateCode).not.toBe(scenario.defaultVatCode);
    });

    await test.step('3, 6, 8, 9, 12-14. Verify created expense details in the list', async () => {
      noReceiptRow = await expensesPage.verifyExpenseVisible(
        noReceiptExpense,
        scenario.netAmount,
      );
      withReceiptRow = await expensesPage.verifyExpenseVisible(
        withReceiptExpense,
        scenario.netAmount,
      );
    });

    await test.step('4. Verify the Unclaimed Expenses list columns', async () => {
      await expensesPage.verifyListColumns();
    });

    await test.step('5. Verify date format and newest-first ordering', async () => {
      await expensesPage.verifyDateFormatAndDescendingOrder();
    });

    await test.step('7. Verify the manual expense type icon', async () => {
      await expensesPage.verifyManualExpenseIcon(noReceiptRow);
      await expensesPage.verifyManualExpenseIcon(withReceiptRow);
    });

    await test.step('10-11. Verify receipt icons for expenses with and without attachments', async () => {
      await expensesPage.verifyReceiptIcon(noReceiptRow, false);
      await expensesPage.verifyReceiptIcon(withReceiptRow, true);
    });

    await test.step('15-16. Verify claimed totals and footer sums', async () => {
      await expensesPage.verifyFooterTotals();
    });
  },
);
