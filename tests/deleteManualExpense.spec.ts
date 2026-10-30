import { randomUUID } from 'node:crypto';
import { CreatedExpense } from '../pages/UnclaimedExpensesPage';
import scenario from '../test-data/delete-manual-expense.json';
import { test } from '../utils/fixtures';
import { recordTestTraceability } from '../utils/traceability';

test(
  `${scenario.testCaseId}: ${scenario.testCaseTitle} @smoke`,
  async ({ expensesPage }, testInfo) => {
    await recordTestTraceability(testInfo, scenario);
    let expense!: CreatedExpense;

    await test.step('1. Open Labour > Unclaimed Expenses', async () => {
      await expensesPage.open();
    });

    await test.step('2. Create a manual expense with a receipt', async () => {
      expense = await expensesPage.createManualExpense({
        description: `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}`,
        netAmount: scenario.netAmount,
        vatSelection: 'default',
        defaultVatCode: scenario.defaultVatCode,
        withReceipt: true,
      });
    });

    await test.step('3. Open the expense and verify the form is displayed', async () => {
      await expensesPage.reopenExpense(expense);
    });

    await test.step('4. Click Delete expense and verify the confirmation is shown', async () => {
      await expensesPage.openDeleteConfirmation();
    });

    await test.step('5. Cancel and verify the expense is kept', async () => {
      await expensesPage.cancelDelete(expense);
    });

    await test.step('6. Delete the expense and confirm', async () => {
      await expensesPage.openDeleteConfirmation();
      await expensesPage.confirmDelete(expense);
    });
  },
);
