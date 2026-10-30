import { randomUUID } from 'node:crypto';
import { ClaimExpense, CreatedClaim } from '../pages/ExpenseClaimsPage';
import { PendingTrayPage } from '../pages/PendingTrayPage';
import scenario from '../test-data/new-expense-claim.json';
import { test } from '../utils/fixtures';
import { recordTestTraceability } from '../utils/traceability';

test(
  `${scenario.testCaseId}: ${scenario.testCaseTitle} @smoke`,
  async ({ page, expensesPage, claimsPage }, testInfo) => {
    // Allows time for the slow-loading pending tray page used to reset the receipt.
    test.slow();
    await recordTestTraceability(testInfo, scenario);
    testInfo.annotations.push({
      type: 'pending-check',
      description: 'Claim status is not checked: new claims show "Error" on alpha while the test account setup is confirmed.',
    });
    const description = `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}`;
    let expenses!: ClaimExpense[];
    let claim!: CreatedClaim;

    await test.step('1. Make the shared pending tray receipt available', async () => {
      // Saving an expense marks the receipt Attached, which hides it from the picker.
      const pendingTrayPage = new PendingTrayPage(page, testInfo);
      await pendingTrayPage.open();
      await pendingTrayPage.markReceiptUnprocessed(scenario.pendingTrayReceipt);
    });

    await test.step('2. Create a manual and a mileage expense, each with a receipt', async () => {
      await expensesPage.open();
      const manualExpense = await expensesPage.createManualExpense({
        description: `${description}-MANUAL`,
        netAmount: scenario.netAmount,
        vatSelection: 'default',
        defaultVatCode: scenario.defaultVatCode,
        withReceipt: true,
      });
      const mileageExpense = await expensesPage.createMileageExpense({
        description: `${description}-MILEAGE`,
        routeFrom: scenario.routeFrom,
        routeTo: scenario.routeTo,
        vehicleOwnership: scenario.vehicleOwnership as 'Company car',
        pendingReceiptName: scenario.pendingTrayReceipt,
      });
      expenses = [manualExpense, mileageExpense].map(({ description, grossAmount }) => ({
        description,
        grossAmount,
      }));
    });

    await test.step('3. Open a new expense claim and verify the form', async () => {
      await claimsPage.openNewClaim();
      await claimsPage.verifyNewClaimForm();
    });

    await test.step('4. Enter the claim details and add both expenses', async () => {
      const { startDate, endDate } = await claimsPage.enterClaimDetails(description);
      await claimsPage.addExpenses(expenses);
      const grossAmount = await claimsPage.verifyClaimExpenses(expenses);
      claim = { description, startDate, endDate, expenses, grossAmount };
    });

    await test.step('5. Save the claim and verify it in the Expense claims list', async () => {
      await claimsPage.saveClaim(claim);
      await claimsPage.verifyClaimListed(claim);
    });

    await test.step('6. Reopen the claim and verify its expenses and total', async () => {
      await claimsPage.reopenClaim(claim);
      await claimsPage.verifyClaimExpenses(expenses);
    });

    await test.step('7. Verify the claimed expenses are no longer unclaimed', async () => {
      await expensesPage.verifyExpensesNotUnclaimed(expenses.map((expense) => expense.description));
    });
  },
);
