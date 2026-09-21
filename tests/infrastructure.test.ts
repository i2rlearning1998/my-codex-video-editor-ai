import { test, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    // Only remove exact roots returned by mkdtemp, within the OS temp directory.
    if (
      path.dirname(root) !== tmpdir() ||
      !path.basename(root).startsWith('aive-w0-')
    )
      throw new Error('Unsafe temporary path');
    rmSync(root, { recursive: true, force: true });
  }
});
const temp = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aive-w0-'));
  temporaryRoots.push(root);
  return root;
};
const row = (status = 'Verified') =>
  `| DEV-003 | P0 | W0 | ${status} | Checker |\n`;
const declaration = (id = 'DEV-003', modifier = '') =>
  `test${modifier}('[${id}] proof', () => {});`;
function ledger(
  ledgerText: string,
  source: string,
  options: { browser?: boolean; report?: unknown } = {},
) {
  const root = temp();
  const tests = path.join(root, options.browser === false ? 'tests' : 'e2e');
  mkdirSync(tests);
  writeFileSync(path.join(root, 'FEATURES.md'), ledgerText);
  writeFileSync(path.join(tests, 'proof.test.ts'), source);
  const args = [
    path.resolve('scripts/ledger-check.mjs'),
    '--ledger',
    path.join(root, 'FEATURES.md'),
    '--tests',
    tests,
  ];
  if (options.report) {
    const report = path.join(root, 'results.json');
    writeFileSync(report, JSON.stringify(options.report));
    args.push('--report', report);
  }
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}
test('[DEV-003] unknown ledger ID is rejected', () => {
  const result = ledger(row('Todo'), declaration('DEV-999'));
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('unknown ledger ID');
});
test('[DEV-003] Verified without an active test is rejected', () => {
  expect(ledger(row(), '').status).toBe(1);
});
test('[DEV-003] skipped tests cannot prove Verified', () => {
  expect(ledger(row(), declaration('DEV-003', '.skip')).status).toBe(1);
});
test('[DEV-003] skipped suites cannot prove Verified', () => {
  expect(
    ledger(row(), `test.describe.skip('disabled', () => { ${declaration()} });`)
      .status,
  ).toBe(1);
});
test('[DEV-003] Bug requires a browser expected-failure reproduction', () => {
  expect(ledger(row('Bug'), declaration()).status).toBe(1);
  expect(ledger(row('Bug'), declaration('DEV-003', '.fail')).status).toBe(0);
});
test('[DEV-003] failed browser report cannot prove Verified', () => {
  const report = {
    suites: [
      {
        specs: [
          {
            title: '[DEV-003] proof',
            ok: false,
            tests: [
              {
                status: 'unexpected',
                expectedStatus: 'passed',
                results: [{ status: 'failed' }],
              },
            ],
          },
        ],
      },
    ],
  };
  const result = ledger(row(), declaration(), { report });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('FAILED');
});
test('[DEV-003] malformed ledger row is rejected', () => {
  const result = ledger('| DEV-003 | P0 | W0 | Verified |\n', declaration());
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('malformed');
});
test('[DEV-003] unit-only Verified passes', () => {
  expect(ledger(row(), declaration(), { browser: false }).status).toBe(0);
});
test('[DEV-003] browser titles must begin with an ID', () => {
  expect(ledger(row('Todo'), "test('untagged proof', () => {});").status).toBe(
    1,
  );
});
test('[DEV-003] example test strings and comments are not proof', () => {
  expect(
    ledger(
      row(),
      `const example = ${JSON.stringify(declaration())}; // ${declaration()}`,
    ).status,
  ).toBe(1);
});
test('[DEV-003] product expected failures still prevent Verified', () => {
  expect(
    ledger(row(), declaration() + declaration('DEV-003', '.fail')).status,
  ).toBe(1);
});
test('[DEV-003] explicitly required guard probe can coexist with Verified', () => {
  const source =
    declaration('DEV-006') +
    "test.fail('[DEV-006] guard fails a test that logs console.error', () => {});";
  expect(ledger(row().replace('DEV-003', 'DEV-006'), source).status).toBe(0);
});

test('[DEV-010] review patch excludes lockfile, media, specs and generated artifacts', () => {
  const root = temp();
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args],
      { cwd: root, encoding: 'utf8' },
    );
  git('init');
  git('config', 'user.name', 'W0 test');
  git('config', 'user.email', 'w0@example.invalid');
  writeFileSync(path.join(root, 'README.md'), 'before\n');
  git('add', '.');
  git('commit', '-m', 'base');
  git('tag', 'base');
  for (const file of [
    'package-lock.json',
    'tests/fixtures/media/video.bin',
    'docs/specs/reference.md',
    'e2e-results/results.json',
  ]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), 'excluded\n');
  }
  writeFileSync(path.join(root, 'README.md'), 'after\n');
  git('add', '.');
  git('commit', '-m', 'head');
  git('tag', 'tip');
  execFileSync(
    process.execPath,
    [path.resolve('scripts/make-review-patch.mjs'), 'base', 'tip', 'W0'],
    { cwd: root },
  );
  const patch = readFileSync(path.join(root, 'reports/W0.patch'), 'utf8');
  expect(patch).toContain('+after');
  expect(patch).not.toMatch(
    /package-lock|fixtures\/media|docs\/specs|e2e-results/,
  );
  expect(
    readFileSync(path.join(root, 'reports/W0.stat.txt'), 'utf8'),
  ).toContain('README.md');
});
test('[DEV-002] verify chains every required gate', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.scripts.verify).toBe(
    'npm run check && npm run e2e && node scripts/assert-no-test-hook.mjs && npm run ledger -- --report e2e-results/results.json',
  );
});
test('[DEV-011] Wave 0 report contains every template section', () => {
  const template = readFileSync('reports/TEMPLATE.md', 'utf8');
  const report = readFileSync('reports/W0.md', 'utf8');
  for (const heading of template
    .split(/\r?\n/)
    .filter((line) => line.startsWith('## ')))
    expect(report).toContain(heading);
});
