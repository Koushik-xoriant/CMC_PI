import { randomUUID } from 'node:crypto';
import { PendingTrayPage } from '../pages/PendingTrayPage';
import { CreatedMileageExpense } from '../pages/UnclaimedExpensesPage';
import scenario from '../test-data/mileage-expense-pending-tray.json';
import { test } from '../utils/fixtures';
import { recordTestTraceability } from '../utils/traceability';

test(
  `${scenario.testCaseId}: ${scenario.testCaseTitle} @smoke`,
  async ({ page, expensesPage }, testInfo) => {
    // Allows time for the slow-loading pending tray page used to reset the receipt.
    test.slow();
    await recordTestTraceability(testInfo, scenario);
    testInfo.annotations.push({
      type: 'known-defect',
      description: `${scenario.vatDefect}: VAT on mileage is not checked here; covered by a separate expected-failure test.`,
    });
    let expense: CreatedMileageExpense;

    await test.step('1. Make the shared pending tray receipt available', async () => {
      // Saving an expense marks the receipt Attached, which hides it from the picker.
      const pendingTrayPage = new PendingTrayPage(page, testInfo);
      await pendingTrayPage.open();
      await pendingTrayPage.markReceiptUnprocessed(scenario.pendingTrayReceipt);
    });

    await test.step('2. Open Labour > Unclaimed Expenses', async () => {
      await expensesPage.open();
    });

    await test.step('3. Create a mileage expense with a receipt from the pending tray', async () => {
      expense = await expensesPage.createMileageExpense({
        description: `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}`,
        routeFrom: scenario.routeFrom,
        routeTo: scenario.routeTo,
        vehicleOwnership: scenario.vehicleOwnership as 'Company car',
        pendingReceiptName: scenario.pendingTrayReceipt,
      });
    });

    await test.step('4. Verify the list shows the expense with its receipt', async () => {
      const row = await expensesPage.verifyMileageExpenseListed(expense);
      await expensesPage.verifyReceiptIcon(row, true);
    });

    await test.step('5. Reopen the expense and verify the receipt is retained', async () => {
      await expensesPage.reopenMileageExpense(expense);
    });
  },
);

test(
  `${scenario.testCaseId}: Route map is shown when viewing a saved mileage expense`,
  async ({ expensesPage }, testInfo) => {
    // Known defect: expected to fail until it is fixed. Playwright reports an
    // unexpected pass once the map loads, which is the cue to remove this marker.
    test.fail(true, `Known defect ${scenario.routeMapDefect}: ${scenario.routeMapDefectTitle}`);
    testInfo.annotations.push({ type: 'known-defect', description: scenario.routeMapDefect });
    await recordTestTraceability(testInfo, {
      ...scenario,
      impactAreas: ['expenses', 'mileage-expenses', 'route-map'],
    });
    let expense: CreatedMileageExpense;

    await test.step('1. Open Labour > Unclaimed Expenses', async () => {
      await expensesPage.open();
    });

    await test.step('2. Create a mileage expense', async () => {
      expense = await expensesPage.createMileageExpense({
        description: `${scenario.descriptionPrefix}-map-${randomUUID().slice(0, 8)}`,
        routeFrom: scenario.routeFrom,
        routeTo: scenario.routeTo,
        vehicleOwnership: scenario.vehicleOwnership as 'Company car',
      });
    });

    await test.step('3. Reopen the expense', async () => {
      await expensesPage.reopenMileageExpense(expense);
    });

    await test.step(`4. Verify the route map is shown (${scenario.routeMapDefect})`, async () => {
      await expensesPage.verifyRouteMapShown();
    });
  },
);

test(
  `${scenario.testCaseId}: VAT is only charged on the fuel element of a mileage expense`,
  async ({ expensesPage }, testInfo) => {
    // Known defect: expected to fail until it is fixed. CMC-36433 does not state the
    // corrected figure, so this only rules out VAT on the whole amount; tighten it to
    // the agreed rule once the fix lands and Playwright reports an unexpected pass.
    test.fail(true, `Known defect ${scenario.vatDefect}: ${scenario.vatDefectTitle}`);
    testInfo.annotations.push({ type: 'known-defect', description: scenario.vatDefect });
    await recordTestTraceability(testInfo, {
      ...scenario,
      impactAreas: ['expenses', 'mileage-expenses', 'vat'],
    });
    let expense: CreatedMileageExpense;

    await test.step('1. Open Labour > Unclaimed Expenses', async () => {
      await expensesPage.open();
    });

    await test.step('2. Create a mileage expense', async () => {
      expense = await expensesPage.createMileageExpense({
        description: `${scenario.descriptionPrefix}-vat-${randomUUID().slice(0, 8)}`,
        routeFrom: scenario.routeFrom,
        routeTo: scenario.routeTo,
        vehicleOwnership: scenario.vehicleOwnership as 'Company car',
      });
    });

    await test.step(`3. Verify VAT is not charged on the whole amount (${scenario.vatDefect})`, async () => {
      await expensesPage.verifyMileageVatNotChargedOnWholeAmount(expense, scenario.standardVatRate);
    });
  },
);
