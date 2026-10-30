const fs = require('node:fs');
const path = require('node:path');

const historyPath = path.resolve(__dirname, '..', 'execution-history.jsonl');
const reportPath = path.resolve(__dirname, '..', 'execution-history.html');
const daysToShow = 21;
const oneDayMs = 24 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function readHistory() {
  if (!fs.existsSync(historyPath)) {
    return [];
  }

  return fs
    .readFileSync(historyPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      let run;
      try {
        run = JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid execution history on line ${index + 1}: ${String(error)}`);
      }

      if (
        typeof run.completedAt !== 'string' ||
        !Number.isFinite(Date.parse(run.completedAt)) ||
        !Array.isArray(run.tests)
      ) {
        throw new Error(`Execution history on line ${index + 1} has an invalid format.`);
      }
      return run;
    });
}

function countResults(run) {
  return run.tests.reduce(
    (counts, test) => {
      if (test.status === 'passed') {
        counts.passed += 1;
      } else if (test.status === 'skipped') {
        counts.skipped += 1;
      } else {
        counts.failed += 1;
      }
      return counts;
    },
    { passed: 0, failed: 0, skipped: 0 },
  );
}

function getFailureReviews(runs) {
  return runs.flatMap((run) =>
    run.tests
      .filter((test) => test.status !== 'passed' && test.status !== 'skipped')
      .map((test) => ({
        completedAt: run.completedAt,
        title: test.title,
        analysis: test.failureAnalysis ?? {
          suggestedCategory: 'unknown',
          confirmedCategory: null,
          rootCause: 'Pending review',
          errorSummary: 'No failure analysis details were recorded for this run.',
        },
      })),
  );
}

function getFlakyTests(runs) {
  const outcomesByTitle = new Map();
  for (const run of runs) {
    for (const test of run.tests) {
      if (test.status === 'skipped') {
        continue;
      }
      const outcomes = outcomesByTitle.get(test.title) ?? {
        passed: 0,
        failed: 0,
        lastOutcome: test.status,
      };
      if (test.status === 'passed') {
        outcomes.passed += 1;
      } else {
        outcomes.failed += 1;
      }
      outcomes.lastOutcome = test.status;
      outcomesByTitle.set(test.title, outcomes);
    }
  }
  return [...outcomesByTitle]
    .filter(([, outcomes]) => outcomes.passed > 0 && outcomes.failed > 0)
    .map(([title, outcomes]) => ({ title, ...outcomes }));
}

function createChart(runs) {
  if (runs.length === 0) {
    return '<p class="empty">No test runs have been recorded in the last 21 days.</p>';
  }

  const groupWidth = 54;
  const chartWidth = Math.max(720, runs.length * groupWidth + 40);
  const chartHeight = 300;
  const plotTop = 24;
  const plotHeight = 220;
  const maxTests = Math.max(1, ...runs.map((run) => run.counts.passed + run.counts.failed + run.counts.skipped));
  const barScale = plotHeight / maxTests;

  const bars = runs
    .map((run, index) => {
      const x = 30 + index * groupWidth;
      const passedHeight = run.counts.passed * barScale;
      const failedHeight = run.counts.failed * barScale;
      const skippedHeight = run.counts.skipped * barScale;
      let y = plotTop + plotHeight;
      const segments = [];
      for (const segment of [
        { value: run.counts.passed, height: passedHeight, color: '#238636' },
        { value: run.counts.failed, height: failedHeight, color: '#cf222e' },
        { value: run.counts.skipped, height: skippedHeight, color: '#8c959f' },
      ]) {
        if (segment.value === 0) {
          continue;
        }
        y -= segment.height;
        segments.push(
          `<rect x="${x}" y="${y}" width="30" height="${Math.max(1, segment.height)}" fill="${segment.color}"/>`,
        );
      }

      const date = new Date(run.completedAt).toLocaleDateString();
      const tooltip = `${date}: ${run.counts.passed} passed, ${run.counts.failed} failed, ${run.counts.skipped} skipped`;
      return `${segments.join('')}<text x="${x + 15}" y="${plotTop + plotHeight + 22}" text-anchor="middle">${index + 1}</text><title>${escapeHtml(tooltip)}</title>`;
    })
    .join('');

  return `
    <div class="chart-scroll">
      <svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Test results for the last 21 days">
        <line x1="20" y1="${plotTop + plotHeight}" x2="${chartWidth - 10}" y2="${plotTop + plotHeight}" stroke="#d0d7de"/>
        ${bars}
        <text x="20" y="286">Run number (oldest to newest)</text>
      </svg>
    </div>
    <p class="legend"><span class="passed">■</span> Passed <span class="failed">■</span> Failed <span class="skipped">■</span> Skipped. Hover over a bar for its date and counts.</p>`;
}

function generateExecutionHistoryReport() {
  const cutoff = Date.now() - daysToShow * oneDayMs;
  const runs = readHistory()
    .filter((run) => Date.parse(run.completedAt) >= cutoff)
    .sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt))
    .map((run) => ({ ...run, counts: countResults(run) }));
  const passed = runs.reduce((total, run) => total + run.counts.passed, 0);
  const failed = runs.reduce((total, run) => total + run.counts.failed, 0);
  const skipped = runs.reduce((total, run) => total + run.counts.skipped, 0);
  const completedTests = passed + failed;
  const passRate = completedTests === 0 ? 0 : Math.round((passed / completedTests) * 100);
  const failureReviews = getFailureReviews(runs);
  const flakyTests = getFlakyTests(runs);
  const locatorHealCount = runs.reduce(
    (total, run) =>
      total +
      run.tests.reduce((testTotal, test) => testTotal + (test.locatorHeals?.length ?? 0), 0),
    0,
  );
  const confirmedCategories = new Map();
  for (const failure of failureReviews) {
    if (failure.analysis.confirmedCategory) {
      const category = failure.analysis.confirmedCategory;
      confirmedCategories.set(category, (confirmedCategories.get(category) ?? 0) + 1);
    }
  }
  const pendingReviews = failureReviews.filter((failure) => !failure.analysis.confirmedCategory).length;

  const tableRows = [...runs]
    .reverse()
    .map((run) => {
      const date = new Date(run.completedAt).toLocaleString();
      const result =
        run.counts.failed > 0 ? 'Failed' : run.counts.passed > 0 ? 'Passed' : 'Skipped';
      const testNames = run.tests.map((test) => escapeHtml(test.title)).join('<br>') || 'No business tests';
      return `<tr><td>${escapeHtml(date)}</td><td>${result}</td><td>${run.counts.passed}</td><td>${run.counts.failed}</td><td>${run.counts.skipped}</td><td>${testNames}</td></tr>`;
    })
    .join('');
  const failureRows = failureReviews
    .map((failure) => {
      const date = new Date(failure.completedAt).toLocaleString();
      const category = failure.analysis.confirmedCategory
        ? `<strong>${escapeHtml(failure.analysis.confirmedCategory)}</strong><br><small>Confirmed</small>`
        : `<strong>${escapeHtml(failure.analysis.suggestedCategory ?? 'unknown')}</strong><br><small>Suggested — needs confirmation</small>`;
      const rootCause = failure.analysis.confirmedCategory
        ? escapeHtml(failure.analysis.rootCause)
        : 'Pending review';
      return `<tr><td>${escapeHtml(date)}</td><td>${escapeHtml(failure.title)}</td><td>${category}</td><td>${rootCause}</td><td>${escapeHtml(failure.analysis.errorSummary ?? '')}</td></tr>`;
    })
    .join('');
  const categorySummary = confirmedCategories.size > 0
    ? [...confirmedCategories]
        .map(([category, count]) => `<li>${escapeHtml(category)}: ${count}</li>`)
        .join('')
    : '<li>No root causes have been confirmed yet.</li>';
  const flakyRows = flakyTests
    .map(
      (test) =>
        `<tr><td>${escapeHtml(test.title)}</td><td>${test.passed}</td><td>${test.failed}</td><td>${escapeHtml(test.lastOutcome)}</td></tr>`,
    )
    .join('');
  const healedLocatorRows = runs
    .flatMap((run) =>
      run.tests.flatMap((test) =>
        (test.locatorHeals ?? []).map(
          (description) =>
            `<tr><td>${escapeHtml(new Date(run.completedAt).toLocaleString())}</td><td>${escapeHtml(test.title)}</td><td>${escapeHtml(description)}</td></tr>`,
        ),
      ),
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Test Execution History</title>
  <style>
    body { max-width: 1100px; margin: 36px auto; padding: 0 20px; color: #24292f; font: 16px/1.5 Arial, sans-serif; }
    h1 { margin-bottom: 6px; }
    .muted { color: #57606a; }
    .summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0; }
    .card { min-width: 145px; padding: 14px 18px; background: #f6f8fa; border-radius: 6px; }
    .card strong { display: block; font-size: 24px; }
    .chart { margin: 20px 0 30px; padding: 18px; border: 1px solid #d0d7de; border-radius: 6px; }
    .chart-scroll { overflow-x: auto; }
    svg { display: block; width: 100%; min-width: 720px; height: 300px; }
    svg text { fill: #57606a; font-size: 12px; }
    .legend span { margin-left: 12px; }
    .passed { color: #238636; } .failed { color: #cf222e; } .skipped { color: #8c959f; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th, td { padding: 10px; border: 1px solid #d0d7de; vertical-align: top; }
    th { background: #f6f8fa; }
    small { color: #57606a; }
    code { background: #f6f8fa; padding: 2px 4px; }
    .empty { padding: 30px; color: #57606a; text-align: center; }
  </style>
</head>
<body>
  <h1>Test Execution History</h1>
  <p class="muted">A simple view of automated test results from the last 21 days. History begins when result collection is enabled.</p>
  <section class="summary">
    <div class="card">Test runs<strong>${runs.length}</strong></div>
    <div class="card">Passed<strong class="passed">${passed}</strong></div>
    <div class="card">Failed<strong class="failed">${failed}</strong></div>
    <div class="card">Skipped<strong>${skipped}</strong></div>
    <div class="card">Pass rate<strong>${passRate}%</strong></div>
    <div class="card">Inconsistent tests<strong>${flakyTests.length}</strong></div>
    <div class="card">Locator fallbacks used<strong>${locatorHealCount}</strong></div>
  </section>
  <section class="chart">
    <h2>Results by run</h2>
    ${createChart(runs)}
  </section>
  <h2>Run details</h2>
  ${
    runs.length === 0
      ? '<p class="empty">Run <code>npm test</code> to add the first result.</p>'
      : `<div class="chart-scroll"><table><thead><tr><th>Date and time</th><th>Result</th><th>Passed</th><th>Failed</th><th>Skipped</th><th>Test cases</th></tr></thead><tbody>${tableRows}</tbody></table></div>`
  }
  <h2>Inconsistent tests</h2>
  <p class="muted">A test is flagged when it passed in some recorded runs and failed in others during this 21-day window. Automatic retries remain off to avoid duplicate expense records.</p>
  ${
    flakyTests.length === 0
      ? '<p class="empty">No tests have both passed and failed in the recorded runs.</p>'
      : `<div class="chart-scroll"><table><thead><tr><th>Test</th><th>Passed runs</th><th>Failed runs</th><th>Latest outcome</th></tr></thead><tbody>${flakyRows}</tbody></table></div>`
  }
  <h2>Self-healing locator activity</h2>
  <p class="muted">A fallback is used only from the alternatives explicitly listed in the page object. Each use is recorded so a developer can update the primary locator.</p>
  ${
    locatorHealCount === 0
      ? '<p class="empty">No fallback locators were needed in the recorded runs.</p>'
      : `<div class="chart-scroll"><table><thead><tr><th>Date and time</th><th>Test</th><th>Fallback used</th></tr></thead><tbody>${healedLocatorRows}</tbody></table></div>`
  }
  <h2>Failure classification and root-cause review</h2>
  <p class="muted">Automatic categories are suggestions only. Confirm the category and root cause after reviewing the failure evidence.</p>
  <section class="summary">
    <div class="card">Failures needing review<strong>${pendingReviews}</strong></div>
    ${[...confirmedCategories].map(([category, count]) => `<div class="card">${escapeHtml(category)}<strong>${count}</strong></div>`).join('')}
  </section>
  <ul>${categorySummary}</ul>
  ${
    failureReviews.length === 0
      ? '<p class="empty">No failed tests need analysis in the last 21 days.</p>'
      : `<div class="chart-scroll"><table><thead><tr><th>Date and time</th><th>Failed test</th><th>Failure category</th><th>Confirmed root cause</th><th>Error summary</th></tr></thead><tbody>${failureRows}</tbody></table></div>`
  }
  <p class="muted">To review a failure, run <code>npm run failure:triage</code>. Choose the failed test, confirm its category, and enter the root cause after checking its screenshot, trace, and video.</p>
  <p class="muted">Setup steps are not included in the counts. The history file is stored locally as <code>execution-history.jsonl</code>.</p>
</body>
</html>
`;

  fs.writeFileSync(reportPath, html, 'utf8');
  return reportPath;
}

if (require.main === module) {
  console.log(`Execution history report created: ${generateExecutionHistoryReport()}`);
}

module.exports = { generateExecutionHistoryReport };
