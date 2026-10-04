import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { BRAND } from './src/brand/brand';

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
  // T7: index.html (title, loading screen) takes the wordmark from
  // src/brand/brand.ts, the one place the brand is defined.
  plugins: [
    {
      name: 'brand-html',
      transformIndexHtml: (html) =>
        html
          .replaceAll('%BRAND_NAME%', BRAND.name)
          .replaceAll('%BRAND_WORDMARK%', BRAND.wordmark)
          .replaceAll('%BRAND_MARK%', BRAND.mark),
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
  },
  // The export worker imports mediabunny; pre-bundling it at startup avoids the dev
  // server reloading the page when it first discovers the dependency (W5-A).
  optimizeDeps: { include: ['mediabunny'] },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
