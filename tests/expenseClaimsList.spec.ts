import { randomUUID } from 'node:crypto';
import scenario from '../test-data/expense-claims-list.json';
import { createClaimWithManualExpenses } from '../utils/claimWorkflows';
import { test } from '../utils/fixtures';
import { recordTestTraceability } from '../utils/traceability';

test(
  `${scenario.testCaseId}: ${scenario.testCaseTitle} @smoke`,
  async ({ expensesPage, claimsPage }, testInfo) => {
    await recordTestTraceability(testInfo, scenario);
    testInfo.annotations.push({
      type: 'known-defect',
      description: `${scenario.statusDefect}: claim status is not checked here; covered by a separate expected-failure test.`,
    });
    const claim = await createClaimWithManualExpenses(
      expensesPage,
      claimsPage,
      `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}`,
      2,
      scenario,
    );

    await test.step('3. Verify the Expense claims list columns', async () => {
      await claimsPage.verifyListColumns();
    });

    await test.step('4. Verify the claim date range, description, expenses and gross', async () => {
      await claimsPage.verifyClaimListed(claim);
    });

    await test.step('5. Verify the claim can be viewed from the list', async () => {
      await claimsPage.verifyClaimActions(claim);
    });
  },
);

test(
  `${scenario.testCaseId}: A saved claim is listed with status ${scenario.expectedStatus}`,
  async ({ expensesPage, claimsPage }, testInfo) => {
    // Known issue: expected to fail until it is fixed. New claims show "Error" on alpha
    // because no approval route is set up for expense claims; remove this marker once
    // a route exists and the status shows Draft.
    test.fail(true, `Known issue (${scenario.statusDefect}): ${scenario.statusDefectTitle}`);
    testInfo.annotations.push({ type: 'known-defect', description: scenario.statusDefect });
    await recordTestTraceability(testInfo, {
      ...scenario,
      impactAreas: ['expenses', 'expense-claims', 'claim-status'],
    });
    const claim = await createClaimWithManualExpenses(
      expensesPage,
      claimsPage,
      `${scenario.descriptionPrefix}-status-${randomUUID().slice(0, 8)}`,
      1,
      scenario,
    );

    await test.step(`3. Verify the claim status is ${scenario.expectedStatus}`, async () => {
      await claimsPage.verifyClaimStatus(claim, scenario.expectedStatus);
    });
  },
);
