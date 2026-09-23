import type { Page } from '@playwright/test';
import { test, expect, hook, toScreen } from './fixtures';

// Fixture nle-example.json at 80 px/s, 30 fps:
//   Video 1: clip-a 0..2 (source 0..2 of 6 s), clip-b 3..5 (source 1..3)
//   Video 2: clip-c 1..4 (image, source 0..3 of 5 s)
//   Video 3: empty
test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('nle-example.json');
});

const clipEl = (page: Page, id: string) =>
  page.locator(`.timeline-clip[data-clip-id="${id}"]`);
/** Snapshot lookup: clip by id with its track id. */
async function clips(page: Page) {
  const tracks = (await hook(page)).project.compositions[0]!.tracks;
  const map = new Map(
    tracks.flatMap((track) =>
      track.clips.map((clip) => [clip.id, { ...clip, trackId: track.id }]),
    ),
  );
  return (id: string) => map.get(id)!;
}
async function seek(page: Page, seconds: number) {
  const box = (await page.locator('.timeline-ruler').boundingBox())!;
  await page.mouse.click(box.x + seconds * 80, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
async function selectClip(page: Page, id: string) {
  await clipEl(page, id).click({ position: { x: 30, y: 10 } });
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
}
async function span(page: Page) {
  return Number(
    await page.locator('.timeline-content').getAttribute('data-span'),
  );
}
/** RGB at a composition coordinate on the canvas. */
async function pixel(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y);
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, { px, py }) => {
      const box = canvas.getBoundingClientRect();
      const scale = canvas.width / box.width;
      const data = canvas
        .getContext('2d')!
        .getImageData(
          Math.round((px - box.x) * scale),
          Math.round((py - box.y) * scale),
          1,
          1,
        ).data;
      return [data[0], data[1], data[2]];
    },
    { px: point.x, py: point.y },
  );
}
const isBackground = (rgb: readonly (number | undefined)[]) =>
  Math.abs(rgb[0]! - 240) < 6 &&
  Math.abs(rgb[1]! - 238) < 6 &&
  Math.abs(rgb[2]! - 231) < 6;

test('[TL-055] scrolling or zooming out near the end keeps extending the ruler; the playhead stops at the content end', async ({
  page,
}, testInfo) => {
  const scroll = page.locator('.timeline-scroll');
  const first = await span(page);
  expect(first).toBeGreaterThan(5); // content end plus an empty viewport
  const box = (await scroll.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let previous = first;
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(20000, 0);
    await expect.poll(() => span(page)).toBeGreaterThan(previous);
    previous = await span(page);
  }
  expect(previous).toBeGreaterThan(first * 2);
  const lastLabel = await page
    .locator('.timeline-ruler span')
    .last()
    .textContent();
  expect(Number.parseFloat(lastLabel!)).toBeGreaterThan(first);
  await page.screenshot({ path: testInfo.outputPath('infinite-scrolled.png') });
  // Zooming out keeps the ruler covering the whole visible track area.
  await page.mouse.wheel(-1e6, 0);
  for (let i = 0; i < 6; i++)
    await page.getByRole('button', { name: 'Timeline zoom out' }).click();
  await expect
    .poll(async () => (await hook(page)).session.timelinePxPerSecond)
    .toBeLessThan(30);
  const ruler = (await page.locator('.timeline-ruler').boundingBox())!;
  expect(ruler.x + ruler.width).toBeGreaterThanOrEqual(box.x + box.width - 1);
  // Clicking the ruler past the content end parks the playhead at the end.
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.click(ruler.x + 12 * zoom, ruler.y + 8);
  await expect.poll(async () => (await hook(page)).session.time).toBe(5);
});

