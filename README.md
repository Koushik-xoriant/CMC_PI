# CMC UI Automation

Playwright + TypeScript tests for Construction Manager Cloud. Tests run headed
in Chromium and use Allure for reports.

## Setup

1. Install Node.js 22+ and Java 17+.
2. Run `npm ci`.
3. Copy `.env.example` to `.env`, then set `CMC_USERNAME` and `CMC_PASSWORD`
   for the approved test account. The default URL is
   `https://alpha.constructionmanager.net`.
4. Install Chromium with `npx playwright install chromium`.

## Run

- Follow [Test Design Standards](./TEST-DESIGN-STANDARDS.md) when adding or
  updating tests.
- `npm run typecheck` checks TypeScript.
- `npm test` runs the smoke tests, then generates the Allure report and saves a
  dated copy of it in `report-archive/` (for example
  `report-archive/2026-10-28_1900_9-of-10-passed/`), whether or not the tests
  pass. Each archived report includes the screenshots, videos and traces, so it
  is the lasting evidence of that run; open it with `npx allure open <folder>`.
  Run `npm run report:archive` to archive the current
  report by hand. Archives are large (about 200 MB per run), so move older ones
  to a shared drive regularly.
- Tests that create expenses delete them when they finish, if the test passed,
  so the shared Unclaimed Expenses list stays small. A failing test keeps its
  expenses for investigation. Either way, the report has a `created-expenses`
  attachment listing each expense's ID and description and what happened to it.
  Use an approved test account.
- Each test run updates `execution-history.html` with the pass/fail trend for
  the last 21 days. Run `npm run history:report` to rebuild it manually, then
  share the HTML file with seniors. History starts with the first run after
  this feature is added.
- Failed tests get an automatic failure-category suggestion. Review the
  screenshot, trace, and video, then run `npm run failure:triage` to confirm
  the category and record the root cause. The report clearly marks unreviewed
  suggestions as pending; it does not treat them as confirmed findings.
- `npm run rtm` creates a simple HTML Requirements Traceability Matrix named
  `rtm-report.html` in the project folder. Open that file in a browser to see
  each requirement and its linked automated test.
- `npm run report` generates the Allure report from the latest run.
- `npm run report:open` opens the report.
- The history report also flags tests that have passed in some runs and failed
  in others as potentially inconsistent. This is a cross-run warning, not a
  retry-based flaky-test result. Automatic retries stay off because the smoke
  tests create expense records.
- The page object has a small list of approved locator alternatives. If its
  primary locator is unavailable, it uses an alternative only when exactly
  one matching element is visible, and records that fallback in the history
  report. Ambiguous matches fail the test rather than guessing.

Java is needed only to generate the Allure report. Test results are written to
`allure-results/`, and the generated report is written to `allure-report/`.
Playwright screenshots, traces, and videos are captured for both passing and
failing tests and saved under `test-results/`.

## CMC-34050

The smoke test follows CMC-34050's workflow: open the Unclaimed Expenses page,
create manual expenses with and without receipts, and verify that the
transaction author's new expenses appear with the expected descriptions,
category, VAT rate, contract/job, and Net/VAT/Gross values. It also checks the
list columns, manual-expense type icon, receipt indicators, date format/order,
and that the footer totals equal the sums of all unclaimed expenses. The sums
come from one unpaged request to the list API, because paging through the list
can repeat or skip expenses that share a date (an accepted defect). Automatic
retries are disabled to avoid duplicate records.

## CMC-34711

The smart-capture test selects the shared `Sample image for pending tray.jpg`,
which must already be in the pending tray, through New Expense > Capture values
from a receipt, and verifies the receipt selection modal, captured
Vendor/Date/Gross/Net/Tax Code values, and receipt attachment. Expected field
values are those printed on that sample invoice. The receipt remains in the
pending tray; the expense form is not saved.

## CMC-35053

The smart-capture tests upload the sample invoice from the computer, once as an
image (`test-data/receipts/sample-image.jpg`) and once as a PDF
(`test-data/receipts/sample.pdf`), through New Expense > Capture values from a
receipt > Upload a receipt from your computer. Each verifies the upload modal,
that the receipt is shown and Create my expense is enabled, the captured
Vendor/Date/Gross/Net/Tax Code values, and the receipt attachment. Expected
values are those printed on the sample invoice. The expense form is not saved.

## CMC-35276

The smoke test creates a manual expense with a receipt at the default VAT rate
(T1), reopens it, edits its description, selects a different VAT rate, enters a
random Gross between £50.00 and £500.00 with the matching Net, and saves it. It
then verifies the list shows the edited values and no longer shows the original
description, and reopens the expense to verify every edited value and the
receipt are displayed.

A second test changes only Gross on a saved expense and expects Net to be
recalculated from the VAT rate. It is marked as expected to fail because of
defect CMC-35911, so it passes while the defect exists. When the defect is
fixed it fails with "expected to fail, but passed"; remove the `test.fail`
marker then.

## CMC-35279

The smoke test creates a manual expense with a receipt, opens it, and checks
that Delete expense asks for confirmation (Delete the expense / This cannot be
undone. Are you sure?). It cancels first and checks the expense is still open,
then deletes it and verifies it returns to the Unclaimed Expenses list and the
expense is no longer an unclaimed expense. The test does not check that the
receipt file is removed from storage, because the application does not show
deleted attachments anywhere.

## CMC-34052

The smoke tests create manual expenses and attach the sample PDF and image from
the computer upload dialog and by drag-and-drop. Each test verifies the saved
expense and receipt indicator in the Unclaimed Expenses list, then reopens the
draft and checks that its entered values and receipts were retained.
Automatic retries are disabled to avoid duplicate records. A third scenario attaches the shared
`Sample PDF for pending tray.pdf`, which must already be in the pending tray,
from the expense form's pending tray. Saving the expense marks that file as
Attached, so the test first marks it as Unprocessed on the Pending Tray page.
Only one copy of the file may be in the tray.
