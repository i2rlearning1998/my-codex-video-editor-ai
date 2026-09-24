import type { Page } from '@playwright/test';
import { test, expect, hook, rulerBox } from './fixtures';

// Fixture nle-example.json at 80 px/s, 30 fps:
//   Video 1: clip-a 0..2, clip-b 3..5 · Video 2: clip-c 1..4 · Video 3: empty
const clipEl = (page: Page, id: string) =>
  page.locator(`.timeline-clip[data-clip-id="${id}"]`);
async function clips(page: Page) {
  const tracks = (await hook(page)).project.compositions[0]!.tracks;
  const map = new Map(
    tracks.flatMap((track) =>
      track.clips.map((clip) => [clip.id, { ...clip, trackId: track.id }]),
    ),
  );
  return (id: string) => map.get(id)!;
}
async function overlaps(page: Page) {
  const tracks = (await hook(page)).project.compositions[0]!.tracks;
  return tracks.flatMap((track) =>
    track.clips.flatMap((a) =>
      track.clips
        .filter(
          (b) =>
            a.id < b.id &&
            a.startTime < b.startTime + b.duration - 1e-9 &&
            b.startTime < a.startTime + a.duration - 1e-9,
        )
        .map((b) => `${a.id}/${b.id}`),
    ),
  );
}
async function selectClip(page: Page, id: string) {
  await clipEl(page, id).click({ position: { x: 30, y: 10 } });
  await expect(clipEl(page, id)).toHaveAttribute('aria-pressed', 'true');
}
async function seek(page: Page, seconds: number) {
  const box = await rulerBox(page);
  await page.mouse.click(box.x + seconds * 80, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TL-001] every layer is a clip on a track: example, canvas drops and groups create no legacy rows', async ({
  page,
  openFixtureProject,
}, testInfo) => {
  const legacy = page.locator('.timeline-row:not(.timeline-nle-row)');
  const unclipped = async () => {
    const composition = (await hook(page)).project.compositions[0]!;
    const linked = new Set(
      composition.tracks.flatMap((track) =>
        track.clips.map((clip) => clip.layerId),
      ),
    );
    return composition.layers
      .filter((layer) => !linked.has(layer.id))
      .map((layer) => layer.id);
  };
  // The built-in example opens as clips on Text and Graphics tracks.
  await expect(page.locator('.timeline-nle-row').first()).toBeVisible();
  await expect(legacy).toHaveCount(0);
  expect(await unclipped()).toEqual([]);
  await expect(
    page.locator('.timeline-track-header .track-name', { hasText: 'Text 1' }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('example-as-clips.png') });
  // A media drop on the canvas becomes a clip on a free video track.
  await openFixtureProject('nle-example.json');
  await page.locator('[data-category="Media"]').click();
  const asset = page.locator('.media-card[data-name="Footage 1080p"]');
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  await asset.dragTo(canvas, {
    targetPosition: { x: box.width / 2, y: box.height / 2 },
  });
  await expect(legacy).toHaveCount(0);
  expect(await unclipped()).toEqual([]);
  const dropped = (await hook(page)).project.compositions[0]!.tracks.find(
    (track) => track.id === 'video-3',
  )!.clips;
  expect(dropped.map((clip) => clip.name)).toEqual(['Footage 1080p']);
  // Grouping two clips leaves one group clip; the children lose theirs.
  await page.locator('#undo').click();
  await selectClip(page, 'clip-a');
  await clipEl(page, 'clip-b').click({
    position: { x: 30, y: 10 },
    modifiers: ['Shift'],
  });
  await clipEl(page, 'clip-b').click({
    button: 'right',
    position: { x: 30, y: 10 },
  });
  await page
    .locator('.timeline-menu')
    .getByRole('menuitem', { name: 'Group' })
    .click();
  await expect(legacy).toHaveCount(0);
  expect(await unclipped()).toEqual([]);
  const state = await clips(page);
  expect(state('clip-a')).toBeUndefined();
  expect(state('clip-b')).toBeUndefined();
  const groupTrack = (await hook(page)).project.compositions[0]!.tracks.find(
    (track) => track.type === 'object',
  )!;
  expect(groupTrack.name).toBe('Graphics 1');
  expect(
    groupTrack.clips.map((clip) => [clip.startTime, clip.duration]),
  ).toEqual([[0, 5]]);
  expect((await hook(page)).history.labels.at(-1)).toBe('Group');
});