test('[TL-056] clips show dedicated trim handles with a resize cursor and a grip on hover; dragging one trims', async ({
  page,
}, testInfo) => {
  const handle = page.locator('[data-clip-id="clip-b"] .timeline-trim.left');
  const grip = () =>
    handle.evaluate((el) => getComputedStyle(el, '::after').opacity);
  expect(await grip()).toBe('0');
  const style = await handle.evaluate((el) => ({
    cursor: getComputedStyle(el).cursor,
    width: el.getBoundingClientRect().width,
  }));
  expect(style.cursor).toBe('ew-resize');
  expect(style.width).toBeGreaterThanOrEqual(8);
  expect(
    await clipEl(page, 'clip-b').evaluate((el) => getComputedStyle(el).cursor),
  ).toBe('grab');
  await handle.hover();
  await expect.poll(grip).toBe('1');
  await page.screenshot({ path: testInfo.outputPath('trim-handle-hover.png') });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 5 - 40, box.y + 10, { steps: 8 });
  await page.mouse.up();
  const b = (await clips(page))('clip-b');
  expect([b.startTime, b.duration, b.sourceIn, b.sourceOut]).toEqual([
    2.5, 2.5, 0.5, 3,
  ]);
  await page.locator('#undo').click();
  expect((await clips(page))('clip-b').startTime).toBe(3);
});

test('[TL-019][TL-018] trims stop at the neighbouring clip and at the end of the source media', async ({
  page,
}) => {
  const drag = async (selector: string, dx: number) => {
    const box = (await page.locator(selector).boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 5 + dx, box.y + 10, { steps: 12 });
    await page.mouse.up();
  };
  await selectClip(page, 'clip-a');
  await drag('[data-clip-id="clip-a"] .timeline-trim.right', 200);
  let state = await clips(page);
  expect(state('clip-a').startTime + state('clip-a').duration).toBe(3);
  expect(state('clip-a').sourceOut).toBe(3);
  await selectClip(page, 'clip-b');
  await drag('[data-clip-id="clip-b"] .timeline-trim.left', -200);
  state = await clips(page);
  // Source in-point 1 allows one second; clip-a now ends at 3, so no room.
  expect(state('clip-b').startTime).toBe(3);
  expect((await hook(page)).history.labels).toEqual(['Trim clip']);
  await page.locator('#undo').click();
  await selectClip(page, 'clip-b');
  await drag('[data-clip-id="clip-b"] .timeline-trim.left', -200);
  state = await clips(page);
  expect([state('clip-b').startTime, state('clip-b').sourceIn]).toEqual([2, 0]);
  await drag('[data-clip-id="clip-b"] .timeline-trim.right', 600);
  state = await clips(page);
  // Source 0..6 of a 6 s asset: the right edge stops at 2 + 6.
  expect(state('clip-b').startTime + state('clip-b').duration).toBe(8);
  expect(state('clip-b').sourceOut).toBe(6);
});

test('[TL-057] clip, playhead and marker drags snap with a visible guide line', async ({
  page,
}, testInfo) => {
  const guide = page.locator('.timeline-snap');
  // Clip move: clip-a's end snaps to the playhead at 2.5 s.
  await seek(page, 2.5);
  await selectClip(page, 'clip-a');
  const a = (await clipEl(page, 'clip-a').boundingBox())!;
  await page.mouse.move(a.x + 30, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 30 + 44, a.y + 10, { steps: 10 });
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute('data-time', '2.5');
  const line = (await guide.boundingBox())!;
  const tracks = (await page
    .locator('.timeline-nle-row')
    .last()
    .boundingBox())!;
  expect(line.y + line.height).toBeGreaterThanOrEqual(
    tracks.y + tracks.height - 1,
  );
  await page.screenshot({ path: testInfo.outputPath('snap-clip.png') });
  await page.mouse.up();
  await expect(guide).toHaveCount(0);
  expect((await clips(page))('clip-a').startTime).toBe(0.5);
  // Playhead drag: snaps to clip-b's start at 3 s.
  await page.locator('#undo').click();
  await seek(page, 0.5);
  const head = (await page.locator('.timeline-playhead').boundingBox())!;
  await page.mouse.move(head.x + head.width / 2, head.y + 10);
  await page.mouse.down();
  await page.mouse.move(head.x + head.width / 2 + 2.5 * 80 - 5, head.y + 10, {
    steps: 10,
  });
  await expect(guide).toHaveAttribute('data-time', '3');
  await page.mouse.up();
  expect((await hook(page)).session.time).toBe(3);
  await expect(guide).toHaveCount(0);
  // Marker drag: a marker at 1.5 s snaps to clip-a's end at 2 s.
  await seek(page, 1.5);
  await page.getByRole('button', { name: '+ Marker' }).click();
  // Move the playhead off the marker so the marker handle is not covered.
  await seek(page, 0.5);
  const marker = (await page.locator('.timeline-marker').boundingBox())!;
  await page.mouse.move(marker.x + marker.width / 2, marker.y + 8);
  await page.mouse.down();
  await page.mouse.move(marker.x + marker.width / 2 + 36, marker.y + 8, {
    steps: 8,
  });
  await expect(guide).toHaveAttribute('data-time', '2');
  await page.mouse.up();
  expect(
    (await hook(page)).project.compositions[0]!.markers.map((m) => m.time),
  ).toEqual([2]);
  expect((await hook(page)).session.time).toBe(0.5);
});

