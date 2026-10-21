import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// U4: a collapsed timeline is the canvas plus one player bar with a
// full-width scrubber; every ratio change fits the new canvas in the view.
const control = (page: Page, action: string) =>
  page.locator(`#timeline-foundation [data-action="${action}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TL-086] Collapse leaves one player bar (wand, first frame, 5 s jumps, Play, timecode, scrubber, Expand) and the scrubber seeks', async ({
  page,
}) => {
  await expect(control(page, 'scrub')).toBeHidden();
  await control(page, 'collapse-timeline').click();
  await expect(page.locator('.editor-shell')).toHaveClass(/timeline-collapsed/);
  for (const action of [
    'ai-tools',
    'first-frame',
    'back-5',
    'play',
    'forward-5',
    'timecode',
    'scrub',
    'collapse-timeline',
  ])
    await expect(control(page, action)).toBeVisible();
  for (const action of ['split', 'last-frame', 'frame-back', 'zoom-in'])
    await expect(control(page, action)).toBeHidden();
  await expect(page.locator('#canvas-footer')).toBeHidden();
  await expect(page.locator('#scene-strip')).toBeHidden();
  await expect(
    page.locator('#timeline-foundation .timeline-scroll'),
  ).toBeHidden();
  // The scrubber spans most of the bar.
  const bar = (await page
    .locator('#timeline-foundation .timeline-controls')
    .boundingBox())!;
  const scrub = (await control(page, 'scrub').boundingBox())!;
  expect(scrub.width).toBeGreaterThan(bar.width * 0.4);
  // Dragging it moves the playhead (no history).
  const duration = (await hook(page)).project.compositions[0]!.duration;
  await page.mouse.move(scrub.x + 7, scrub.y + scrub.height / 2);
  await page.mouse.down();
  await page.mouse.move(scrub.x + scrub.width / 2, scrub.y + scrub.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeGreaterThan(duration * 0.35);
  expect((await hook(page)).session.time).toBeLessThan(duration * 0.65);
  expect((await hook(page)).history.labels).toEqual([]);
  // Expand brings everything back.
  await control(page, 'collapse-timeline').click();
  await expect(
    page.locator('#timeline-foundation .timeline-scroll'),
  ).toBeVisible();
  await expect(page.locator('#canvas-footer')).toBeVisible();
  await expect(control(page, 'scrub')).toBeHidden();
});

test('[CV-063] a ratio change fits the new canvas in the view; no empty-composition text', async ({
  page,
}) => {
  await expect(page.getByText(/This composition/)).toHaveCount(0);
  // Zoom in first, so the fit is the ratio change's doing.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+=');
  await expect
    .poll(async () => (await hook(page)).session.canvasZoom)
    .toBeGreaterThan(1);
  await page.locator('#context-toolbar [data-control="canvas-size"]').click();
  await page
    .locator('.toolbar-popover .canvas-size-preset[data-preset="vertical"]')
    .click();
  await expect.poll(async () => (await hook(page)).session.canvasZoom).toBe(1);
  const stage = (await page.locator('#canvas-stage').boundingBox())!;
  const art = (await page.locator('#artboard-shadow').boundingBox())!;
  const small = Math.min(stage.width, stage.height);
  expect(Math.max(art.width, art.height)).toBeGreaterThanOrEqual(small * 0.8);
});
