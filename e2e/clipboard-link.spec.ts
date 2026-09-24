import type { Page } from '@playwright/test';
import { test, expect, hook, toScreen, rulerBox } from './fixtures';

// Fixture nle-example.json at 80 px/s, 30 fps:
//   Video 1: clip-a 0..2, clip-b 3..5 (asset-video) · Video 2: clip-c 1..4 · Video 3: empty
test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('nle-example.json');
});

const clipEl = (page: Page, id: string) =>
  page.locator(`.timeline-clip[data-clip-id="${id}"]`);
interface Row {
  id: string;
  name: string;
  trackId: string;
  layerId: string;
  assetId: string | null;
  startTime: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  metadata: Record<string, unknown>;
}
async function rows(page: Page): Promise<Row[]> {
  return JSON.parse(
    JSON.stringify(
      (await hook(page)).project.compositions[0]!.tracks.flatMap((track) =>
        track.clips.map((clip) => ({ ...clip, trackId: track.id })),
      ),
    ),
  );
}
const row = async (page: Page, id: string) =>
  (await rows(page)).find((item) => item.id === id)!;
async function overlaps(page: Page) {
  const all = await rows(page);
  return all.flatMap((a) =>
    all
      .filter(
        (b) =>
          a.id < b.id &&
          a.trackId === b.trackId &&
          a.startTime < b.startTime + b.duration - 1e-9 &&
          b.startTime < a.startTime + a.duration - 1e-9,
      )
      .map((b) => `${a.id}/${b.id}`),
  );
}
async function select(page: Page, id: string, add = false) {
  await clipEl(page, id).click({
    position: { x: 30, y: 10 },
    ...(add ? { modifiers: ['Shift' as const] } : {}),
  });
}
async function seek(page: Page, seconds: number) {
  const box = await rulerBox(page);
  await page.mouse.click(box.x + seconds * 80, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
async function menu(page: Page, clipId: string, name: string) {
  await clipEl(page, clipId).click({
    button: 'right',
    position: { x: 30, y: 10 },
  });
  await page
    .locator('.timeline-menu')
    .getByRole('menuitem', { name, exact: true })
    .click();
}

test('[TL-027] copy, cut and paste clips at the playhead onto the selected track', async ({
  page,
}, testInfo) => {
  // Ctrl+C / Ctrl+V: the copy lands at the playhead and pushes clip-b.
  await select(page, 'clip-a');
  await page.keyboard.press('Control+c');
  expect((await hook(page)).history.canUndo).toBe(false);
  await seek(page, 2);
  await select(page, 'clip-a');
  await page.keyboard.press('Control+v');
  const video1 = async () =>
    (await rows(page))
      .filter((item) => item.trackId === 'video-1')
      .map((item) => [item.startTime, item.duration])
      .sort((a, b) => a[0]! - b[0]!);
  expect(await video1()).toEqual([
    [0, 2],
    [2, 2],
    [4, 2],
  ]);
  expect(await overlaps(page)).toEqual([]);
  // The pasted clip is selected and independent (new layer and clip ids).
  const pasted = (await rows(page)).find(
    (item) => item.name === 'clip-a' && item.id !== 'clip-a',
  )!;
  expect((await hook(page)).session.selectedIds).toEqual([pasted.layerId]);
  await page.screenshot({ path: testInfo.outputPath('pasted.png') });
  // Paste again from the keyboard: a second independent copy.
  await page.keyboard.press('Control+v');
  expect(await video1()).toHaveLength(4);
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  expect(await video1()).toEqual([
    [0, 2],
    [3, 2],
  ]);
  // Cut from the timeline menu removes clip-c in one step; paste from the canvas.
  await menu(page, 'clip-c', 'Cut');
  expect((await rows(page)).map((item) => item.id)).not.toContain('clip-c');
  expect((await hook(page)).history.labels.at(-1)).toBe('Cut');
  await seek(page, 0.5);
  const empty = await toScreen(page, 1200, 680);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await page
    .locator('#canvas-context-menu')
    .getByRole('menuitem', { name: 'Paste', exact: true })
    .click();
  const back = (await rows(page)).find((item) => item.name === 'clip-c')!;
  expect([back.trackId, back.startTime, back.duration]).toEqual([
    'video-2',
    0.5,
    3,
  ]);
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  expect((await rows(page)).map((item) => item.id)).toContain('clip-c');
});

test('[TL-032] linked clips move, split, delete and copy together; unlink and detach audio', async ({
  page,
}, testInfo) => {
  // Link clip-a (Video 1) with clip-c (Video 2).
  await select(page, 'clip-a');
  await select(page, 'clip-c', true);
  await menu(page, 'clip-c', 'Link clips');
  const linkOf = async (id: string) => (await row(page, id)).metadata.linkId;
  expect(await linkOf('clip-a')).toBeTruthy();
  expect(await linkOf('clip-a')).toBe(await linkOf('clip-c'));
  await expect(
    clipEl(page, 'clip-a').locator('[data-badge="link"]'),
  ).toBeVisible();
  // Dragging clip-a alone carries clip-c along in time, each on its own track.
  await select(page, 'clip-a');
  const a = (await clipEl(page, 'clip-a').boundingBox())!;
  await page.mouse.move(a.x + 30, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(a.x + 30 + 40, a.y + 10, { steps: 8 });
  await page.mouse.up();
  let clipA = await row(page, 'clip-a');
  let clipC = await row(page, 'clip-c');
  expect([clipA.trackId, clipA.startTime]).toEqual(['video-1', 0.5]);
  expect([clipC.trackId, clipC.startTime]).toEqual(['video-2', 1.5]);
  expect((await hook(page)).history.labels.at(-1)).toBe('Move clip');
  // Alt+→ nudges both.
  await page.keyboard.press('Alt+ArrowRight');
  clipC = await row(page, 'clip-c');
  expect(clipC.startTime).toBeCloseTo(1.5 + 1 / 30, 9);
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  // Split at 1.5 s from clip-a alone cuts clip-c too; the new pieces stay linked.
  await select(page, 'clip-a');
  await seek(page, 1.5);
  await page.keyboard.press('s');
  const pieces = (await rows(page)).filter((item) => item.startTime === 1.5);
  expect(pieces.map((item) => item.trackId).sort()).toEqual([
    'video-1',
    'video-2',
  ]);
  expect(pieces[0]!.metadata.linkId).toBe(pieces[1]!.metadata.linkId);
  await page.locator('#undo').click();
  // Delete from clip-a alone removes clip-c; Undo restores both.
  await select(page, 'clip-a');
  await page.keyboard.press('Delete');
  expect((await rows(page)).map((item) => item.id)).not.toContain('clip-c');
  await page.locator('#undo').click();
  // Copying clip-a alone copies its partner; the pasted pair is linked anew.
  await select(page, 'clip-a');
  await page.keyboard.press('Control+c');
  await seek(page, 4.5);
  await page.keyboard.press('Control+v');
  const copies = (await rows(page)).filter(
    (item) => !['clip-a', 'clip-b', 'clip-c'].includes(item.id),
  );
  expect(copies.map((item) => [item.trackId, item.startTime]).sort()).toEqual([
    ['video-1', 5],
    ['video-2', 5.5],
  ]);
  expect(copies[0]!.metadata.linkId).toBe(copies[1]!.metadata.linkId);
  expect(copies[0]!.metadata.linkId).not.toBe(await linkOf('clip-a'));
  expect(await overlaps(page)).toEqual([]);
  await page.locator('#undo').click();
  // Unlink separates them again.
  await menu(page, 'clip-c', 'Unlink clips');
  expect(await linkOf('clip-a')).toBeUndefined();
  expect(await linkOf('clip-c')).toBeUndefined();
  await expect(
    clipEl(page, 'clip-a').locator('[data-badge="link"]'),
  ).toHaveCount(0);
  // Detach audio from clip-b: a separate audio clip on a new Audio track.
  await menu(page, 'clip-b', 'Detach audio');
  const project = (await hook(page)).project;
  const audioTrack = project.compositions[0]!.tracks.find(
    (track) => track.type === 'audio',
  )!;
  expect(audioTrack.name).toBe('Audio 1');
  const audio = (await rows(page)).find(
    (item) => item.trackId === audioTrack.id,
  )!;
  expect([
    audio.startTime,
    audio.duration,
    audio.sourceIn,
    audio.sourceOut,
  ]).toEqual([3, 2, 1, 3]);
  expect(audio.metadata).toEqual({ detachedFrom: 'clip-b' });
  expect(
    project.assets.find((asset) => asset.id === audio.assetId),
  ).toMatchObject({
    type: 'audio',
    source: { kind: 'generated', reference: 'audio-of:asset-video' },
  });
  expect((await row(page, 'clip-b')).metadata).toEqual({ audioDetached: true });
  await expect(
    page.locator(`.timeline-clip[data-clip-id="${audio.id}"]`),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('detached-audio.png') });
  await page.locator('#undo').click();
  expect((await hook(page)).project.compositions[0]!.tracks).toHaveLength(3);
  expect((await row(page, 'clip-b')).metadata).toEqual({});
});
