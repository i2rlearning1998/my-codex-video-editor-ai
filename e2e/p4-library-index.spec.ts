import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, showCategory } from './fixtures';

// P4 (CREATOR-PACK-SPEC 8): "Copy library index for AI" in the Import menu.
const MOVE = readFileSync('examples/creator-packs/move-preset.json', 'utf8');
const dialog = (page: Page) => page.locator('.creator-pack-dialog');

async function openImportMenu(page: Page) {
  await showCategory(page, 'Media');
  await page.locator('#import-menu').click();
}

test('[CP-013] Copy library index for AI copies a compact index of every library and creator item, Blocks, presets, FX ids, fonts and the canvas', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  // A creator pack in My library is listed with its controls.
  await openImportMenu(page);
  await page.locator('#import-creator').click();
  await dialog(page).locator('#creator-source').fill(MOVE);
  await expect(dialog(page).locator('#creator-check')).toBeEnabled();
  await dialog(page).locator('#creator-check').click();
  await expect(dialog(page).locator('#creator-summary')).toHaveText(
    /passed the checks/,
    { timeout: 60_000 },
  );
  await dialog(page).locator('#creator-add').click();
  await expect(dialog(page)).toBeHidden();
  await openImportMenu(page);
  await expect(page.locator('#import-index')).toHaveText(
    'Copy library index for AI',
  );
  await page.locator('#import-index').click();
  await expect(
    page.locator('.toast', { hasText: 'Library index copied' }),
  ).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(new TextEncoder().encode(text).length).toBeLessThan(40 * 1024);
  // The open scene (the example: 1280 x 720 at 30 fps).
  expect(text).toContain('canvas: 1280x720 at 30 fps');
  expect(text).toMatch(/^fonts: Inter, Poppins/m);
  expect(text).toMatch(/^animate in: .*fade/m);
  expect(text).toMatch(/^animate loop: pulse/m);
  expect(text).toContain('animate creator: move-pack--preset-move');
  expect(text).toMatch(/^filters: .+/m);
  expect(text).toMatch(/^effects: .+/m);
  expect(text).toMatch(/^transitions: .+/m);
  expect(text).toMatch(/block counter "[^"]+" \| controls: /);
  expect(text).toMatch(/Built-in library \(\d+ items\)/);
  expect(text).toContain('Creator pack move-pack v1');
  expect(text).toContain(
    'preset move-pack--preset-move "Original preset-move" | tags: original | controls: angle, distance, duration, delay, easing',
  );
});
