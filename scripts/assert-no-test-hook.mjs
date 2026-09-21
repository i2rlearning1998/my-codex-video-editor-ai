#!/usr/bin/env node
// Fails if the read-only test hook (window.__AIVE__) leaked into the production build.
// Run after `vite build`. Usage: node scripts/assert-no-test-hook.mjs [distDir=dist]
import fs from 'node:fs';
import path from 'node:path';

const dist = process.argv[2] ?? 'dist';
if (!fs.existsSync(dist)) {
  console.error(`assert-no-test-hook: ${dist} not found (run the build first)`);
  process.exit(1);
}
const hits = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (
      /\.(js|mjs|html|map)$/.test(e.name) &&
      fs.readFileSync(p, 'utf8').includes('__AIVE__')
    )
      hits.push(p);
  }
};
walk(dist);
if (hits.length) {
  console.error(
    'Test hook __AIVE__ found in production build:\n' +
      hits.map((h) => `  - ${h}`).join('\n'),
  );
  process.exit(1);
}
console.log('assert-no-test-hook: OK (no __AIVE__ in production build)');
