const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const resultsDir = path.join(root, 'allure-results');
const reportDir = path.join(root, 'allure-report');
const archiveRoot = path.join(root, 'report-archive');

if (!fs.existsSync(resultsDir)) {
  throw new Error('No Allure results found; run the tests first.');
}

// Allure builds its trend graphs from the previous report's history, so carry it into
// the new results. Fall back to the newest archived report when no report exists.
function previousHistoryDir() {
  const current = path.join(reportDir, 'history');
  if (fs.existsSync(current)) {
    return current;
  }
  if (!fs.existsSync(archiveRoot)) {
    return undefined;
  }
  const archived = fs
    .readdirSync(archiveRoot)
    .sort()
    .reverse()
    .map((name) => path.join(archiveRoot, name, 'history'))
    .find((dir) => fs.existsSync(dir));
  return archived;
}

const historySource = previousHistoryDir();
if (historySource) {
  fs.cpSync(historySource, path.join(resultsDir, 'history'), { recursive: true });
  console.log(`Trend history copied from ${path.relative(root, historySource)}`);
} else {
  console.log('No previous report history found; trend graphs start with this run.');
}

const archivedRuns = fs.existsSync(archiveRoot) ? fs.readdirSync(archiveRoot).length : 0;
const now = new Date();
const pad = (value) => String(value).padStart(2, '0');
const runStarted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
const executor = process.env.GITHUB_ACTIONS
  ? {
      name: 'GitHub Actions',
      type: 'github',
      buildName: `${process.env.GITHUB_WORKFLOW} #${process.env.GITHUB_RUN_NUMBER}`,
      buildUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }
  : {
      name: 'Local run',
      type: 'local',
      buildName: `Local run ${runStarted}`,
    };
fs.writeFileSync(
  path.join(resultsDir, 'executor.json'),
  JSON.stringify(
    { ...executor, buildOrder: archivedRuns + 1, reportName: 'CMC Expenses automation' },
    null,
    2,
  ),
);
