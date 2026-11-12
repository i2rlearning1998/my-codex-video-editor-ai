import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { autoLogin, showCategory } from './fixtures';

// ROUND-A A0.2: a production build with no catalog configured still shows
// the sound effects, the Text panel's styles and font combinations, and the
// themes (the baseline pack in public/library-baseline). The test runs the
// built editor through `vite preview`, the way a deployment serves it, with
// no catalog address set.
const PORT = Number(process.env.E2E_PREVIEW_PORT ?? 4319);
const BASE = `http://127.0.0.1:${PORT}`;
let server: ChildProcess | null = null;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  test.setTimeout(240_000);
  const env = { ...process.env };
  delete env.VITE_LIBRARY_CATALOG_URL;
  // `npm run verify` builds dist/ before the e2e run; a single spec run
  // builds it once here.
  if (!existsSync('dist/index.html')) {
    const built = spawnSync(
      process.execPath,
      ['node_modules/vite/bin/vite.js', 'build'],
      { env, encoding: 'utf8' },
    );
    if (built.status !== 0) throw new Error(built.stderr || built.stdout);
  }
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(PORT),
      '--strictPort',
    ],
    { env, stdio: 'ignore' },
  );
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${BASE}/library-baseline/index.json`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(200);
});
test.afterAll(() => {
  server?.kill();
});

test('[RDA-001] a built editor with no catalog still lists the 12 sound effects, the text styles and font combinations, and the 8 themes from the baseline pack', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  await page.addInitScript(autoLogin);
  await page.goto(`${BASE}/`);
  await expect(page.locator('#rail-left')).toBeVisible({ timeout: 30_000 });
  // No catalog is configured: nothing asks for a manifest.
  expect(asked.some((u) => u.endsWith('/manifest.json'))).toBe(false);

  await showCategory(page, 'Audio');
  await expect(page.locator('#library-audio .sound-tile')).toHaveCount(12);

  await showCategory(page, 'Text');
  const text = page.locator('#library-text');
  // No catalog is set up and the baseline loaded: no red "could not be
  // loaded" note.
  await expect(text.locator('.browse-status-error')).toHaveCount(0);
  await expect(text.locator('[data-item-id^="combo-"]').first()).toBeVisible();
  await expect(text.locator('[data-item-id^="text-"]').first()).toBeVisible();
  // "See all" of Font combinations lists every combination.
  await text
    .locator('section, div')
    .filter({ has: page.getByText('Font combinations', { exact: true }) })
    .last()
    .getByText('See all')
    .first()
    .click();
  await expect
    .poll(async () => text.locator('[data-item-id^="combo-"]').count())
    .toBeGreaterThanOrEqual(20);

  await showCategory(page, 'Theme');
  await expect(
    page.locator('#library-theme [data-group="builtin"] .theme-card'),
  ).toHaveCount(8);

  // A baseline sound is a real file from the editor's own origin.
  expect(
    asked.some((u) => u.startsWith(`${BASE}/library-baseline/index.json`)),
  ).toBe(true);
  expect(errors).toEqual([]);
});
