import { randomUUID } from 'node:crypto';
import scenario from '../test-data/submit-expense-claim.json';
import { createClaimWithManualExpenses } from '../utils/claimWorkflows';
import { test } from '../utils/fixtures';
import { recordTestTraceability } from '../utils/traceability';

test(
  `${scenario.testCaseId}: ${scenario.testCaseTitle} @smoke`,
  async ({ expensesPage, claimsPage }, testInfo) => {
    // Known issue: expected to fail until an approval route for expense claims is set
    // up on alpha. Once it is, a submitted claim goes to a real approver and cannot be
    // cleaned up by this test, so agree an approver test account before removing this.
    test.fail(true, `Known issue (${scenario.environmentIssue}): ${scenario.environmentIssueTitle}`);
    testInfo.annotations.push({ type: 'known-defect', description: scenario.environmentIssue });
    await recordTestTraceability(testInfo, scenario);
    const claim = await createClaimWithManualExpenses(
      expensesPage,
      claimsPage,
      `${scenario.descriptionPrefix}-${randomUUID().slice(0, 8)}`,
      1,
      scenario,
    );

    await test.step('3. Reopen the saved claim', async () => {
      await claimsPage.reopenClaim(claim);
    });

    await test.step('4. Submit the claim for approval', async () => {
      await claimsPage.submitClaim();
    });

    await test.step(`5. Verify the claim is listed as ${scenario.expectedStatus}`, async () => {
      await claimsPage.openClaimsList();
      await claimsPage.verifyClaimStatus(claim, scenario.expectedStatus);
    });
  },
);
