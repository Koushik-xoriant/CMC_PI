const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportDir = path.join(root, 'allure-report');
const archiveRoot = path.join(root, 'report-archive');
const summaryPath = path.join(reportDir, 'widgets', 'summary.json');

function pad(value) {
  return String(value).padStart(2, '0');
}

if (!fs.existsSync(summaryPath)) {
  throw new Error('No generated Allure report found; run "npm run report" first.');
}

// Name the archive after the run's start time so each run's evidence is easy to find.
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const started = new Date(summary.time.start);
const runName = `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())}_${pad(started.getHours())}${pad(started.getMinutes())}`;
const { passed, failed, broken, total } = summary.statistic;
const target = path.join(archiveRoot, `${runName}_${passed}-of-${total}-passed`);

if (fs.existsSync(target)) {
  console.log(`Report for this run is already archived at ${path.relative(root, target)}`);
  return;
}
fs.mkdirSync(archiveRoot, { recursive: true });
fs.cpSync(reportDir, target, { recursive: true });
const historyReport = path.join(root, 'execution-history.html');
if (fs.existsSync(historyReport)) {
  fs.copyFileSync(historyReport, path.join(target, 'execution-history.html'));
}
console.log(
  `Archived report (${passed} passed, ${failed + broken} failed of ${total}) to ${path.relative(root, target)}`,
);
