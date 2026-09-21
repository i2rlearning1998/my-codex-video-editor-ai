import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let gitCommit = 'unknown';
try {
  gitCommit = execFileSync(
    'git',
    [
      '-c',
      `safe.directory=${process.cwd().replaceAll('\\', '/')}`,
      'rev-parse',
      'HEAD',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
} catch {
  /* Source archives may have no Git metadata. */
}
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
