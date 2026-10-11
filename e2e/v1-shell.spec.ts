import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// V1 (Clipchamp clone spec 1): region cards and the right side that exists
// only while something is selected. These tests turn off the fixture's
// reserved right column (D-190), so they see the real layout.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_RIGHT__?: string }).__AIVE_E2E_RIGHT__ = 'off';
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
const box = async (page: Page, selector: string) =>
  (await page.locator(selector).boundingBox())!;
const width = (page: Page, selector: string) =>
  page
    .locator(selector)
    .evaluate((element) => element.getBoundingClientRect().width);

test('[LAY-063] nothing selected: no right rail or panel and no reserved column; a selection animates them in (300 and 65 px), deselect removes them fully; the canvas stays centred', async ({
  page,
}) => {
  await expect.poll(() => width(page, '#inspector-panel')).toBe(0);
  await expect.poll(() => width(page, '#rail-right')).toBe(0);
  const stage = await box(page, '.preview-panel');
  const viewport = page.viewportSize()!;
  // The stage reaches the right gutter (8 px from the window edge).
  expect(viewport.width - (stage.x + stage.width)).toBeLessThanOrEqual(10);
  const centred = async () => {
    const stageBox = await box(page, '.canvas-stage');
    const canvas = await box(page, '#composition-canvas');
    return Math.abs(
      canvas.x + canvas.width / 2 - (stageBox.x + stageBox.width / 2),
    );
  };
  expect(await centred()).toBeLessThanOrEqual(2);
  // A selection: rail 65 px, panel 300 px plus its border.
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  await expect.poll(() => width(page, '#rail-right')).toBeCloseTo(65, 0);
  await expect.poll(() => width(page, '#inspector-panel')).toBeCloseTo(300, 0);
  await expect.poll(centred).toBeLessThanOrEqual(2);
  // Deselect: both are gone within 400 ms, no column is left.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([]);
  await page.waitForTimeout(400);
  expect(await width(page, '#inspector-panel')).toBe(0);
  expect(await width(page, '#rail-right')).toBe(0);
  await expect(page.locator('#inspector-panel')).toBeHidden();
  const after = await box(page, '.preview-panel');
  expect(after.width).toBeCloseTo(stage.width, 0);
  expect(await centred()).toBeLessThanOrEqual(2);
});

test('[LAY-064] regions are separate cards: 8 px gutters of the page colour, opaque 1 px borders, neighbours of different tones', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  await expect.poll(() => width(page, '#inspector-panel')).toBeGreaterThan(290);
  const regions = [
    '#rail-left',
    '#library-panel',
    '.preview-panel',
    '#inspector-panel',
    '#rail-right',
    '.editor-shell > .timeline',
  ];
  const styles = await page.evaluate(
    (selectors) =>
      selectors.map((selector) => {
        const element = document.querySelector(selector)!;
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          border: style.borderTopColor,
          borderWidth: style.borderTopWidth,
        };
      }),
    regions,
  );
  const page_ = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('.editor-shell')!)
        .backgroundColor,
  );
  for (const style of styles) {
    expect(style.borderWidth).toBe('1px');
    // Opaque: rgb(), not rgba() with an alpha below 1.
    expect(style.border).toMatch(/^rgb\(/);
    expect(style.background).not.toBe(page_);
  }
  // Neighbours left to right differ, and the stage differs from the timeline.
  for (let i = 0; i + 1 < 5; i++)
    expect(styles[i]!.background).not.toBe(styles[i + 1]!.background);
  expect(styles[2]!.background).not.toBe(styles[5]!.background);
  const footer = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('#canvas-footer')!)
        .backgroundColor,
  );
  expect(footer).not.toBe(styles[2]!.background);
  expect(footer).not.toBe(styles[5]!.background);
  // 8 px gutters between the cards.
  const library = await box(page, '#library-panel');
  const stage = await box(page, '.preview-panel');
  const inspector = await box(page, '#inspector-panel');
  const timeline = await box(page, '.editor-shell > .timeline');
  expect(Math.round(stage.x - (library.x + library.width))).toBe(8);
  expect(Math.round(inspector.x - (stage.x + stage.width))).toBe(8);
  expect(Math.round(timeline.y - (stage.y + stage.height))).toBe(8);
});
