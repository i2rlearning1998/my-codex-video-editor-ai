#!/usr/bin/env node
// Feature Ledger consistency checker. Zero dependencies (Node 20+).
//
// Usage:
//   node scripts/ledger-check.mjs [--ledger docs/FEATURES.md] [--tests e2e,tests] [--report test-results/results.json]
//                                 [--require-seeds] [--summary]
//
// Checks (exit code 1 on any error):
//   1. Ledger table rows are well formed, IDs unique, Pri/Wave/Status use allowed words.
//   2. Every e2e test title starts with one or more [ID] tags and every ID exists in the ledger.
//   3. Every ledger item with status Verified has at least one active test (not skip/fixme/fail).
//      Every item with status Bug has at least one browser test declared with test.fail(...) that reproduces it.
//   4. With --report (Playwright JSON reporter output): every browser test that names a Verified ID must have passed.
//      (IDs proven only by unit tests are covered by `npm test` passing inside `npm run verify`.)
//   5. With --require-seeds: every `seed` item must be Verified or Bug (used to close Wave 0).
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')
    ? args[i + 1]
    : def;
};
const flag = (name) => args.includes(name);

const ledgerPath = opt('--ledger', 'docs/FEATURES.md');
const testDirs = opt('--tests', 'e2e,tests')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);
const reportPath = opt('--report', null);
const requireSeeds = flag('--require-seeds');
const wantSummary = flag('--summary');

const STATUSES = new Set([
  'Todo',
  'Claimed',
  'Verified',
  'Bug',
  'Deferred',
  'Dropped',
]);
const PRIS = new Set(['P0', 'P1', 'P2']);
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);

// ---------- 1. parse ledger ----------
if (!fs.existsSync(ledgerPath)) {
  console.error(`Ledger not found: ${ledgerPath}`);
  process.exit(1);
}
const rowRe =
  /^\|\s*([A-Z][A-Z0-9]{1,3}-\d{3})\s*\|\s*(P\d)\s*\|\s*(W\d+)\s*\|\s*([A-Za-z]+)\s*\|\s*(.+?)\s*\|\s*$/;
const items = new Map();
for (const [n, line] of fs
  .readFileSync(ledgerPath, 'utf8')
  .split(/\r?\n/)
  .entries()) {
  if (!/^\|\s*[A-Z][A-Z0-9]{1,3}-\d{3}\s*\|/.test(line)) continue;
  const m = rowRe.exec(line);
  if (!m) {
    err(`${ledgerPath}:${n + 1} malformed ledger row`);
    continue;
  }
  const [, id, pri, wave, status, text] = m;
  if (items.has(id)) err(`${ledgerPath}:${n + 1} duplicate ID ${id}`);
  if (!PRIS.has(pri)) err(`${id}: invalid priority ${pri}`);
  if (!/^W([0-9]|10)$/.test(wave)) err(`${id}: invalid wave ${wave}`);
  if (!STATUSES.has(status))
    err(
      `${id}: invalid status "${status}" (allowed: ${[...STATUSES].join(', ')})`,
    );
  items.set(id, { id, pri, wave, status, text, seed: /`seed`\s*$/.test(text) });
}
if (items.size === 0) err(`${ledgerPath}: no ledger rows found`);

// ---------- 2. scan e2e tests ----------
const testFiles = [];
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(e.name)) testFiles.push(p);
  }
};
for (const d of testDirs) walk(d);
const isBrowserTest = (file) =>
  file.split(path.sep)[0] === 'e2e' ||
  file.includes(`${path.sep}e2e${path.sep}`);

