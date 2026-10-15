# Acceptance Smoke Tests

## Run the smoke suite

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `CMC_USERNAME` and `CMC_PASSWORD`.
3. Run all tests tagged `@smoke`:

   ```powershell
   npm run test:smoke
   ```

Run the full Playwright suite with `npm test`. Run the invoice example on its own
with `npm run test:never-post`.

## Test evidence

Every test automatically attaches a full-page screenshot, including on success.
Tracing is enabled for every test. After a run, open the HTML report and its
screenshots/traces with:

```powershell
npm run report
```

Reports are saved under `playwright-report`; raw test evidence is saved under
`test-results`.

## Adding an acceptance test

- Add one Playwright test for each independently verifiable acceptance
  criterion. Include its story/AC identifier and expected behavior in the test
  title, and add `@smoke` for tests that belong in the smoke suite.
- Import `test` from `./fixtures` (or `../fixtures` from a nested test folder)
  so the test's screenshot is attached automatically. Import `expect` from
  `@playwright/test` if the test needs assertions.
- Tests using this shared fixture are logged in before each test. Credentials
  are read from `CMC_USERNAME` and `CMC_PASSWORD` in `.env`.
- Use `page.goto('/path')` for application pages; the application host is set
  as Playwright's `baseURL`.
- Use unique test data for records created by a test; do not depend on records
  left behind by earlier runs.

The invoice example generates a fresh invoice reference every run. It creates a
real invoice in the configured Construction Manager environment; created
invoices are not deleted.
