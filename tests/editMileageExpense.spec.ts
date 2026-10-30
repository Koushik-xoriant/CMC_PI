import { randomUUID } from 'node:crypto';
import { CreatedMileageExpense } from '../pages/UnclaimedExpensesPage';
import scenario from '../test-data/edit-mileage-expense.json';
import { test } from '../utils/fixtures';
import { recordTestTraceability } from '../utils/traceability';

test(
  `${scenario.testCaseId}: ${scenario.testCaseTitle} @smoke`,
  async ({ expensesPage }, testInfo) => {
    await recordTestTraceability(testInfo, scenario);
    testInfo.annotations.push({
      type: 'known-defect',
      description: `${scenario.knownDefect}: the route map is not shown on a saved mileage expense; covered by a separate expected-failure test under CMC-34880.`,
    });
    const description = `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}`;
    let expense!: CreatedMileageExpense;
    let editedExpense!: CreatedMileageExpense;

    await test.step('1. Open Labour > Unclaimed Expenses', async () => {
      await expensesPage.open();
    });

    await test.step('2. Create a one-way mileage expense', async () => {
      expense = await expensesPage.createMileageExpense({
        description,
        routeFrom: scenario.routeFrom,
        routeTo: scenario.routeTo,
        vehicleOwnership: scenario.vehicleOwnership as 'Company car',
      });
    });

    await test.step('3. Open the saved expense and verify its values', async () => {
      await expensesPage.reopenMileageExpense(expense);
    });

    await test.step('4. Edit the description, switch on Return trip and change the contract, then save', async () => {
      editedExpense = await expensesPage.editMileageExpense(expense, {
        description: `${description}-EDITED`,
      });
    });

    await test.step('5. Verify the list shows the edited expense', async () => {
      await expensesPage.verifyMileageExpenseListed(editedExpense);
    });

    await test.step('6. Reopen the expense and verify the edited values are displayed', async () => {
      await expensesPage.reopenMileageExpense(editedExpense);
    });
  },
);