// test( 'title' ...  |  it( ... | test.only( ... | test.skip( ... | test.fixme( ... | test.fail( ...
const testRe =
  /\b(?:test|it)(?:\.(only|skip|fixme|fail|slow))?\(\s*(['"`])((?:\[[A-Z][A-Z0-9]{1,3}-\d{3}\]\s*)+)/g;
const idRe = /\[([A-Z][A-Z0-9]{1,3}-\d{3})\]/g;
const activeTests = new Map(); // id -> [{file, browser}]
const failTests = new Map(); // id -> [{file}] browser tests declared test.fail
let bannedOnly = 0;
for (const file of [...new Set(testFiles)]) {
  const src = fs.readFileSync(file, 'utf8');
  const browser = isBrowserTest(file);
  let m;
  while ((m = testRe.exec(src))) {
    const modifier = m[1];
    const tagText = m[3];
    if (modifier === 'only') bannedOnly++;
    for (const idm of tagText.matchAll(idRe)) {
      const id = idm[1];
      if (!items.has(id)) {
        err(`${file}: test references unknown ledger ID ${id}`);
        continue;
      }
      if (modifier === 'skip' || modifier === 'fixme') continue; // not a proof
      const bucket = modifier === 'fail' ? failTests : activeTests;
      if (modifier === 'fail' && !browser) {
        err(
          `${file}: test.fail is only allowed in browser (e2e) tests (${id})`,
        );
        continue;
      }
      if (!bucket.has(id)) bucket.set(id, []);
      bucket.get(id).push({ file, browser });
    }
  }
}
if (bannedOnly) err(`test.only found in ${bannedOnly} place(s); remove it`);

// ---------- 3. Verified needs a test ----------
for (const it of items.values()) {
  if (it.status === 'Verified' && !activeTests.has(it.id)) {
    err(`${it.id} is Verified but no active test names it`);
  }
  if (it.status === 'Bug' && !failTests.has(it.id)) {
    err(
      `${it.id} is Bug but has no browser test.fail('[${it.id}] ...') reproducing it`,
    );
  }
  if (it.status === 'Bug' && activeTests.has(it.id) && !failTests.has(it.id)) {
    warnings.push(
      `${it.id} is Bug but also has passing-style tests; check that the bug is real`,
    );
  }
  if (it.status === 'Verified' && failTests.has(it.id)) {
    err(
      `${it.id} is Verified but still has a test.fail reproduction; convert it to a normal test`,
    );
  }
  if (
    it.status !== 'Verified' &&
    it.status !== 'Bug' &&
    activeTests.has(it.id)
  ) {
    warnings.push(
      `${it.id} has a test but status is ${it.status}; update the status if the test passes`,
    );
  }
}

// ---------- 4. Playwright JSON report ----------
if (reportPath) {
  if (!fs.existsSync(reportPath)) {
    err(
      `--report file not found: ${reportPath} (run e2e with the json reporter first)`,
    );
  } else {
    const rep = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const results = new Map(); // id -> {passed, failed, skipped}
    const visit = (suite) => {
      for (const spec of suite.specs ?? []) {
        const ids = [...spec.title.matchAll(idRe)].map((x) => x[1]);
        const tests = spec.tests ?? [];
        const skipped =
          tests.length > 0 && tests.every((t) => t.status === 'skipped');
        const ok = spec.ok === true && !skipped;
        for (const id of ids) {
          const r = results.get(id) ?? { passed: 0, failed: 0, skipped: 0 };
          if (skipped) r.skipped++;
          else if (ok) r.passed++;
          else r.failed++;
          results.set(id, r);
        }
      }
      for (const child of suite.suites ?? []) visit(child);
    };
    for (const s of rep.suites ?? []) visit(s);
    for (const it of items.values()) {
      const r = results.get(it.id);
      const browserProven = (activeTests.get(it.id) ?? []).some(
        (t) => t.browser,
      );
      if (it.status === 'Verified' && browserProven) {
        if (!r) err(`${it.id} is Verified but the report has no result for it`);
        else if (r.failed > 0)
          err(
            `${it.id} is Verified but ${r.failed} test(s) FAILED in the report`,
          );
        else if (r.passed === 0)
          err(`${it.id} is Verified but all its tests were skipped`);
      }
    }
  }
}

// ---------- 5. seeds ----------
if (requireSeeds) {
  for (const it of items.values()) {
    if (it.seed && it.status !== 'Verified' && it.status !== 'Bug') {
      err(`seed ${it.id} is still ${it.status}; it must be Verified or Bug`);
    }
  }
}

// ---------- output ----------
const count = (fn) => {
  const c = {};
  for (const it of items.values()) c[fn(it)] = (c[fn(it)] ?? 0) + 1;
  return c;
};
const byStatus = count((i) => i.status);
console.log(
  `Ledger: ${items.size} items | ` +
    Object.entries(byStatus)
      .map(([k, v]) => `${k} ${v}`)
      .join(' | '),
);
console.log(
  `Tests: ${testFiles.length} file(s) scanned, ${activeTests.size} IDs proven by active tests, ${failTests.size} IDs with test.fail reproductions`,
);

if (wantSummary) {
  const waves = [...new Set([...items.values()].map((i) => i.wave))].sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  );
  console.log(
    '\n| Wave | Total | Verified | Bug | Claimed | Todo | P0 not Verified |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  for (const w of waves) {
    const list = [...items.values()].filter((i) => i.wave === w);
    const n = (s) => list.filter((i) => i.status === s).length;
    const p0open = list.filter(
      (i) =>
        i.pri === 'P0' &&
        i.status !== 'Verified' &&
        i.status !== 'Dropped' &&
        i.status !== 'Deferred',
    ).length;
    console.log(
      `| ${w} | ${list.length} | ${n('Verified')} | ${n('Bug')} | ${n('Claimed')} | ${n('Todo')} | ${p0open} |`,
    );
  }
  const bugs = [...items.values()].filter((i) => i.status === 'Bug');
  if (bugs.length) {
    console.log('\nOpen bugs:');
    for (const b of bugs)
      console.log(`- ${b.id} ${b.text.replace(/`seed`/, '').trim()}`);
  }
}
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  console.error(`\n${errors.length} ledger error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('Ledger OK');
