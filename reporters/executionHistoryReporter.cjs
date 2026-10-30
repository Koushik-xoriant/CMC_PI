const fs = require('node:fs');
const path = require('node:path');
const { generateExecutionHistoryReport } = require('../scripts/generate-execution-history.cjs');

function suggestFailureCategory(message) {
  if (/net::ERR_|ECONN|ENOTFOUND|ERR_CONNECTION|browser.*closed|page.*closed/i.test(message)) {
    return 'environment';
  }
  if (/test.?data|no .* available|not available|missing .*data|dropdown did not contain/i.test(message)) {
    return 'test-data';
  }
  if (/TypeError|ReferenceError|SyntaxError|No locator candidates|matched \d+ elements|visible matches/i.test(message)) {
    return 'script-defect';
  }
  if (/expected:|received:|expect\(.*\).*failed|toHaveText|toBeVisible|toBe.*failed/i.test(message)) {
    return 'application-defect';
  }
  return 'unknown';
}

function safeErrorSummary(error) {
  const message = error && typeof error.message === 'string' ? error.message : 'No error message was provided.';
  return message
    .replace(/\b(password|secret|token|authorization)\b(\s*[:=]\s*)\S+/gi, '$1$2[REDACTED]')
    .slice(0, 500);
}

class ExecutionHistoryReporter {
  constructor() {
    this.startedAt = new Date();
    this.tests = [];
  }

  onTestEnd(test, result) {
    if (test.title.startsWith('SETUP-')) {
      return;
    }

    const entry = {
      title: test.title,
      status: result.status,
      locatorHeals: test.annotations
        .filter((annotation) => annotation.type === 'locator-healed')
        .map((annotation) => annotation.description),
    };
    if (!['passed', 'skipped'].includes(result.status)) {
      const errorSummary = safeErrorSummary(result.error);
      entry.failureAnalysis = {
        suggestedCategory: suggestFailureCategory(errorSummary),
        confirmedCategory: null,
        rootCause: 'Pending review',
        errorSummary,
      };
    }
    this.tests.push(entry);
  }

  onEnd(result) {
    const completedAt = new Date();
    if (this.tests.length > 0) {
      const run = {
        startedAt: this.startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        status: result.status,
        tests: this.tests,
      };
      const historyPath = path.resolve(__dirname, '..', 'execution-history.jsonl');
      fs.appendFileSync(historyPath, `${JSON.stringify(run)}\n`, 'utf8');
    }

    generateExecutionHistoryReport();
  }
}

module.exports = ExecutionHistoryReporter;
