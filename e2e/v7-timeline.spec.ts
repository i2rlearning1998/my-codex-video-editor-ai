import type { Page } from '@playwright/test';
import { test, expect, hook, menuAction } from './fixtures';

// V7 (Clipchamp clone spec 10.3): 18 px of padding before time 0 (the
// playhead at 0 is whole), an empty timeline that is just a centred drop
// box, a bounded marquee auto-scroll and a collapsed player that is never
// cut by the window.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
const scroll = (page: Page) =>
  page.locator('#timeline-foundation .timeline-scroll');
const rect = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    });
async function newProject(page: Page) {
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
}

test('[TL-101] time 0 sits 18 px inside the timeline card: the 0s label, the first clip and the playhead handle at 0 are whole', async ({
  page,
}) => {
  // V7 (B27).
  const card = await rect(page, '#timeline-foundation .timeline-scroll');
  const lane = await rect(page, '#timeline-foundation .timeline-track');
  expect(lane.x - card.x).toBeCloseTo(18, 0);
  const ruler = await rect(page, '#timeline-foundation .timeline-ruler');
  expect(ruler.x - card.x).toBeCloseTo(18, 0);
  // The playhead at 0: its handle lies wholly inside the card.
  expect((await hook(page)).session.time).toBe(0);
  const handle = await rect(
    page,
    '#timeline-foundation .timeline-playhead [data-action="playhead-handle"], #timeline-foundation .timeline-playhead-handle, #timeline-foundation .timeline-playhead',
  );
  expect(handle.x).toBeGreaterThanOrEqual(card.x);
  const first = await rect(
    page,
    '#timeline-foundation .timeline-clip[data-action="clip"]',
  );
  expect(first.x).toBeGreaterThanOrEqual(lane.x - 0.5);
  // The right end has the same padding after the content.
  const content = await scroll(page).evaluate((element) => ({
    width: element.scrollWidth,
    track: (element.querySelector('.timeline-track') as HTMLElement)
      .offsetWidth,
  }));
  expect(content.width - content.track - 18).toBeCloseTo(18, 0);
});

test('[TL-102] an empty project shows only the drop box, centred both ways: no ruler, playhead, dim, frame row or scrolling', async ({
  page,
}) => {
  // V7 (B28).
  await newProject(page);
  const root = page.locator('#timeline-foundation');
  await expect(root).toHaveClass(/timeline-empty/);
  for (const selector of [
    '.timeline-ruler-bar',
    '.timeline-playhead',
    '.ruler-range-dim',
    '.lanes-range-dim',
    '.frame-panel',
  ])
    for (const item of await root.locator(selector).all())
      await expect(item).toBeHidden();
  const area = await rect(page, '#timeline-foundation .timeline-scroll');
  const drop = await rect(page, '#timeline-foundation .empty-drop-box');
  expect(
    Math.abs(drop.x + drop.width / 2 - (area.x + area.width / 2)),
  ).toBeLessThan(2);
  expect(
    Math.abs(drop.y + drop.height / 2 - (area.y + area.height / 2)),
  ).toBeLessThan(2);
  // Nothing scrolls: the wheel leaves it in place.
  await page.mouse.move(area.x + 20, area.y + 20);
  await page.mouse.wheel(0, 400);
  await page.mouse.wheel(400, 0);
  const after = await rect(page, '#timeline-foundation .empty-drop-box');
  expect(after.y).toBeCloseTo(drop.y, 0);
  expect(after.x).toBeCloseTo(drop.x, 0);
  expect(
    await scroll(page).evaluate((element) => [
      element.scrollTop,
      element.scrollLeft,
      element.scrollHeight <= element.clientHeight,
    ]),
  ).toEqual([0, 0, true]);
});

test('[TL-103] a marquee held at the lanes edge scrolls at most 300 px/s, never past the content, and stops on release', async ({
  page,
}) => {
  // V7 (B32): the example's lanes are taller than the panel.
  const area = await rect(page, '#timeline-foundation .timeline-scroll');
  const maxTop = await scroll(page).evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  expect(maxTop).toBeGreaterThan(0);
  // Start on empty space at the right of the first lane.
  await page.mouse.move(area.right - 40, area.y + 60);
  await page.mouse.down();
  await page.mouse.move(area.right - 60, area.y + 80, { steps: 3 });
  // Hold 2 px from the bottom edge for one second.
  const start = await scroll(page).evaluate((element) => element.scrollTop);
  const begun = Date.now();
  await page.mouse.move(area.right - 60, area.bottom - 2, { steps: 4 });
  const samples: [number, number][] = [];
  while (Date.now() - begun < 1000) {
    samples.push([
      Date.now(),
      await scroll(page).evaluate((element) => element.scrollTop),
    ]);
    await page.waitForTimeout(50);
  }
  const end = await scroll(page).evaluate((element) => element.scrollTop);
  const seconds = (Date.now() - begun) / 1000;
  expect(end).toBeGreaterThan(start);
  // Never faster than 300 px/s (plus one frame of slack), never past the end.
  expect(end - start).toBeLessThanOrEqual(300 * seconds + 20);
  for (let i = 1; i < samples.length; i++)
    expect(samples[i]![1] - samples[i - 1]![1]).toBeLessThanOrEqual(
      (300 * (samples[i]![0] - samples[i - 1]![0])) / 1000 + 12,
    );
  expect(Math.max(...samples.map(([, top]) => top))).toBeLessThanOrEqual(
    maxTop,
  );
  // Release: it stops at once and does not snap back.
  await page.mouse.up();
  const released = await scroll(page).evaluate((element) => element.scrollTop);
  await page.waitForTimeout(300);
  expect(await scroll(page).evaluate((element) => element.scrollTop)).toBe(
    released,
  );
  expect(released).toBeLessThanOrEqual(maxTop);
});

async function collapsedAt(page: Page, height: number) {
  // V7 (B35).
  await page.setViewportSize({ width: 1600, height });
  await page
    .locator('#timeline-foundation [data-action="collapse-timeline"]')
    .click();
  await expect(page.locator('.editor-shell')).toHaveClass(/timeline-collapsed/);
  await page.waitForTimeout(400);
  const card = await rect(page, '.editor-shell > .timeline');
  expect(height - card.bottom).toBeGreaterThanOrEqual(8);
  for (const selector of [
    '[data-action="play"]',
    '.player-scrub',
    '[data-action="collapse-timeline"]',
  ]) {
    const item = await rect(page, `#timeline-foundation ${selector}`);
    expect(item.bottom, selector).toBeLessThanOrEqual(card.bottom - 8);
    expect(item.y, selector).toBeGreaterThanOrEqual(card.y);
  }
}
test('[TL-104] collapsed player at 800 px: the card ends at least 8 px above the window and its controls are whole', async ({
  page,
}) => collapsedAt(page, 800));
test('[TL-104] collapsed player at 900 px: the card ends at least 8 px above the window and its controls are whole', async ({
  page,
}) => collapsedAt(page, 900));
test('[TL-104] collapsed player at 1080 px: the card ends at least 8 px above the window and its controls are whole', async ({
  page,
}) => collapsedAt(page, 1080));
