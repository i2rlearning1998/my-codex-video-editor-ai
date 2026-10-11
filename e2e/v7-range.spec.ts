import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  openInspector,
  rulerBox,
  showCategory,
} from './fixtures';

// V7 (Clipchamp clone spec 11.1): Manual mode is a fixed range. Start and
// End are the user's: moving, stretching or adding clips never changes them,
// and the playhead stays inside them.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
const panel = (page: Page) => page.locator('#timeline-foundation .frame-panel');
const range = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.playRange;
const time = async (page: Page) => (await hook(page)).session.time;
async function typeFrame(page: Page, id: string, value: string) {
  const field = panel(page).locator(`#frame-${id}`);
  await field.click();
  await field.fill(value);
  await field.press('Enter');
}
const FIXED = { start: 20 / 30, end: 5 };

test('[PB-017] Manual Start 20 and End 150 never change when clips move, stretch or are added; ruler clicks, first and last frame and play stay inside them', async ({
  page,
}) => {
  await panel(page).locator('[data-action="range-mode"]').click();
  await typeFrame(page, 'start', '20');
  await typeFrame(page, 'end', '150');
  expect(await range(page)).toEqual(FIXED);
  // Move a clip by mouse on the timeline: Start stays 20.
  const clip = page.locator(
    '#timeline-foundation .timeline-clip[data-action="clip"][data-id="example-badge"]',
  );
  const before = (await clip.boundingBox())!;
  await page.mouse.move(before.x + 20, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + 140, before.y + before.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await clip.boundingBox())!.x)
    .toBeGreaterThan(before.x + 60);
  expect(await range(page)).toEqual(FIXED);
  // Stretch a clip to 20 s (past End): End stays 150.
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await openInspector(page);
  const duration = page.getByRole('spinbutton', { name: 'Duration' });
  await duration.fill('20');
  await duration.press('Enter');
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.duration)
    .toBeGreaterThanOrEqual(20);
  expect(await range(page)).toEqual(FIXED);
  // Add a new clip: the range is unchanged.
  await showCategory(page, 'Text');
  await page.locator('#add-text-box').click();
  await page.keyboard.press('Escape');
  expect(await range(page)).toEqual(FIXED);
  // A ruler click outside the range goes to the nearest edge.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Escape');
  const ruler = await rulerBox(page);
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  const scroll = page.locator('#timeline-foundation .timeline-scroll');
  await scroll.evaluate((element) => (element.scrollLeft = 0));
  const rulerNow = await rulerBox(page);
  await page.mouse.click(rulerNow.x + 0.1 * zoom, ruler.y + ruler.height / 2);
  await expect.poll(() => time(page)).toBeCloseTo(FIXED.start, 6);
  await page.mouse.click(rulerNow.x + 7 * zoom, ruler.y + ruler.height / 2);
  await expect.poll(() => time(page)).toBeCloseTo(FIXED.end, 6);
  // First and last frame are Start and End.
  await page
    .locator('#timeline-foundation [data-action="first-frame"]')
    .click();
  await expect.poll(() => time(page)).toBeCloseTo(FIXED.start, 6);
  await page.locator('#timeline-foundation [data-action="last-frame"]').click();
  await expect.poll(() => time(page)).toBeCloseTo(FIXED.end, 6);
  // Arrow stepping past End stays at End.
  await page
    .locator('#timeline-foundation [data-action="current-next"]')
    .click();
  await expect.poll(() => time(page)).toBeCloseTo(FIXED.end, 6);
  // Play from End starts at Start and never passes End.
  await page.locator('#timeline-foundation [data-action="play"]').click();
  const seen: number[] = [];
  await expect
    .poll(
      async () => {
        const state = (await hook(page)).session;
        seen.push(state.time);
        return state.playing;
      },
      { timeout: 10_000, intervals: [100] },
    )
    .toBe(false);
  expect(Math.min(...seen)).toBeGreaterThanOrEqual(FIXED.start - 1e-6);
  expect(Math.min(...seen)).toBeLessThan(FIXED.start + 0.5);
  expect(Math.max(...seen)).toBeLessThanOrEqual(FIXED.end + 1e-6);
  expect(await time(page)).toBeCloseTo(FIXED.end, 6);
  expect(await range(page)).toEqual(FIXED);
});
