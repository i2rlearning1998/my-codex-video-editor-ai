import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// T5: the Player bar. Left: the wand (planned), Split, Duplicate and Marker
// with labels; centre: First frame, Back 5 s, Previous frame, Play (largest),
// Next frame, Forward 5 s, Last frame and a timecode that takes a typed time;
// right: zoom out, zoom in, fit and collapse. Previous cut and Stop stay in
// the palette; the composition summary and px/s are gone from view.
const time = async (page: Page) => (await hook(page)).session.time;
const control = (page: Page, action: string) =>
  page.locator(
    `#timeline-foundation .timeline-controls [data-action="${action}"]`,
  );
const timecode = (page: Page) =>
  page.locator('#timeline-foundation [data-timecode]');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TL-081] the Player bar shows its controls in order with 13 px labels, 20 px icons, 32 px hit areas and the largest Play button', async ({
  page,
}, testInfo) => {
  const playback = await page
    .locator('#timeline-foundation .transport-playback > button')
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-action')),
    );
  expect(playback).toEqual([
    'first-frame',
    'back-5',
    'frame-back',
    'play',
    'frame-forward',
    'forward-5',
    'last-frame',
  ]);
  const left = page.locator('#timeline-foundation .transport-clip-tools');
  await expect(left.locator('button')).toHaveText([
    '',
    'Split',
    'Duplicate',
    '+ Marker',
  ]);
  await expect(control(page, 'ai-tools')).toBeDisabled();
  for (const action of ['previous-cut', 'stop'])
    await expect(control(page, action)).toHaveCount(0);
  // The px/s readout is gone; the composition summary is only for screen
  // readers (no visible width).
  await expect(
    page.locator('#timeline-foundation .timeline-controls'),
  ).not.toContainText('px/s');
  expect(
    await page
      .locator('#timeline-foundation [data-composition-strip]')
      .evaluate((item) => item.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1);
  const sizes = await page
    .locator('#timeline-foundation .timeline-controls')
    .evaluate((bar) => ({
      labels: [
        ...bar.querySelectorAll('.transport-clip-tools button span'),
      ].map((item) => parseFloat(getComputedStyle(item).fontSize)),
      icons: [...bar.querySelectorAll('svg.icon')].map((item) => {
        const box = item.getBoundingClientRect();
        return [item.closest('button')?.getAttribute('data-action'), box.width];
      }),
      buttons: [...bar.querySelectorAll('button')].map((item) => {
        const box = item.getBoundingClientRect();
        return [item.getAttribute('data-action'), box.width, box.height];
      }),
      code: getComputedStyle(bar.querySelector('[data-timecode]')!)
        .fontVariantNumeric,
    }));
  for (const size of sizes.labels) expect(size).toBeGreaterThanOrEqual(13);
  for (const [, width] of sizes.icons)
    expect(width as number).toBeGreaterThanOrEqual(20);
  const play = sizes.buttons.find(([action]) => action === 'play')!;
  for (const [action, width, height] of sizes.buttons) {
    expect(Math.min(width as number, height as number)).toBeGreaterThanOrEqual(
      32,
    );
    if (action !== 'play')
      expect(height as number).toBeLessThan(play[2] as number);
  }
  expect(sizes.code).toContain('tabular-nums');
  await page.screenshot({ path: testInfo.outputPath('player-bar.png') });
});

test('[TL-082] First and Last frame jump to the scene ends; the timecode reads 0:00 / 0:10 and a click on it takes a typed time', async ({
  page,
}) => {
  await expect(timecode(page)).toHaveText('0:00 / 0:10');
  await control(page, 'last-frame').click();
  await expect.poll(() => time(page)).toBeCloseTo(10, 6);
  await expect(timecode(page)).toHaveText('0:10 / 0:10');
  await control(page, 'first-frame').click();
  await expect.poll(() => time(page)).toBe(0);
  // Click, type 0:04.5, Enter: the playhead is at 4.5 s.
  await timecode(page).click();
  const field = timecode(page).locator('input');
  await expect(field).toBeFocused();
  await field.fill('0:04.5');
  await field.press('Enter');
  await expect.poll(() => time(page)).toBeCloseTo(4.5, 6);
  await expect(timecode(page)).toHaveText('0:04 / 0:10');
  // Seconds alone work too, and a time past the end is clamped.
  await timecode(page).click();
  await timecode(page).locator('input').fill('99');
  await timecode(page).locator('input').press('Enter');
  await expect.poll(() => time(page)).toBeCloseTo(10, 6);
  // Escape leaves the time unchanged.
  await timecode(page).click();
  await timecode(page).locator('input').fill('2');
  await timecode(page).locator('input').press('Escape');
  await expect(timecode(page).locator('input')).toHaveCount(0);
  expect(await time(page)).toBeCloseTo(10, 6);
  // From the keyboard: focus the timecode and press Enter.
  await timecode(page).focus();
  await page.keyboard.press('Enter');
  await expect(timecode(page).locator('input')).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await expect.poll(() => time(page)).toBeCloseTo(1, 6);
  // None of this is an undo step.
  expect((await hook(page)).history.labels).toEqual([]);
});

test('[TL-083] Stop and Previous cut are in the palette', async ({ page }) => {
  await control(page, 'last-frame').click();
  await page.keyboard.press('Control+k');
  await page.locator('#command-palette input').fill('Stop (back to the start)');
  await expect(page.locator('#palette-results')).toContainText(
    'Stop (back to the start)',
  );
  await page.keyboard.press('Enter');
  await expect.poll(() => time(page)).toBe(0);
  await expect(page.locator('#command-palette')).toBeHidden();
});
