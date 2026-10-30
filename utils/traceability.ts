import type { TestInfo } from '@playwright/test';
import { epic, feature, issue, label, link, parentSuite, story, subSuite, suite, tms } from 'allure-js-commons';

export interface TestTraceability {
  testCaseId: string;
  testCaseTitle: string;
  requirementId: string;
  requirementTitle: string;
  module: string;
  feature: string;
  impactAreas: string[];
}

const jiraBrowseUrl = 'https://eque2.atlassian.net/browse';

// Smoke tests and expected-failure tests are reported as separate suites so known
// defects are easy to find; Allure otherwise lists an expected failure as passed.
function reportSuiteName(testInfo: TestInfo): string {
  if (testInfo.expectedStatus === 'failed') {
    return 'Known defects';
  }
  return testInfo.tags.includes('@smoke') ? 'Smoke suite' : 'Regression suite';
}

function knownDefectKeys(testInfo: TestInfo): string[] {
  const keys = testInfo.annotations
    .filter((annotation) => annotation.type === 'fail' || annotation.type === 'known-defect')
    .flatMap((annotation) => annotation.description?.match(/CMC-\d+/g) ?? []);
  return [...new Set(keys)];
}

export async function recordTestTraceability(
  testInfo: TestInfo,
  traceability: TestTraceability,
): Promise<void> {
  const values = [
    traceability.testCaseId,
    traceability.requirementId,
    traceability.module,
    traceability.feature,
    ...traceability.impactAreas,
  ];
  if (values.some((value) => value.trim().length === 0)) {
    throw new Error('Test traceability metadata must not contain empty values.');
  }
  if (traceability.impactAreas.length === 0) {
    throw new Error('Test traceability must include at least one impacted business area.');
  }

  testInfo.annotations.push(
    { type: 'test-id', description: traceability.testCaseId },
    { type: 'requirement', description: traceability.requirementId },
    { type: 'module', description: traceability.module },
    ...traceability.impactAreas.map((area) => ({ type: 'impact', description: area })),
  );
  const moduleName = traceability.module.charAt(0).toUpperCase() + traceability.module.slice(1);
  // The Jira key is recorded as a label rather than Allure's test case ID, because
  // several scenarios can share one Jira key and Allure would merge them as retries.
  await Promise.all([
    label('test-id', traceability.testCaseId),
    label('requirement', traceability.requirementId),
    label('module', traceability.module),
    ...traceability.impactAreas.map((area) => label('impact', area)),
    parentSuite(reportSuiteName(testInfo)),
    suite(traceability.feature),
    subSuite(`${traceability.testCaseId}: ${traceability.testCaseTitle}`),
    epic(moduleName),
    feature(traceability.feature),
    story(`${traceability.requirementId}: ${traceability.requirementTitle}`),
    tms(`${jiraBrowseUrl}/${traceability.testCaseId}`, traceability.testCaseId),
    link(
      `${jiraBrowseUrl}/${traceability.requirementId}`,
      `Requirement ${traceability.requirementId}`,
    ),
    ...knownDefectKeys(testInfo).map((key) => issue(`${jiraBrowseUrl}/${key}`, key)),
  ]);
}