test('[TL-004] a locked track blocks delete, drag, trim, split and keyboard edits with visible feedback', async ({
  page,
  openFixtureProject,
}) => {
  await openFixtureProject('nle-example.json');
  await page.locator('[data-action="track-lock"][data-id="video-1"]').click();
  await expect(clipEl(page, 'clip-a')).toHaveClass(/locked/);
  expect(
    await clipEl(page, 'clip-a').evaluate((el) => getComputedStyle(el).cursor),
  ).toBe('not-allowed');
  const before = (await hook(page)).project;
  const toast = page.locator('.toast-error', { hasText: 'Track is locked' });
  // Selecting a locked clip is allowed and silent.
  await selectClip(page, 'clip-a');
  await expect(toast).toHaveCount(0);
  await page.keyboard.press('Delete');
  await expect(toast.first()).toBeVisible();
  const a = (await clipEl(page, 'clip-a').boundingBox())!;
  await page.mouse.move(a.x + 40, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 120, a.y + 10, { steps: 8 });
  await page.mouse.up();
  const handle = (await page
    .locator('[data-clip-id="clip-a"] .timeline-trim.right')
    .boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + 45, handle.y + 10, { steps: 6 });
  await page.mouse.up();
  await selectClip(page, 'clip-a');
  await seek(page, 1);
  await page.keyboard.press('s');
  await selectClip(page, 'clip-a');
  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.press(']');
  expect((await hook(page)).project.compositions[0]!.tracks).toEqual(
    before.compositions[0]!.tracks,
  );
  expect((await hook(page)).project.compositions[0]!.layers).toEqual(
    before.compositions[0]!.layers,
  );
  expect((await hook(page)).history.labels).toEqual(['Update track']);
});

test('[TL-020][TL-030] a drop onto occupied time inserts, previews the push and never overlaps', async ({
  page,
  openFixtureProject,
}, testInfo) => {
  await openFixtureProject('nle-example.json');
  const before = (await hook(page)).project;
  // Drag clip-a (0..2) so it lands at 2.5 s, over clip-b (3..5).
  await selectClip(page, 'clip-a');
  const a = (await clipEl(page, 'clip-a').boundingBox())!;
  await page.mouse.move(a.x + 30, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 30 + 200, a.y + 10, { steps: 12 });
  const marker = page.locator(
    '.timeline-track[data-track-id="video-1"] .timeline-insert',
  );
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('data-time', '2.5');
  await expect(clipEl(page, 'clip-b')).toHaveClass(/pushed/);
  const ruler = await rulerBox(page);
  expect((await clipEl(page, 'clip-b').boundingBox())!.x - ruler.x).toBeCloseTo(
    4.5 * 80,
    0,
  );
  await page.screenshot({ path: testInfo.outputPath('insert-push.png') });
  // Escape cancels the whole preview.
  await page.keyboard.press('Escape');
  await expect(marker).toHaveCount(0);
  await page.mouse.up();
  expect((await hook(page)).project).toEqual(before);
  // The real drop commits the insert and the push as one step.
  await selectClip(page, 'clip-a');
  await page.mouse.move(a.x + 30, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 30 + 200, a.y + 10, { steps: 12 });
  await page.mouse.up();
  let state = await clips(page);
  expect([state('clip-a').startTime, state('clip-b').startTime]).toEqual([
    2.5, 4.5,
  ]);
  expect(await overlaps(page)).toEqual([]);
  expect((await hook(page)).history.labels).toEqual(['Move clip']);
  await page.locator('#undo').click();
  expect((await hook(page)).project).toEqual(before);
  // Duplicate lands right after the original and pushes clip-b.
  await selectClip(page, 'clip-a');
  await page.keyboard.press('Control+d');
  const video1 = (await hook(page)).project.compositions[0]!.tracks[0]!.clips;
  expect(
    video1
      .map((clip) => [clip.startTime, clip.duration])
      .sort((x, y) => x[0]! - y[0]!),
  ).toEqual([
    [0, 2],
    [2, 2],
    [4, 2],
  ]);
  expect(await overlaps(page)).toEqual([]);
  await page.locator('#undo').click();
  // Alt+↓ moves clip-a onto Video 2 at 0 s and pushes clip-c (1..4) to 2 s.
  await selectClip(page, 'clip-a');
  await page.keyboard.press('Alt+ArrowDown');
  state = await clips(page);
  expect([state('clip-a').trackId, state('clip-c').startTime]).toEqual([
    'video-2',
    2,
  ]);
  expect(await overlaps(page)).toEqual([]);
  await page.locator('#undo').click();
  // Keyboard nudges stop at the neighbour instead of pushing it.
  await selectClip(page, 'clip-b');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+Alt+ArrowLeft');
  expect((await clips(page))('clip-b').startTime).toBeCloseTo(2, 9);
  expect(await overlaps(page)).toEqual([]);
});
