import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// T4: the "Timeline" title row is gone and the Player bar is the timeline's
// top edge and resize grip (remembered); the scene strip is hidden by default
// behind a button left of Scenes; the status row under the canvas is larger.
const timeline = (page: Page) => page.locator('section.timeline');
const bar = (page: Page) =>
  page.locator('#timeline-foundation .timeline-controls');
const height = async (page: Page) =>
  (await timeline(page).boundingBox())!.height;

/** A point on the Player bar's own background, between two control groups. */
async function emptySpot(page: Page) {
  const tools = (await page
    .locator('#timeline-foundation .transport-clip-tools')
    .boundingBox())!;
  const playback = (await page
    .locator('#timeline-foundation .transport-playback')
    .boundingBox())!;
  const box = (await bar(page).boundingBox())!;
  return {
    x: (tools.x + tools.width + playback.x) / 2,
    y: box.y + box.height / 2,
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[LAY-048] the Player bar is the top edge of the timeline and its resize grip; the height is clamped and remembered', async ({
  page,
}, testInfo) => {
  // No "Timeline" title row: the bar starts at the timeline's top.
  await expect(timeline(page).locator('h2')).toHaveCount(0);
  const top = (await timeline(page).boundingBox())!.y;
  expect(Math.abs((await bar(page).boundingBox())!.y - top)).toBeLessThan(3);
  // Its background shows the row-resize cursor; its buttons do not.
  const spot = await emptySpot(page);
  expect(
    await page.evaluate(
      ({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)!).cursor,
      spot,
    ),
  ).toBe('row-resize');
  expect(
    await page
      .locator('#timeline-foundation [data-action="play"]')
      .evaluate((item) => getComputedStyle(item).cursor),
  ).not.toBe('row-resize');
  // Dragging the bar up by 120 px makes the timeline 120 px taller.
  const before = await height(page);
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.mouse.move(spot.x, spot.y - 120, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => height(page)).toBeCloseTo(before + 120, 0);
  await page.screenshot({ path: testInfo.outputPath('taller.png') });
  // A press on a control does not resize.
  const play = page.locator('#timeline-foundation [data-action="split"]');
  const playBox = (await play.boundingBox())!;
  const taller = await height(page);
  await page.mouse.move(playBox.x + 4, playBox.y + playBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(playBox.x + 4, playBox.y - 60, { steps: 4 });
  await page.mouse.up();
  expect(await height(page)).toBeCloseTo(taller, 0);
  // Clamped: at least 160 px, at most 60% of the window.
  let from = await emptySpot(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 900, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => height(page)).toBeCloseTo(160, 0);
  from = await emptySpot(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, 2, { steps: 8 });
  await page.mouse.up();
  const window = page.viewportSize()!.height;
  await expect.poll(() => height(page)).toBeCloseTo(window * 0.6, 0);
  // Remembered after a reload.
  await page.reload();
  await expect.poll(() => height(page)).toBeCloseTo(window * 0.6, 0);
});

test('[LAY-049] the scene strip is hidden by default; the button left of Scenes slides it in and out and the choice is remembered', async ({
  page,
}) => {
  const strip = page.locator('#scene-strip');
  const button = page.locator('#scene-strip-show');
  const scenes = page.locator('#scene-board-toggle');
  await expect(strip).toHaveClass(/strip-hidden/);
  expect((await strip.boundingBox())?.height ?? 0).toBeLessThan(1);
  // The strip stays in the page (hidden, not removed).
  await expect(strip.locator('.scene-strip-card')).toHaveCount(1);
  // The button sits to the left of Scenes.
  const b = (await button.boundingBox())!;
  const s = (await scenes.boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(s.x + 1);
  expect(Math.abs(b.y + b.height / 2 - (s.y + s.height / 2))).toBeLessThan(3);
  // A 240 ms slide.
  expect(
    await strip.evaluate((item) => getComputedStyle(item).transitionDuration),
  ).toContain('0.24s');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await strip.boundingBox())!.height).toBe(72);
  await expect(strip.locator('.scene-strip-card').first()).toBeVisible();
  await page.reload();
  await expect(strip).not.toHaveClass(/strip-hidden/);
  await page.locator('#scene-strip-show').click();
  await expect(strip).toHaveClass(/strip-hidden/);
  await page.reload();
  await expect(strip).toHaveClass(/strip-hidden/);
});

test('[LAY-050] the status row under the canvas has 20 px icons, 13 px text and 32 px buttons, and keeps every control', async ({
  page,
}) => {
  const footer = page.locator('#canvas-footer');
  for (const selector of [
    '[data-canvas-tool="hand"]',
    '[data-canvas-zoom="out"]',
    '#canvas-zoom-percent',
    '[data-canvas-zoom="in"]',
    '[data-canvas-zoom="fit"]',
    '[data-canvas-zoom="actual"]',
    '#fullscreen-preview',
    '#scene-strip-show',
    '#scene-board-toggle',
  ])
    await expect(footer.locator(selector)).toHaveCount(1);
  await expect(footer.locator('#selection-summary')).toHaveText(
    'No layer selected',
  );
  const sizes = await footer.evaluate((root) => ({
    icons: [...root.querySelectorAll('svg.icon')].map((item) => {
      const box = item.getBoundingClientRect();
      return Math.min(box.width, box.height);
    }),
    text: [...root.querySelectorAll('*')]
      .filter(
        (item) =>
          [...item.childNodes].some(
            (node) => node.nodeType === 3 && node.textContent!.trim(),
          ) && (item as HTMLElement).offsetParent,
      )
      .map((item) => parseFloat(getComputedStyle(item).fontSize)),
    // (The zoom field's own step arrows are part of the shared number
    // field; the field itself is the target.)
    buttons: [...root.querySelectorAll('button')]
      .filter(
        (item) =>
          (item as HTMLElement).offsetParent && !item.closest('.number-field'),
      )
      .map((item) => {
        const box = item.getBoundingClientRect();
        return Math.min(box.width, box.height);
      }),
  }));
  expect(sizes.icons.length).toBeGreaterThan(6);
  for (const size of sizes.icons) expect(size).toBeGreaterThanOrEqual(20);
  expect(sizes.text.length).toBeGreaterThan(2);
  for (const size of sizes.text) expect(size).toBeGreaterThanOrEqual(13);
  for (const size of sizes.buttons) expect(size).toBeGreaterThanOrEqual(32);
});