test('[TL-058] a cross-track drag shows a ghost at the landing track and time, commits it in one step, and Escape cancels', async ({
  page,
}, testInfo) => {
  const before = (await hook(page)).project;
  await selectClip(page, 'clip-c');
  const c = (await clipEl(page, 'clip-c').boundingBox())!;
  await page.mouse.move(c.x + 30, c.y + 10);
  await page.mouse.down();
  await page.mouse.move(c.x + 30 + 40, c.y + 10 + 34, { steps: 10 });
  const ghost = page.locator(
    '.timeline-track[data-track-id="video-3"] .timeline-clip-ghost[data-ghost-for="clip-c"]',
  );
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveAttribute('data-start-time', '1.5');
  const ghostBox = (await ghost.boundingBox())!;
  const ruler = (await page.locator('.timeline-ruler').boundingBox())!;
  expect(ghostBox.x - ruler.x).toBeCloseTo(1.5 * 80, 0);
  // The original stays dimmed in its own track at its original time.
  await expect(
    page.locator(
      '.timeline-track[data-track-id="video-2"] [data-clip-id="clip-c"]',
    ),
  ).toHaveClass(/drag-origin/);
  expect((await clipEl(page, 'clip-c').boundingBox())!.x).toBeCloseTo(c.x, 0);
  await page.screenshot({ path: testInfo.outputPath('cross-track-ghost.png') });
  await page.mouse.up();
  await expect(ghost).toHaveCount(0);
  const moved = (await clips(page))('clip-c');
  expect([moved.trackId, moved.startTime]).toEqual(['video-3', 1.5]);
  expect((await hook(page)).history.labels).toEqual(['Move clip']);
  await page.locator('#undo').click();
  expect((await hook(page)).project).toEqual(before);
  // Escape mid-drag leaves the project unchanged.
  await selectClip(page, 'clip-c');
  const again = (await clipEl(page, 'clip-c').boundingBox())!;
  await page.mouse.move(again.x + 30, again.y + 10);
  await page.mouse.down();
  await page.mouse.move(again.x + 70, again.y + 44, { steps: 10 });
  await expect(ghost).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ghost).toHaveCount(0);
  await page.mouse.up();
  expect((await hook(page)).project).toEqual(before);
});

test('[TL-059] Lock, Hide, Solo and Mute toggles show pressed state; Solo previews only soloed tracks without history', async ({
  page,
}, testInfo) => {
  for (const [action, field, name] of [
    ['track-lock', 'locked', 'Lock Video 2'],
    ['track-enable', 'enabled', 'Hide Video 2'],
    ['track-mute', 'muted', 'Mute Video 2'],
  ] as const) {
    const toggle = page.locator(`[data-action="${action}"][data-id="video-2"]`);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-label', name);
    await expect(toggle).toHaveAttribute('title', name);
    const initial = (await hook(page)).project.compositions[0]!.tracks[1]![
      field
    ];
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect((await hook(page)).project.compositions[0]!.tracks[1]![field]).toBe(
      !initial,
    );
    await page.locator('#undo').click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  }
  // Solo: layer-c (Video 2) is drawn at 1.5 s until Video 1 is soloed.
  await seek(page, 1.5);
  expect(isBackground(await pixel(page, 320, 420))).toBe(false);
  const history = (await hook(page)).history;
  const solo = page.locator('[data-action="track-solo"][data-id="video-1"]');
  await expect(solo).toHaveAttribute('aria-label', 'Solo Video 1');
  await solo.click();
  await expect(solo).toHaveAttribute('aria-pressed', 'true');
  expect((await hook(page)).session.soloTrackIds).toEqual(['video-1']);
  await expect
    .poll(async () => isBackground(await pixel(page, 320, 420)))
    .toBe(true);
  // Video 1's own clip is still drawn.
  expect(isBackground(await pixel(page, 120, 120))).toBe(false);
  expect((await hook(page)).history).toEqual(history);
  await page.screenshot({ path: testInfo.outputPath('track-solo.png') });
  await solo.click();
  await expect(solo).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(async () => isBackground(await pixel(page, 320, 420)))
    .toBe(false);
});

