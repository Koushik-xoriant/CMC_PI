const fs = require('node:fs');
const path = require('node:path');

const dataDirectory = path.resolve(__dirname, '..', 'test-data');
const outputPath = path.resolve(__dirname, '..', 'rtm-report.html');

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

const files = fs.readdirSync(dataDirectory).filter((file) => file.endsWith('.json'));
const cases = files.map((file) => {
  const scenario = JSON.parse(fs.readFileSync(path.join(dataDirectory, file), 'utf8'));
  const requiredFields = [
    'requirementId',
    'requirementTitle',
    'testCaseId',
    'testCaseTitle',
    'testCaseSummary',
    'module',
  ];
  const missingFields = requiredFields.filter(
    (field) => typeof scenario[field] !== 'string' || scenario[field].trim() === '',
  );
  if (missingFields.length > 0) {
    throw new Error(`${file} is missing RTM fields: ${missingFields.join(', ')}.`);
  }
  return scenario;
});

if (cases.length === 0) {
  throw new Error(`No testcase data files were found in "${dataDirectory}".`);
}

const rows = cases
  .map(
    (scenario) => `
      <tr>
        <td><strong>${escapeHtml(scenario.requirementId)}</strong></td>
        <td>${escapeHtml(scenario.requirementTitle)}</td>
        <td><strong>${escapeHtml(scenario.testCaseId)}</strong></td>
        <td>${escapeHtml(scenario.testCaseTitle)}</td>
        <td>${escapeHtml(scenario.testCaseSummary)}</td>
        <td>${escapeHtml(scenario.module)}</td>
        <td><span class="status">Automated</span></td>
      </tr>`,
  )
  .join('');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Requirements Traceability Matrix</title>
  <style>
    body { max-width: 1200px; margin: 40px auto; padding: 0 20px; color: #263238; font: 16px/1.5 Arial, sans-serif; }
    h1 { margin-bottom: 8px; }
    .note { color: #52616b; }
    .summary { margin: 24px 0; padding: 16px; background: #eef6f3; border-radius: 6px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th, td { padding: 12px; border: 1px solid #d7e0e3; vertical-align: top; }
    th { background: #f2f5f6; }
    .status { color: #176b45; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Requirements Traceability Matrix</h1>
  <p class="note">This table shows which automated test checks each requirement.</p>
  <div class="summary"><strong>${cases.length}</strong> requirement-to-test link(s) are listed below.</div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Requirement ID</th>
          <th>What the requirement asks for</th>
          <th>Test case ID</th>
          <th>What the test does</th>
          <th>In simple terms</th>
          <th>Area</th>
          <th>Coverage</th>
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
  </div>
  <p class="note">“Automated” means an automated test is linked to the requirement. It does not mean the latest test run passed.</p>
</body>
</html>
`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`RTM created: ${outputPath}`);
