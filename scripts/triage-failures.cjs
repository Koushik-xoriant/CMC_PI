const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { stdin, stdout } = require('node:process');
const { generateExecutionHistoryReport } = require('./generate-execution-history.cjs');

const historyPath = path.resolve(__dirname, '..', 'execution-history.jsonl');
const categories = [
  'environment',
  'test-data',
  'application-defect',
  'script-defect',
  'other',
];

function readHistoryLines() {
  if (!fs.existsSync(historyPath)) {
    return [];
  }
  return fs
    .readFileSync(historyPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      try {
        return { original: line, run: JSON.parse(line), index };
      } catch (error) {
        throw new Error(`Invalid execution history on line ${index + 1}: ${String(error)}`);
      }
    });
}

function getPendingFailures(lines) {
  const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
  const failures = [];
  for (const line of lines) {
    if (Date.parse(line.run.completedAt) < cutoff || !Array.isArray(line.run.tests)) {
      continue;
    }
    line.run.tests.forEach((test, testIndex) => {
      if (test.status !== 'passed' && test.status !== 'skipped' && test.failureAnalysis?.confirmedCategory == null) {
        failures.push({
          runLineIndex: line.index,
          testIndex,
          title: test.title,
          date: line.run.completedAt,
          failureAnalysis: test.failureAnalysis,
        });
      }
    });
  }
  return failures;
}

function createAsk(rl) {
  const queuedLines = [];
  const waitingReaders = [];
  rl.on('line', (line) => {
    const resolve = waitingReaders.shift();
    if (resolve) {
      resolve(line);
    } else {
      queuedLines.push(line);
    }
  });

  return (prompt) => {
    stdout.write(prompt);
    if (queuedLines.length > 0) {
      return Promise.resolve(queuedLines.shift());
    }
    return new Promise((resolve) => waitingReaders.push(resolve));
  };
}

async function chooseCategory(ask) {
  stdout.write('\nChoose the confirmed category:\n');
  categories.forEach((category, index) => stdout.write(`  ${index + 1}. ${category}\n`));
  const answer = await ask('Category number: ');
  const index = Number(answer) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= categories.length) {
    throw new Error('Enter a valid category number.');
  }
  return categories[index];
}

async function runTriage() {
  const lines = readHistoryLines();
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  const ask = createAsk(rl);
  try {
    while (true) {
      const pending = getPendingFailures(lines);
      if (pending.length === 0) {
        stdout.write('No failed tests are waiting for review in the last 21 days.\n');
        break;
      }

      stdout.write('\nFailed tests awaiting review:\n');
      pending.forEach((failure, index) => {
        stdout.write(
          `${index + 1}. ${new Date(failure.date).toLocaleString()} — ${failure.title}\n` +
            `   Suggested category: ${failure.failureAnalysis?.suggestedCategory ?? 'unknown'}\n` +
            `   Error summary: ${failure.failureAnalysis?.errorSummary ?? 'Not recorded'}\n`,
        );
      });
      const answer = (await ask('\nEnter a failure number to review, or Q to finish: '))
        .trim()
        .toLowerCase();
      if (answer === 'q' || answer === '') {
        break;
      }

      const selectedIndex = Number(answer) - 1;
      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= pending.length) {
        stdout.write('That number is not in the list. Please try again.\n');
        continue;
      }

      const selected = pending[selectedIndex];
      const category = await chooseCategory(ask);
      const rootCause = (await ask('Confirmed root cause: ')).trim();
      if (!rootCause) {
        stdout.write('Root cause cannot be empty. This failure remains pending review.\n');
        continue;
      }

      const line = lines.find((item) => item.index === selected.runLineIndex);
      const test = line.run.tests[selected.testIndex];
      test.failureAnalysis = {
        ...test.failureAnalysis,
        confirmedCategory: category,
        rootCause,
        reviewedAt: new Date().toISOString(),
      };
      line.original = JSON.stringify(line.run);
      stdout.write('Failure review saved.\n');
    }
  } finally {
    rl.close();
  }

  const contents = lines.map((line) => line.original).join('\n');
  if (contents) {
    fs.writeFileSync(historyPath, `${contents}\n`, 'utf8');
  }
  console.log(`Updated execution history: ${generateExecutionHistoryReport()}`);
}

runTriage().catch((error) => {
  console.error(`Failure review could not be completed: ${error.message}`);
  process.exitCode = 1;
});