test('[TL-060][TL-044] keyboard nudges, moves across tracks, trims to the playhead and jumps between cuts', async ({
  page,
}) => {
  await selectClip(page, 'clip-b');
  await page.keyboard.press('Alt+ArrowLeft');
  expect((await clips(page))('clip-b').startTime).toBeCloseTo(3 - 1 / 30, 9);
  await page.keyboard.press('Shift+Alt+ArrowLeft');
  expect((await clips(page))('clip-b').startTime).toBeCloseTo(3 - 11 / 30, 9);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await clips(page))('clip-b').startTime).toBe(3);
  await selectClip(page, 'clip-c');
  await page.keyboard.press('Alt+ArrowDown');
  expect((await clips(page))('clip-c').trackId).toBe('video-3');
  await page.keyboard.press('Alt+ArrowUp');
  expect((await clips(page))('clip-c').trackId).toBe('video-2');
  // [ and ] trim to the playhead.
  await selectClip(page, 'clip-b');
  await seek(page, 4);
  await page.keyboard.press(']');
  let b = (await clips(page))('clip-b');
  expect([b.startTime, b.duration, b.sourceOut]).toEqual([3, 1, 2]);
  await seek(page, 3.5);
  await page.keyboard.press('[');
  b = (await clips(page))('clip-b');
  expect([b.startTime, b.duration, b.sourceIn]).toEqual([3.5, 0.5, 1.5]);
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  expect((await clips(page))('clip-b').duration).toBe(2);
  // Up and Down jump between cuts (clip edges and markers).
  await seek(page, 0.5);
  await page.keyboard.press('ArrowDown');
  expect((await hook(page)).session.time).toBe(1);
  await page.keyboard.press('ArrowDown');
  expect((await hook(page)).session.time).toBe(2);
  await page.keyboard.press('ArrowUp');
  expect((await hook(page)).session.time).toBe(1);
  // Documented in the shortcut sheet.
  await page.keyboard.press('Control+/');
  const sheet = page.locator('#shortcut-sheet');
  await expect(sheet).toContainText('Trim clip start to playhead: [');
  await expect(sheet).toContainText('Move clip to the track below: Alt+↓');
  await expect(sheet).toContainText('Jump to next cut: ↓');
});

async function timelineMenu(page: Page, clipId: string) {
  await clipEl(page, clipId).click({
    button: 'right',
    position: { x: 20, y: 10 },
  });
  await expect(page.locator('.timeline-menu')).toBeVisible();
}
async function canvasMenu(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('#canvas-context-menu')).toBeVisible();
}

