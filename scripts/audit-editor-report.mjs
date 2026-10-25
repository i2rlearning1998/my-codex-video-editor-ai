// AUDIT-EDITOR: writes the audit table of reports/AUDIT-EDITOR.md from
// scripts/audit-editor-data.mjs (between the AUDIT-TABLE markers).
import { readFileSync, writeFileSync } from 'node:fs';
import { verdicts } from './audit-editor-data.mjs';

const NAMES = {
  W: 'BUILT-WORKING',
  P: 'BUILT-PARTIAL',
  N: 'NOT-BUILT',
  D: 'DEFERRED-LATER',
  DA: 'DEFERRED-LATER (AI, needs the backend)',
  DL: 'DEFERRED-LATER (AI, can run locally now)',
};
const ledger = readFileSync('docs/FEATURES.md', 'utf8');
const before = JSON.parse(
  readFileSync('scripts/audit-editor-before.json', 'utf8'),
);
const cell = (text) => String(text).replace(/\|/g, '/').replace(/\n/g, ' ');
const rows = Object.entries(verdicts).map(([id, [verdict, proof, build]]) => {
  const item =
    ledger.match(
      new RegExp(`^\\| ${id} \\|[^|]*\\|[^|]*\\|[^|]*\\| (.*) \\|$`, 'm'),
    )?.[1] ?? '';
  return `| ${id} | ${before[id]} | ${NAMES[verdict]} | ${cell(proof)} | ${cell(
    build || (verdict === 'W' ? 'Nothing' : ''),
  )} |`;
});
const counts = {};
for (const [verdict] of Object.values(verdicts))
  counts[NAMES[verdict].split(' ')[0]] =
    (counts[NAMES[verdict].split(' ')[0]] ?? 0) + 1;
const table = [
  `Counts: ${Object.entries(counts)
    .map(([name, count]) => `${name} ${count}`)
    .join(', ')} (of ${rows.length}).`,
  '',
  '| ID | Ledger status before | Verdict | Proof | What exactly to build |',
  '|---|---|---|---|---|',
  ...rows,
].join('\n');
const path = 'reports/AUDIT-EDITOR.md';
const report = readFileSync(path, 'utf8');
writeFileSync(
  path,
  report.replace(
    /<!-- AUDIT-TABLE -->[\s\S]*<!-- \/AUDIT-TABLE -->/,
    `<!-- AUDIT-TABLE -->\n${table}\n<!-- /AUDIT-TABLE -->`,
  ),
);
console.log(counts);
