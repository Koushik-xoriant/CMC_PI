import { randomInt, randomUUID } from 'node:crypto';
import { CreatedExpense, UnclaimedExpensesPage } from '../pages/UnclaimedExpensesPage';
import scenario from '../test-data/edit-manual-expense.json';
import { expect, test } from '../utils/fixtures';
import { recordTestTraceability } from '../utils/traceability';

function randomGrossAmount(): string {
  const grossCents = randomInt(
    Math.round(Number(scenario.editedGrossMinimum) * 100),
    Math.round(Number(scenario.editedGrossMaximum) * 100) + 1,
  );
  return (grossCents / 100).toFixed(2);
}

async function createAndReopenExpense(
  expensesPage: UnclaimedExpensesPage,
  description: string,
): Promise<CreatedExpense> {
  let expense!: CreatedExpense;
  await test.step('1. Open Labour > Unclaimed Expenses', async () => {
    await expensesPage.open();
  });
  await test.step('2. Create a manual expense with a receipt', async () => {
    expense = await expensesPage.createManualExpense({
      description,
      netAmount: scenario.netAmount,
      vatSelection: 'default',
      defaultVatCode: scenario.defaultVatCode,
      withReceipt: true,
    });
  });
  await test.step('3. Open the saved expense and verify its values', async () => {
    await expensesPage.reopenExpense(expense);
  });
  return expense;
}

test(
  `${scenario.testCaseId}: ${scenario.testCaseTitle} @smoke`,
  async ({ expensesPage }, testInfo) => {
    await recordTestTraceability(testInfo, scenario);
    testInfo.annotations.push({
      type: 'known-defect',
      description: `${scenario.knownDefect}: Net is not recalculated when only Gross is edited; covered by a separate expected-failure test.`,
    });
    const description = `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}`;
    const expense = await createAndReopenExpense(expensesPage, description);
    let editedExpense!: CreatedExpense;

    await test.step('4. Edit the description, VAT rate and amounts, then save', async () => {
      editedExpense = await expensesPage.editExpense(expense, {
        description: `${description}-EDITED`,
        grossAmount: randomGrossAmount(),
        vatSelection: 'random-alternative',
        defaultVatCode: scenario.defaultVatCode,
        // Half-penny VAT amounts change Gross on save; that is covered separately.
        grossRoundTrip: 'stable',
      });
      expect(editedExpense.vatRateCode).not.toBe(expense.vatRateCode);
    });

    await test.step('5. Verify the list shows the edited expense', async () => {
      const row = await expensesPage.verifyExpenseVisible(editedExpense, editedExpense.netAmount);
      await expensesPage.verifyReceiptIcon(row, true);
    });

    await test.step('6. Reopen the expense and verify the edited values are displayed', async () => {
      await expensesPage.reopenExpense(editedExpense);
    });
  },
);

test(
  `${scenario.testCaseId}: Net is recalculated when Gross is edited`,
  async ({ expensesPage }, testInfo) => {
    // Remove this marker once the defect is fixed; the test then fails to signal it.
    test.fail(true, `${scenario.knownDefect}: Net is not recalculated when Gross is edited.`);
    await recordTestTraceability(testInfo, scenario);
    const expense = await createAndReopenExpense(
      expensesPage,
      `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}-RECALC`,
    );

    await test.step('4. Change only Gross and verify Net is recalculated from the VAT rate', async () => {
      await expensesPage.verifyNetRecalculatedWhenGrossEdited(expense, randomGrossAmount());
    });
  },
);

test(
  `${scenario.testCaseId}: Gross is saved as typed when VAT comes to a half penny`,
  async ({ expensesPage }, testInfo) => {
    // Known defect: expected to fail until it is fixed. Replace the defect reference
    // once it is raised in Jira.
    test.fail(true, `Known defect (${scenario.grossRoundingDefect}): ${scenario.grossRoundingDefectTitle}`);
    testInfo.annotations.push({ type: 'known-defect', description: scenario.grossRoundingDefect });
    await recordTestTraceability(testInfo, scenario);
    const description = `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}-ROUNDING`;
    const expense = await createAndReopenExpense(expensesPage, description);
    let editedExpense!: CreatedExpense;

    await test.step(`4. Edit Gross to ${scenario.halfPennyGross} at ${scenario.halfPennyVatCode}, where VAT comes to a half penny, then save`, async () => {
      // The amount reproduces the case seen on alpha: Net 298.00 at 5.25% is VAT 15.645.
      editedExpense = await expensesPage.editExpense(expense, {
        description: `${description}-EDITED`,
        grossAmount: scenario.halfPennyGross,
        vatSelection: 'default',
        defaultVatCode: scenario.halfPennyVatCode,
        grossRoundTrip: 'as-given',
      });
    });

    await test.step('5. Verify the list shows the Gross that was typed', async () => {
      await expensesPage.verifyExpenseVisible(editedExpense, editedExpense.netAmount);
    });
  },
);
