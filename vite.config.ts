import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { BRAND } from './src/brand/brand';
import { catalogDev, libraryPublicKey, ownerGuard } from './vite.library';

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

export default defineConfig(({ command }) => ({
  // T7: index.html (title, loading screen) takes the wordmark from
  // src/brand/brand.ts, the one place the brand is defined.
  plugins: [
    // Phase 1 library (P1-11): the owner app is never served by the editor.
    ownerGuard(),
    catalogDev(),
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
    // Phase 1 library (P1-06): the catalog's public key, fixed at build time.
    __LIBRARY_PUBLIC_KEY__: JSON.stringify(libraryPublicKey(command)),
  },
  // The export worker imports mediabunny; pre-bundling it at startup avoids the dev
  // server reloading the page when it first discovers the dependency (W5-A).
  // X1: the block compiler loads TypeScript lazily; pre-bundled so its first
  // use never makes the dev server reload the page.
  // FINAL2 U11: the lazy Whisper runner is pre-bundled too, so its first use
  // never makes the dev server reload the page.
  optimizeDeps: {
    include: ['mediabunny', 'typescript', '@huggingface/transformers'],
  },
  // FIX3 2.2: the captions worker loads transformers lazily (a split chunk),
  // which needs ES-module workers; every worker here is created as a module.
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-library.ts'],
  },
}));
