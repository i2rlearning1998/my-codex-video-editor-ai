import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// U6: the frame panel at the timeline's bottom right: Current in frames
// (steps, typing; no history) and Start and End, the scene's playback and
// export range (one undo step each).
const panel = (page: Page) => page.locator('#timeline-foundation .frame-panel');
const scene = async (page: Page) => (await hook(page)).project.compositions[0]!;
const typeFrame = async (page: Page, id: string, value: string) => {
  const field = panel(page).locator(`#frame-${id}`);
  await field.click();
  await field.fill(value);
  await field.press('Enter');
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TL-087] the frame panel steps, types and shows the current frame at the scene fps; no history', async ({
  page,
}) => {
  await expect(panel(page)).toBeVisible();
  const box = (await panel(page).boundingBox())!;
  const timeline = (await page.locator('#timeline-foundation').boundingBox())!;
  // Bottom right of the timeline.
  expect(box.x + box.width).toBeGreaterThan(timeline.x + timeline.width - 40);
  expect(box.y + box.height).toBeGreaterThan(timeline.y + timeline.height - 40);
  expect(
    await panel(page)
      .locator('#frame-current')
      .evaluate((item) => parseFloat(getComputedStyle(item).fontSize)),
  ).toBeGreaterThanOrEqual(13);
  await expect(panel(page).locator('#frame-current')).toHaveValue('0');
  await panel(page).locator('[data-action="current-next"]').click();
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(1 / 30, 6);
  await panel(page)
    .locator('[data-action="current-next"]')
    .click({ modifiers: ['Shift'] });
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(11 / 30, 6);
  await expect(panel(page).locator('#frame-current')).toHaveValue('11');
  await typeFrame(page, 'current', '45');
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(1.5, 6);
  expect((await hook(page)).history.labels).toEqual([]);
  // Defaults: the first and the last frame.
  await expect(panel(page).locator('#frame-start')).toHaveValue('0');
  await expect(panel(page).locator('#frame-end')).toHaveValue(
    String(Math.round((await scene(page)).duration * 30)),
  );
});

test('[PB-016] Start and End set the playback and export range: playback loops from Start to End, the ruler dims outside, Start < End, undoable', async ({
  page,
}) => {
  await typeFrame(page, 'start', '30');
  await typeFrame(page, 'end', '60');
  expect((await scene(page)).playRange).toEqual({ start: 1, end: 2 });
  expect((await hook(page)).history.labels.slice(-2)).toEqual([
    'Playback range',
    'Playback range',
  ]);
  await expect(
    page.locator('#timeline-foundation .ruler-range-dim'),
  ).toHaveCount(2);
  // Start must stay before End.
  await typeFrame(page, 'start', '75');
  expect((await scene(page)).playRange).toEqual({ start: 1, end: 2 });
  // Play starts at Start and loops inside the range (T-ALL P4, D-186).
  await page.locator('#timeline-foundation [data-action="play"]').click();
  const seen: number[] = [];
  await expect
    .poll(
      async () => {
        seen.push((await hook(page)).session.time);
        return seen.some((time, i) => i > 0 && time < seen[i - 1]! - 0.3);
      },
      { timeout: 8000, intervals: [100] },
    )
    .toBe(true);
  for (const time of seen) {
    expect(time).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(time).toBeLessThanOrEqual(2 + 1e-6);
  }
  await page.locator('#timeline-foundation [data-action="play"]').click();
  // The lanes are dimmed outside the range, not only the ruler.
  await expect(
    page.locator('#timeline-foundation .lanes-range-dim'),
  ).toHaveCount(2);
  // First and Last frame go to Start and End.
  await page.locator('#timeline-foundation [data-action="last-frame"]').click();
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(2, 6);
  await page
    .locator('#timeline-foundation [data-action="first-frame"]')
    .click();
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(1, 6);
  // Five digits fit the fields.
  const field = panel(page).locator('#frame-end');
  await field.click();
  await field.fill('12345');
  expect(
    await field.evaluate(
      (input: HTMLInputElement) => input.scrollWidth <= input.clientWidth + 1,
    ),
  ).toBe(true);
  await field.press('Escape');
  for (const steps of await panel(page).locator('.number-field-steps').all())
    await expect(steps).toBeHidden();
  // Export covers Start to End.
  await page.locator('#export').click();
  const more = page.locator('#export-more');
  if ((await more.getAttribute('open')) === null)
    await more.locator('summary').click();
  await expect(page.locator('#export-start')).toHaveValue(/^1(\.0+)?$/);
  await expect(page.locator('#export-end')).toHaveValue(/^2(\.0+)?$/);
  await page.keyboard.press('Escape');
  // Undo restores the whole scene.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await scene(page)).playRange).toBeUndefined();
  // V2 (spec 2b, D-191): the dims always exist; with the whole scene as the
  // range, nothing before the scene's start is dimmed.
  await expect
    .poll(() =>
      page
        .locator('#timeline-foundation .ruler-range-dim[data-side="before"]')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeLessThan(1);
});
