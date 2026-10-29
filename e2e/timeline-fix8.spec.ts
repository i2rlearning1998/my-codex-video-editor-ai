import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  laneAction,
  menuAction,
  seekKeep,
} from './fixtures';

// FIX8: the timeline gaps. Fixture nle-example.json at 80 px/s, 30 fps:
//   Video 1: clip-a 0..2, clip-b 3..5 · Video 2: clip-c 1..4 · Video 3: empty
const clipEl = (page: Page, id: string) =>
  page.locator(`.timeline-clip[data-clip-id="${id}"]`);
const tracks = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.tracks;
const clipsOf = async (page: Page, trackId: string) =>
  (await tracks(page))
    .find((track) => track.id === trackId)!
    .clips.map((clip) => [
      clip.id,
      Math.round(clip.startTime * 100) / 100,
      Math.round(clip.duration * 100) / 100,
    ])
    .sort((a, b) => Number(a[1]) - Number(b[1]));
const clipCount = async (page: Page) =>
  (await tracks(page)).reduce((sum, track) => sum + track.clips.length, 0);

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('nle-example.json');
});

test('[TL-022] with nothing selected, Split cuts every unlocked clip under the playhead; a locked lane is left alone', async ({
  page,
}) => {
  await laneAction(page, 'video-2', 'track-lock');
  await seekKeep(page, 1.5);
  const split = page.locator('#timeline-foundation [data-action="split"]');
  await expect(split).toBeEnabled();
  await split.click();
  // clip-a (0..2) is cut at 1.5; clip-c on the locked lane is not.
  expect(await clipsOf(page, 'video-1')).toHaveLength(3);
  expect(await clipsOf(page, 'video-2')).toEqual([['clip-c', 1, 3]]);
  // One undo step puts it back.
  await page.keyboard.press('Control+z');
  expect(await clipsOf(page, 'video-1')).toHaveLength(2);
});

test('[TL-026] Shift+Delete deletes the clip and closes the gap, in one undo step', async ({
  page,
}) => {
  await clipEl(page, 'clip-a').click({ position: { x: 30, y: 10 } });
  await page.keyboard.press('Shift+Delete');
  // clip-b (3..5) moves left by clip-a's 2 s; the other lane is untouched.
  expect(await clipsOf(page, 'video-1')).toEqual([['clip-b', 1, 2]]);
  expect(await clipsOf(page, 'video-2')).toEqual([['clip-c', 1, 3]]);
  await page.keyboard.press('Control+z');
  expect(await clipsOf(page, 'video-1')).toEqual([
    ['clip-a', 0, 2],
    ['clip-b', 3, 2],
  ]);
});

test('[TL-024] Alt-drag copies the clip and leaves the original', async ({
  page,
}) => {
  const box = (await clipEl(page, 'clip-b').boundingBox())!;
  const from = { x: box.x + 30, y: box.y + box.height / 2 };
  const before = await clipCount(page);
  await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y, { steps: 6 });
  await page.mouse.move(from.x + 160, from.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(await clipCount(page)).toBe(before + 1);
  // The original did not move.
  expect(await clipsOf(page, 'video-1')).toContainEqual(['clip-b', 3, 2]);
  const all = (await tracks(page)).flatMap((track) => track.clips);
  const copy = all.find(
    (clip) => !['clip-a', 'clip-b', 'clip-c'].includes(clip.id),
  )!;
  // 160 px at 80 px/s: two seconds later.
  expect(copy.startTime).toBeCloseTo(5, 1);
  await page.keyboard.press('Control+z');
  expect(await clipCount(page)).toBe(before);
});

test("[TL-029] the magnet toggles snapping: on by default, trims land on other clips' edges, off they do not; remembered after a reload", async ({
  page,
}) => {
  const snap = page.locator('#timeline-foundation [data-action="snap"]');
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  // Trim clip-a's right edge (2 s) left by 76 px: 1.05 s, 5 px from clip-c's
  // start at 1 s.
  const trim = async () => {
    await clipEl(page, 'clip-a').click({ position: { x: 30, y: 10 } });
    const handle = (await page
      .locator('[data-clip-id="clip-a"] .timeline-trim.right')
      .boundingBox())!;
    const from = {
      x: handle.x + handle.width / 2,
      y: handle.y + handle.height / 2,
    };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 30, from.y, { steps: 4 });
    await page.mouse.move(from.x - 76, from.y, { steps: 4 });
    await page.mouse.up();
    return (await tracks(page))
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'clip-a')!.duration;
  };
  expect(await trim()).toBeCloseTo(1, 5);
  await page.keyboard.press('Control+z');
  await snap.click();
  await expect(snap).toHaveAttribute('aria-pressed', 'false');
  const loose = await trim();
  expect(Math.abs(loose - 1)).toBeGreaterThan(0.01);
  await page.screenshot({ path: 'reports/fix8-snap-off.png' });
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await expect(
    page.locator('#timeline-foundation [data-action="snap"]'),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('[PB-006] the loop button restarts playback at the end instead of stopping', async ({
  page,
}) => {
  const loop = page.locator('#timeline-foundation [data-action="loop"]');
  await expect(loop).toHaveAttribute('aria-pressed', 'false');
  await loop.click();
  await expect(loop).toHaveAttribute('aria-pressed', 'true');
  // Start 0.3 s before the end of the scene and play past it.
  const duration = (await hook(page)).project.compositions[0]!.duration;
  await seekKeep(page, duration - 0.3);
  await page.locator('#timeline-foundation [data-action="play"]').click();
  await page.waitForTimeout(1500);
  const state = await hook(page);
  expect(state.session.playing).toBe(true);
  expect(state.session.time).toBeLessThan(duration - 0.3);
  // Off: it stops at the end.
  await loop.click();
  await seekKeep(page, duration - 0.3);
  await page.locator('#timeline-foundation [data-action="play"]').click();
  await page.waitForTimeout(1200);
  const stopped = await hook(page);
  expect(stopped.session.playing).toBe(false);
});

test('[TL-029][PB-006] Snapping and Loop are also in the View menu, in step with the Player bar, and the bar stays inside a 1024 px window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  // Narrow window: the two toggles are not on the bar but still reachable.
  await expect(page.locator('[data-action="snap"]')).toBeHidden();
  const snap = page.locator('#view-snap');
  const loop = page.locator('#view-loop');
  await menuAction(page, '#view-snap');
  await expect(snap).toHaveAttribute('aria-checked', 'false');
  expect(
    await page.evaluate(() => localStorage.getItem('aive.timeline.snap')),
  ).toBe('0');
  await menuAction(page, '#view-loop');
  await expect(loop).toHaveAttribute('aria-checked', 'true');
  expect(
    await page.evaluate(() => localStorage.getItem('aive.player.loop')),
  ).toBe('1');
});
