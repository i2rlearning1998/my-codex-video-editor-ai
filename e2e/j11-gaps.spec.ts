import type { Page } from '@playwright/test';
import { test, expect, hook, rulerBox } from './fixtures';

// J11: gaps between clips are hatched with a trash button (ripple close, one
// step); a faint playhead with its time follows the pointer over the lanes;
// the playhead has a white handle; moves snap with a guide.
// nle-example: Video 1 holds clip-a (0..2 s) and clip-b (3..5 s).
const clips = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  );
const clip = async (page: Page, id: string) =>
  (await clips(page)).find((item) => item.id === id)!;
const labels = async (page: Page) => (await hook(page)).history.labels;

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('nle-example.json');
});

test('[TL-071] a gap between clips is hatched; its trash button closes it, moving the later clips left in one step', async ({
  page,
}, testInfo) => {
  const lane = page.locator(
    '#timeline-foundation .timeline-nle-row[data-track-id="video-1"]',
  );
  const gap = lane.locator('.timeline-gap');
  await expect(gap).toHaveCount(1);
  await expect(gap).toHaveAttribute('data-start', '2');
  await expect(gap).toHaveAttribute('data-end', '3');
  expect(
    await gap.evaluate((node) => getComputedStyle(node).backgroundImage),
  ).toContain('repeating-linear-gradient');
  // The gap is as wide as one second (80 px/s).
  expect((await gap.boundingBox())!.width).toBeCloseTo(80, 0);
  await gap.hover();
  const trash = gap.locator('[data-action="close-gap"]');
  await expect(trash).toHaveAttribute('aria-label', 'Close the 1 s gap');
  await page.screenshot({ path: testInfo.outputPath('gap.png') });
  await trash.click();
  expect((await labels(page)).at(-1)).toBe('Close gap');
  expect((await clip(page, 'clip-b')).startTime).toBe(2);
  await expect(gap).toHaveCount(0);
  await page.locator('#undo').click();
  expect((await clip(page, 'clip-b')).startTime).toBe(3);
});

test('[TL-072] a faint playhead with its time follows the pointer over the lanes; the playhead has a white handle; a move snaps with a guide', async ({
  page,
}) => {
  const ruler = await rulerBox(page);
  const lane = (await page
    .locator(
      '#timeline-foundation .timeline-nle-row[data-track-id="video-2"] .timeline-track',
    )
    .boundingBox())!;
  // 6.5 s at 80 px/s, over an empty part of Video 2.
  await page.mouse.move(ruler.x + 6.5 * 80, lane.y + lane.height / 2);
  const ghost = page.locator('#timeline-foundation .timeline-hover-head');
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveText('6.5 s');
  expect(
    Math.abs((await ghost.boundingBox())!.x - (ruler.x + 6.5 * 80)),
  ).toBeLessThan(2);
  // Leaving the timeline hides it.
  await page.mouse.move(ruler.x + 100, ruler.y - 200);
  await expect(ghost).toHaveCount(0);
  // The playhead's handle is white.
  expect(
    await page
      .locator('#timeline-foundation .timeline-playhead')
      .evaluate((node) => getComputedStyle(node, '::before').backgroundColor),
  ).toBe('rgb(255, 255, 255)');
  // Dragging clip-b's start near clip-a's end snaps to it with a guide.
  const b = (await page
    .locator('#timeline-foundation [data-clip-id="clip-b"]')
    .boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + 10);
  await page.mouse.down();
  // 0.95 s left: within the snap distance of clip-a's end at 2 s.
  await page.mouse.move(b.x + 30 - 76, b.y + 10, { steps: 8 });
  await expect(
    page.locator('#timeline-foundation .timeline-snap'),
  ).toBeVisible();
  await page.mouse.up();
  expect((await clip(page, 'clip-b')).startTime).toBe(2);
});
