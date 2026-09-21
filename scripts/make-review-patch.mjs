#!/usr/bin/env node
// Creates a small review patch between two git refs, excluding bulky or generated files.
//
// Usage:  node scripts/make-review-patch.mjs <baseRef> [headRef=HEAD] [name]
// Example: node scripts/make-review-patch.mjs m0 w0 W0
// Output:  reports/<name>.patch and reports/<name>.stat.txt
//
// Excludes: package-lock.json, tests/fixtures/media, docs/specs, e2e baseline screenshots, dist, test-results, playwright-report.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [base, head = 'HEAD', nameArg] = process.argv.slice(2);
if (!base) {
  console.error(
    'Usage: node scripts/make-review-patch.mjs <baseRef> [headRef=HEAD] [name]',
  );
  process.exit(1);
}
const name = nameArg ?? head.replace(/[^\w.-]/g, '_');

const excludes = [
  'package-lock.json',
  'tests/fixtures/media',
  'docs/specs',
  'e2e/__screenshots__',
  'dist',
  'test-results',
  'playwright-report',
  'reports/*.patch',
  'reports/*.stat.txt',
].map((p) => `:(exclude)${p}`);

const git = (extra) =>
  execFileSync(
    'git',
    ['diff', ...extra, `${base}..${head}`, '--', '.', ...excludes],
    {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  );

fs.mkdirSync('reports', { recursive: true });
const patch = git(['--no-color', '--no-ext-diff']);
const stat = git(['--stat=140', '--no-color']);
const patchPath = path.join('reports', `${name}.patch`);
const statPath = path.join('reports', `${name}.stat.txt`);
fs.writeFileSync(patchPath, patch);
fs.writeFileSync(statPath, stat);
const kb = (Buffer.byteLength(patch) / 1024).toFixed(0);
console.log(`Wrote ${patchPath} (${kb} KB) and ${statPath}`);
if (Buffer.byteLength(patch) > 1.5 * 1024 * 1024) {
  console.warn(
    'Patch is larger than 1.5 MB. Consider splitting the milestone or listing generated files in the excludes.',
  );
}
