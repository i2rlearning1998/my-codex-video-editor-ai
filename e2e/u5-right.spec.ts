import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// U5: the right rail has labels, nothing selected has no Canvas panel, the
// canvas bar sets the scene's frame rate, and Animate is a right-rail tab.
const bar = (page: Page) => page.locator('#context-toolbar');
const scene = async (page: Page) => (await hook(page)).project.compositions[0]!;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[LAY-059] the right rail shows 24 px icons with labels; nothing selected shows no Canvas panel', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  const button = page.locator('#rail-right button:not([hidden])').first();
  const icon = (await button.locator('svg').boundingBox())!;
  expect(Math.round(icon.width)).toBe(24);
  const label = button.locator('.icon-rail-label');
  await expect(label).toBeVisible();
  expect(
    await label.evaluate((item) => parseFloat(getComputedStyle(item).fontSize)),
  ).toBeGreaterThanOrEqual(12.5);
  // Nothing selected: an empty state, no Canvas tab, no rail buttons.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([]);
  await expect(page.locator('#right-panel-empty')).toBeVisible();
  await expect(page.locator('#right-section')).toBeHidden();
  await expect(page.locator('#rail-right button:not([hidden])')).toHaveCount(0);
});

test('[PRJ-027] the canvas bar sets the scene frame rate; times re-snap to the new grid; one undo step', async ({
  page,
}) => {
  // The stage around the artboard shows the canvas bar (CV-057).
  const stage = (await page.locator('#canvas-stage').boundingBox())!;
  await page.mouse.click(stage.x + 6, stage.y + stage.height - 60);
  await expect(bar(page)).toHaveAttribute('data-mode', 'canvas');
  const chip = bar(page).locator('[data-control="canvas-fps"]');
  await expect(chip).toContainText('30 fps');
  await chip.click();
  const presets = page.locator('.toolbar-popover .fps-preset');
  await expect(presets).toHaveText([
    '6 fps',
    '8 fps',
    '12 fps',
    '23.98 fps',
    '24 fps',
    '25 fps',
    '29.97 fps',
    '30 fps',
    '50 fps',
    '59.94 fps',
    '60 fps',
    '120 fps',
    '240 fps',
  ]);
  await expect(page.locator('#canvas-fps-custom')).toBeVisible();
  await presets.filter({ hasText: /^12 fps$/ }).click();
  expect((await scene(page)).fps).toBe(12);
  expect((await hook(page)).history.labels.at(-1)).toBe('Frame rate');
  for (const track of (await scene(page)).tracks)
    for (const clip of track.clips)
      expect(
        Math.abs(clip.startTime * 12 - Math.round(clip.startTime * 12)),
      ).toBeLessThan(1e-6);
  await expect(page.locator('#composition-summary')).toContainText('12');
  await expect(chip).toContainText('12 fps');
  // A custom rate.
  await chip.click();
  await page.locator('#canvas-fps-custom').fill('15');
  await page.locator('#canvas-fps-custom').press('Enter');
  await page.locator('#canvas-fps-apply').click();
  expect((await scene(page)).fps).toBe(15);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await scene(page)).fps).toBe(30);
});

test('[ANI-023] Animate is a right-rail tab: the toolbar opens it; presets are thumbnails, three per row, None first', async ({
  page,
  openFixtureProject,
}) => {
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await page.locator('#context-toolbar [data-control="animate"]').click();
  const tab = page.locator('#rail-right [data-section="Animate"]');
  await expect(tab).toHaveAttribute('aria-pressed', 'true');
  const body = page.locator('#right-section .right-animate-body');
  await expect(body).toBeVisible();
  // No left Animate side panel.
  await expect(
    page.locator('#side-panel-host [data-deep-panel="animate"]'),
  ).toHaveCount(0);
  const cards = body.locator('.animate-card');
  await expect(cards.first()).toHaveAttribute('data-preset', 'none');
  await expect(cards.first().locator('.animate-thumb')).toBeVisible();
  const ys = await cards.evaluateAll((items) =>
    items.slice(0, 4).map((item) => Math.round(item.getBoundingClientRect().y)),
  );
  expect(ys[0]).toBe(ys[1]);
  expect(ys[1]).toBe(ys[2]);
  expect(ys[3]).toBeGreaterThan(ys[0]!);
  await body.locator('[data-preset="fade"]').click();
  await expect(body.locator('[data-preset="fade"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The chosen preset's thumbnail plays (live preview).
  expect(
    await body
      .locator('[data-preset="fade"] .animate-thumb i')
      .evaluate((item) => getComputedStyle(item).animationName),
  ).toBe('thumb-fade');
  // A picture has Animate too, and no Animate section in its own panel.
  await openFixtureProject('nle-example.json');
  await page.locator('#scene-list [data-layer-id="layer-c"]').click();
  await expect(tab).toBeVisible();
  await page.locator('#rail-right [data-section="Properties"]').click();
  await expect(
    page.locator('#right-section [data-accordion$="-animate"]'),
  ).toHaveCount(0);
});
