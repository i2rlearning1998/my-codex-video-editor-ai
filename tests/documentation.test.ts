import { readFileSync, existsSync } from 'node:fs';
import { test, expect } from 'vitest';

test('[DEV-009] current documentation supersedes archived Tier scope', () => {
  expect(readFileSync('AGENTS.md', 'utf8')).not.toContain(
    'current approved scope is',
  );
  expect(existsSync('docs/archive/AGENTS.T3.md')).toBe(true);
  expect(readFileSync('README.md', 'utf8')).toContain('npm run verify');
});
