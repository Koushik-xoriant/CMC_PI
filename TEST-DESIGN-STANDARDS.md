# Test Design Standards

Use these guidelines when adding or changing an automated test.

## Design the test

- Link each business test to its requirement and testcase ID.
- Use a readable title in the format `TESTCASE-ID: What the user should verify`.
- Keep a test focused on one business outcome. Related setup steps and checks that support that outcome may stay together.
- Assert observable application behavior, not implementation details.
- Use unique test data when the application retains records. Do not assume a previous run cleaned up its data.

## Keep tests reusable and maintainable

- Put page-specific navigation, actions, and checks in the relevant page object under `pages/`.
- Keep shared framework behavior in `utils/`; avoid copying the same workflow or helper into multiple tests.
- Store scenario values and traceability metadata in `test-data/` when they should be readable or configurable independently of test code.
- Keep test files focused on scenario flow: arrange the scenario, call page-object actions, and assert the expected outcome.
- Prefer clear, explicit locators and assertions. Add only known, approved locator alternatives; do not guess at elements.

## Follow framework conventions

- Use Playwright Test and TypeScript, and run `npm run typecheck` after changes.
- Record traceability metadata with `recordTestTraceability`.
- Keep tests independent; do not rely on execution order or state left by another test.
- Do not enable retries for tests that create retained business records unless safe cleanup or idempotency is implemented and verified.
- Preserve the configured evidence and reporting behavior. Do not commit credentials, authentication state, or generated run artifacts.

## Before submitting a new test

- Confirm the testcase ID, requirement, and expected business outcome.
- Check whether a page object or utility already supports the required workflow.
- Verify that test data is unique and safe for the configured test environment.
- Run `npm run typecheck` and `npx playwright test --list`.
- For live tests that create records, use an approved test account and tell the team what data the run will leave behind.
