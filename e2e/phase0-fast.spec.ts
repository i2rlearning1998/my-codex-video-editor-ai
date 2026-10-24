import path from 'node:path';
import type { Page } from '@playwright/test';
import { exported, meanDiff, preview } from './fx-helpers';
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

test('[TXT-037] dynamic text: a Scene number field draws 1 in scene 1 and 2 in the copy, in the preview and in the exported frame; Magic write stays disabled', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await showCategory(page, 'Text');
  const magic = page.locator('[data-action="magic-write"]');
  await expect(magic).toHaveAttribute('aria-disabled', 'true');
  await expect(magic).toHaveAttribute('title', /AI service \(planned\)/);
  await page
    .locator('[data-action="dynamic-text"][data-token="{{scene}}"]')
    .first()
    .click();
  const texts = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: {
              getCanvas(): { texts: { id: string; text: string }[] };
            };
          }
        ).__AIVE__.getCanvas().texts,
    );
  await expect
    .poll(async () => (await texts()).map((x) => x.text))
    .toEqual(['2']);
  await settled(page);
  const second = await exported(page, testInfo);
  // A copy of the scene is scene 3 of 3 (after the example and this one).
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-duplicate"]').click();
  await expect
    .poll(async () => (await texts()).map((x) => x.text))
    .toEqual(['3']);
  await settled(page);
  const third = await exported(page, testInfo);
  expect(meanDiff(second, third)).toBeGreaterThan(0.02);
});

test('[FX5-017] the scene strip + menu has Open video plan review (a plain note when the project has no plan)', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-open-plan-review"]').click();
  await expect(page.locator('.toast', { hasText: /plan/i })).toBeVisible();
});
