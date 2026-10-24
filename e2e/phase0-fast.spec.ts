import path from 'node:path';
import type { Page } from '@playwright/test';
import { meanDiff, preview } from './fx-helpers';
import {
  test,
  expect,
  hook,
  showCategory,
  showSceneStrip,
  seekKeep,
  settled,
} from './fixtures';
import { oneClip, watchLongTasks, longTasks } from './phase0-helpers';

// PHASE 0 fast round: one focused browser test per bug.
const JPG = 'image_testsrc_1200x800.jpg';
test.setTimeout(60_000);
const panel = (page: Page) => page.locator('#right-section');

test('[FX5-014] changing the canvas ratio to 9:16 with a clip in the scene answers at once and sets 1080 x 1920', async ({
  page,
}) => {
  await oneClip(page, JPG);
  // Click the empty stage around the artboard: the canvas bar (Ratio chip).
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const bar = page.locator('#context-toolbar');
  await expect(bar).toHaveAttribute('data-mode', 'canvas');
  await watchLongTasks(page);
  const started = Date.now();
  await bar.locator('[data-control="canvas-size"]').click();
  await page
    .locator('.toolbar-popover .canvas-size-preset[data-preset="vertical"]')
    .click();
  await expect
    .poll(async () => {
      const state = await hook(page);
      const scene = state.project.compositions.find(
        (item) => item.id === state.session.compositionId,
      )!;
      return [scene.width, scene.height];
    })
    .toEqual([1080, 1920]);
  expect(Date.now() - started).toBeLessThan(5_000);
  expect(Math.max(...(await longTasks(page)))).toBeLessThan(1_000);
});

test('[FX5-015] dragging a filter intensity slider changes the canvas before release; release is one undo step; a hover preview clears and adds no history', async ({
  page,
}) => {
  await oneClip(page, JPG);
  await seekKeep(page, 1.3);
  await settled(page);
  await page.locator('#rail-right [data-section="Filters"]').click();
  const retro = panel(page).locator('.fx-tile[data-tile="retro"]');
  await retro.click();
  const labels = async () => (await hook(page)).history.labels;
  const afterApply = (await labels()).length;
  // Hover another tile: no history, canvas unchanged.
  await settled(page);
  const applied = await preview(page, true);
  await panel(page).locator('.fx-tile').nth(3).hover();
  await expect
    .poll(async () => meanDiff(await preview(page), applied))
    .toBeGreaterThan(0.5);
  expect((await labels()).length).toBe(afterApply);
  await page.mouse.move(5, 5);
  await expect.poll(async () => meanDiff(await preview(page), applied)).toBe(0);
  expect((await labels()).length).toBe(afterApply);
  // Drag the slider with the mouse: the canvas changes before release.
  const slider = panel(page).locator('#right-filter-intensity');
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 4, box.y + box.height / 2, { steps: 8 });
  await expect
    .poll(async () => meanDiff(await preview(page), applied))
    .toBeGreaterThan(0.5);
  expect((await labels()).length).toBe(afterApply);
  await page.mouse.up();
  await expect.poll(async () => (await labels()).length).toBe(afterApply + 1);
  expect((await labels()).at(-1)).toBe('Filter intensity');
});
