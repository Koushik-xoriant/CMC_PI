const { spawnSync } = require('node:child_process');

function run(command) {
  return spawnSync(command, { stdio: 'inherit', shell: true }).status ?? 1;
}

// Build and archive the report even when tests fail, so every run keeps its evidence.
const testStatus = run(`npx playwright test --project=chromium ${process.argv.slice(2).join(' ')}`);
const reportStatus = run('npm run report');
const archiveStatus = reportStatus === 0 ? run('node scripts/archive-report.cjs') : reportStatus;
process.exit(testStatus || archiveStatus);
