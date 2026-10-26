#!/usr/bin/env node
// Phase 1 library (P1-11, P1-28): the built editor never contains the owner
// app (its routes, cookie or screens) and no bundled library payloads.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
if (!existsSync(dist)) {
  console.error('dist/ is missing: run vite build first.');
  process.exit(1);
}
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
};
walk(dist);
export const OWNER_MARKERS = [
  '/api/rotate-key',
  'aive_owner',
  '/api/reauth',
  'Library manager',
  'owner/gate/harness',
];
export const PAYLOAD_MARKERS = [
  '"shape-star-5"',
  'Starter Pack 1',
  '"clean-light"',
  'Cinematic Teal',
  'shape-flowchart-decision',
];
const problems = [];
for (const file of files) {
  const relative = path.relative(dist, file);
  if (relative.startsWith('library/'))
    problems.push(`${relative}: bundled library file`);
  if (!/\.(js|html|json|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const marker of OWNER_MARKERS)
    if (text.includes(marker))
      problems.push(`${relative}: contains the owner app (${marker})`);
  if (/\.(js|json)$/.test(file))
    for (const marker of PAYLOAD_MARKERS)
      if (text.includes(marker))
        problems.push(
          `${relative}: contains bundled library content (${marker})`,
        );
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `Editor bundle: ${files.length} files, no owner app, no bundled library payloads.`,
);
