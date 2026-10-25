import { test, expect, hook, showCategory } from './fixtures';
import {
  bigCompositionPack,
  bigCompositionSpec,
  longTasks,
  watchLongTasks,
} from './phase0-helpers';

// PHASE 0 (E1): Build video never freezes the page.
test('[FX5-011] Build video of a big composition: a real loader with a moving percentage, Cancel stops it, Check again finishes; long tasks stay short', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await watchLongTasks(page);
  await page.locator('#ai-import-source').fill(bigCompositionPack());
  const build = page.locator('[data-action="build-video"]');
  await expect(build).toBeVisible({ timeout: 60_000 });
  await build.click();
  const dialog = page.locator('.composition-dialog');
  await expect(dialog).toBeVisible();
  const loader = dialog.locator('.build-loader');
  await expect(loader).toBeVisible();
  // The percentage moves, and the page answers while it does.
  const sampled = await page.evaluate(
    () =>
      new Promise<{ percents: string[]; gap: number }>((resolve) => {
        const percents = new Set<string>();
        let gap = 0;
        let last = performance.now();
        const tick = (now: number) => {
          gap = Math.max(gap, now - last);
          last = now;
          const el = document.querySelector(
            '.composition-dialog .build-loader',
          );
          if (el?.getAttribute('data-state') === 'running')
            percents.add(el.getAttribute('data-percent') ?? '');
          if (el && el.getAttribute('data-state') === 'running')
            requestAnimationFrame(tick);
          else resolve({ percents: [...percents], gap });
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log(
    'PERCENTS',
    sampled.percents.join(','),
    'MAXFRAMEGAP',
    sampled.gap,
  );
  expect(sampled.percents.length).toBeGreaterThan(3);
  const long = await longTasks(page);
  console.log('LONGTASKS', JSON.stringify(long));
  expect(Math.max(0, ...long)).toBeLessThan(400);
  await page.screenshot({ path: 'reports/phase0/e1-build.png' });
  void hook;
});

test('[FX5-012] Adding a big composition (Tier A code animation) never blocks the page for long and shows the build loader', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(bigCompositionSpec(28, 14));
  await expect(page.locator('#ai-import-add')).toBeEnabled({ timeout: 60_000 });
  await watchLongTasks(page);
  const before = (await hook(page)).project.compositions.length;
  await page.locator('#ai-import-add').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions.length, {
      timeout: 120_000,
    })
    .toBeGreaterThan(before);
  const long = await longTasks(page);
  console.log('LONGTASKS_ADD', JSON.stringify(long));
  expect(Math.max(0, ...long)).toBeLessThan(400);
});

test('[FX5-011] Cancel in the build loader really stops the build, says so plainly, and Check again finishes it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(bigCompositionPack());
  const build = page.locator('[data-action="build-video"]');
  await expect(build).toBeVisible({ timeout: 60_000 });
  await build.click();
  const dialog = page.locator('.composition-dialog');
  const loader = dialog.locator('.build-loader');
  await expect(loader).toBeVisible();
  await dialog.locator('[data-action="build-cancel"]').click();
  await expect(loader).toHaveAttribute('data-state', 'cancelled');
  await expect(loader).toContainText('Stopped');
  await expect(dialog.locator('#composition-add')).toBeDisabled();
  await dialog.locator('[data-action="build-again"]').click();
  await expect(dialog.locator('#composition-add')).toBeEnabled({
    timeout: 120_000,
  });
  await page.screenshot({ path: 'reports/phase0/e1-loader.png' });
});
