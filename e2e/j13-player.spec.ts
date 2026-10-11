import type { Page } from '@playwright/test';
import { test, expect, hook, rulerBox } from './fixtures';

// J13: the Player panel: the AI wand (planned) and scissors on the left;
// previous cut, back 5 s, play, forward 5 s and the timecode in the centre;
// zoom out, zoom in, fit and collapse floating on the right. The ruler
// adapts to the zoom; Collapse leaves a large preview over the player bar.
const time = async (page: Page) => (await hook(page)).session.time;
const control = (page: Page, action: string) =>
  page.locator(`#timeline-foundation [data-action="${action}"]`);
async function seek(page: Page, seconds: number) {
  const box = await rulerBox(page);
  await page.mouse.click(box.x + seconds * 80, box.y + 8);
  await expect.poll(() => time(page)).toBeCloseTo(seconds, 2);
}
const labelStep = (page: Page) =>
  page
    .locator('#timeline-foundation .timeline-ruler > span:not(.ruler-duration)')
    .evaluateAll((items) => {
      const lefts = items.map((item) => (item as HTMLElement).offsetLeft);
      return lefts.length > 1 ? lefts[1]! - lefts[0]! : 0;
    });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TL-073] the player bar: wand planned, scissors split; previous cut, back and forward 5 s and the timecode; zoom out, in and fit; the ruler adapts', async ({
  page,
}, testInfo) => {
  const steps = (await hook(page)).history.labels.length;
  await expect(control(page, 'ai-tools')).toBeDisabled();
  await expect(control(page, 'ai-tools')).toHaveAttribute(
    'title',
    'Planned: Wave 10 (AI-001)',
  );
  await expect(control(page, 'split').locator('svg')).toHaveCount(1);
  // Back and forward 5 s, clamped to the scene.
  await seek(page, 7);
  const timecode = page.locator('#timeline-foundation [data-timecode]');
  // (T5) minutes and whole seconds.
  await expect(timecode).toHaveText('0:07 / 0:10');
  await control(page, 'back-5').click();
  await expect.poll(() => time(page)).toBeCloseTo(2, 6);
  await expect(timecode).toHaveText('0:02 / 0:10');
  await control(page, 'forward-5').click();
  await expect.poll(() => time(page)).toBeCloseTo(7, 6);
  await control(page, 'forward-5').click();
  await expect.poll(() => time(page)).toBeCloseTo(10, 6);
  // Previous cut: (T5) no longer on the bar; the palette runs it, and the
  // playhead goes back to the nearest clip edge.
  await expect(control(page, 'previous-cut')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await page.locator('#command-palette input').fill('Jump to previous cut');
  await page.keyboard.press('Enter');
  await expect.poll(() => time(page)).toBeLessThan(10);
  // The ruler adapts: zooming in spreads its labels further apart.
  const before = await labelStep(page);
  await control(page, 'zoom-in').click();
  await control(page, 'zoom-in').click();
  await control(page, 'zoom-in').click();
  await expect.poll(() => labelStep(page)).not.toBe(before);
  // Fit: the whole scene fits the visible lanes.
  await control(page, 'zoom-fit').click();
  const scroll = (await page
    .locator('#timeline-foundation .timeline-scroll')
    .boundingBox())!;
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  // V2 (D-191): no lane header in front of the lanes.
  expect(10 * zoom).toBeLessThanOrEqual(scroll.width);
  expect(10 * zoom).toBeGreaterThan(scroll.width * 0.8);
  // None of this is an undo step.
  expect((await hook(page)).history.labels.length).toBe(steps);
  await page.screenshot({ path: testInfo.outputPath('player.png') });
});

test('[TL-074] Collapse leaves a large preview over the player bar; Expand brings the lanes back (no history)', async ({
  page,
}) => {
  const canvasBefore = (await page
    .locator('#composition-canvas')
    .boundingBox())!;
  const toggle = control(page, 'collapse-timeline');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(page.locator('.editor-shell')).toHaveClass(/timeline-collapsed/);
  await expect(
    page.locator('#timeline-foundation .timeline-scroll'),
  ).toBeHidden();
  // The player bar stays, with Play and Expand.
  await expect(control(page, 'play')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Expand the timeline');
  await expect
    .poll(
      async () =>
        (await page.locator('#composition-canvas').boundingBox())!.height,
    )
    .toBeGreaterThan(canvasBefore.height + 100);
  await toggle.click();
  await expect(
    page.locator('#timeline-foundation .timeline-scroll'),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect((await hook(page)).history.labels).toEqual([]);
});
