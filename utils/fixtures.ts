import { test as base } from '@playwright/test';
import { ExpenseClaimsPage } from '../pages/ExpenseClaimsPage';
import { UnclaimedExpensesPage } from '../pages/UnclaimedExpensesPage';

export const test = base.extend<{
  expensesPage: UnclaimedExpensesPage;
  claimsPage: ExpenseClaimsPage;
}>({
  expensesPage: async ({ page }, use, testInfo) => {
    const expensesPage = new UnclaimedExpensesPage(page, testInfo);
    await use(expensesPage);
    // Expenses from a passing test are deleted so the shared list stays small; a
    // failing test keeps them for investigation. Evidence is attached either way.
    await expensesPage.cleanUpCreatedExpenses(testInfo.status === testInfo.expectedStatus);
  },
  // Depends on expensesPage so it is torn down first: expenses must leave their claim
  // before they are unclaimed again and can be deleted.
  claimsPage: async ({ page, expensesPage }, use, testInfo) => {
    const claimsPage = new ExpenseClaimsPage(page, testInfo);
    await use(claimsPage);
    await claimsPage.cleanUpCreatedClaims(testInfo.status === testInfo.expectedStatus);
    if (testInfo.status === testInfo.expectedStatus) {
      // Clean-up reads the unclaimed list from the app's own request, so reload it.
      await expensesPage.open();
    }
  },
});

export { expect } from '@playwright/test';