test('[VID-015] Speed from the timeline and canvas menus changes duration, shows a badge, refuses overlaps and round-trips undo/redo', async ({
  page,
}, testInfo) => {
  await timelineMenu(page, 'clip-c');
  await page
    .locator('.timeline-menu')
    .getByRole('menuitem', { name: 'Speed ›' })
    .click();
  await page
    .locator('.timeline-menu')
    .getByRole('menuitemradio', { name: '2×' })
    .click();
  let c = (await clips(page))('clip-c');
  expect([c.speed, c.duration, c.sourceIn, c.sourceOut]).toEqual([
    2, 1.5, 0, 3,
  ]);
  const badge = clipEl(page, 'clip-c').locator('[data-badge="speed"]');
  await expect(badge).toHaveText('2×');
  await page.screenshot({ path: testInfo.outputPath('speed-badge.png') });
  await page.locator('#undo').click();
  c = (await clips(page))('clip-c');
  expect([c.speed, c.duration]).toEqual([1, 3]);
  await expect(badge).toHaveCount(0);
  await page.locator('#redo').click();
  expect((await clips(page))('clip-c').speed).toBe(2);
  // Canvas menu on layer-c at 1.5 s: 0.5x doubles the source length.
  await seek(page, 1.5);
  await canvasMenu(page, 500, 500);
  const menu = page.locator('#canvas-context-menu');
  await menu.getByRole('menuitem', { name: 'Speed ›' }).click();
  await menu.getByRole('menuitemradio', { name: '0.5×' }).click();
  c = (await clips(page))('clip-c');
  expect([c.speed, c.duration]).toEqual([0.5, 6]);
  await page.locator('#undo').click();
  expect((await clips(page))('clip-c').speed).toBe(2);
  // Slowing clip-a into clip-b is refused and changes nothing.
  const before = (await hook(page)).project;
  await timelineMenu(page, 'clip-a');
  await page
    .locator('.timeline-menu')
    .getByRole('menuitem', { name: 'Speed ›' })
    .click();
  await page
    .locator('.timeline-menu')
    .getByRole('menuitemradio', { name: '0.25×' })
    .click();
  await expect(page.locator('#status')).toContainText('Not enough room');
  expect((await hook(page)).project).toEqual(before);
});

test('[VID-016] Reverse toggles from the timeline and canvas menus with a badge and undo/redo', async ({
  page,
}) => {
  await timelineMenu(page, 'clip-c');
  await page
    .locator('.timeline-menu')
    .getByRole('menuitemcheckbox', { name: 'Reverse' })
    .click();
  let c = (await clips(page))('clip-c');
  expect(c.metadata).toEqual({ reversed: true });
  expect([c.sourceIn, c.sourceOut, c.duration]).toEqual([0, 3, 3]);
  await expect(
    clipEl(page, 'clip-c').locator('[data-badge="reverse"]'),
  ).toBeVisible();
  await timelineMenu(page, 'clip-c');
  await expect(
    page
      .locator('.timeline-menu')
      .getByRole('menuitemcheckbox', { name: 'Reverse' }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.locator('#undo').click();
  expect((await clips(page))('clip-c').metadata).toEqual({});
  await page.locator('#redo').click();
  expect((await clips(page))('clip-c').metadata).toEqual({ reversed: true });
  // Canvas menu toggles it back off.
  await seek(page, 1.5);
  await canvasMenu(page, 500, 500);
  await page
    .locator('#canvas-context-menu')
    .getByRole('menuitemcheckbox', { name: 'Reverse' })
    .click();
  expect((await clips(page))('clip-c').metadata).toEqual({});
  await page.locator('#undo').click();
  expect((await clips(page))('clip-c').metadata).toEqual({ reversed: true });
});

test('[VID-017] Freeze frame holds the frame under the playhead from both menus with a badge and undo/redo', async ({
  page,
}) => {
  await seek(page, 2);
  await timelineMenu(page, 'clip-c');
  await page
    .locator('.timeline-menu')
    .getByRole('menuitemcheckbox', { name: 'Freeze frame' })
    .click();
  // clip-c starts at 1 with source in 0, so 2 s shows source 1 s.
  expect((await clips(page))('clip-c').metadata).toEqual({ freezeFrame: 1 });
  await expect(
    clipEl(page, 'clip-c').locator('[data-badge="freeze"]'),
  ).toBeVisible();
  await page.locator('#undo').click();
  expect((await clips(page))('clip-c').metadata).toEqual({});
  await expect(
    clipEl(page, 'clip-c').locator('[data-badge="freeze"]'),
  ).toHaveCount(0);
  await page.locator('#redo').click();
  expect((await clips(page))('clip-c').metadata).toEqual({ freezeFrame: 1 });
  await page.locator('#undo').click();
  await canvasMenu(page, 500, 500);
  await page
    .locator('#canvas-context-menu')
    .getByRole('menuitemcheckbox', { name: 'Freeze frame' })
    .click();
  expect((await clips(page))('clip-c').metadata).toEqual({ freezeFrame: 1 });
  await page.locator('#undo').click();
  expect((await clips(page))('clip-c').metadata).toEqual({});
});
