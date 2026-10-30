import { test } from '@playwright/test';
import { ClaimExpense, CreatedClaim, ExpenseClaimsPage } from '../pages/ExpenseClaimsPage';
import { UnclaimedExpensesPage } from '../pages/UnclaimedExpensesPage';

export interface ClaimExpenseSettings {
  netAmount: string;
  defaultVatCode: string;
}

// Creates the requested number of manual expenses and saves them in a new claim. The
// expenses use the description as a prefix so each test can find its own records.
export async function createClaimWithManualExpenses(
  expensesPage: UnclaimedExpensesPage,
  claimsPage: ExpenseClaimsPage,
  description: string,
  expenseCount: number,
  settings: ClaimExpenseSettings,
): Promise<CreatedClaim> {
  let claim!: CreatedClaim;
  const expenses: ClaimExpense[] = [];
  await test.step('1. Create manual expenses for the claim', async () => {
    await expensesPage.open();
    for (let index = 1; index <= expenseCount; index += 1) {
      const expense = await expensesPage.createManualExpense({
        description: `${description}-${index}`,
        netAmount: settings.netAmount,
        vatSelection: 'default',
        defaultVatCode: settings.defaultVatCode,
        withReceipt: false,
      });
      expenses.push({ description: expense.description, grossAmount: expense.grossAmount });
    }
  });
  await test.step('2. Create and save an expense claim containing them', async () => {
    await claimsPage.openNewClaim();
    const { startDate, endDate } = await claimsPage.enterClaimDetails(description);
    await claimsPage.addExpenses(expenses);
    const grossAmount = await claimsPage.verifyClaimExpenses(expenses);
    claim = { description, startDate, endDate, expenses, grossAmount };
    await claimsPage.saveClaim(claim);
  });
  return claim;
}
