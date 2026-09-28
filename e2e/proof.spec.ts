import { test, expect, hook, toScreen, artboard, rulerBox } from './fixtures';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

async function seek(page: Page, seconds: number) {
  const box = await rulerBox(page);
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.click(box.x + seconds * zoom, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
async function drag(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  free = false,
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // CV-013: Ctrl held after the press (a Ctrl press toggles the selection) places freely.
  if (free) await page.keyboard.down('Control');
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
  if (free) await page.keyboard.up('Control');
}
async function headlinePosition(page: Page) {
  return (await hook(page)).project.compositions[0]!.layers.find(
    (layer) => layer.id === 'example-headline',
  )!.transform.position.value;
}
async function selectHeadline(page: Page) {
  await seek(page, 1.5);
  const point = await toScreen(page, 300, 250);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['example-headline']);
  return point;
}
const clipSelector = (id: string) => `.timeline-clip[data-clip-id="${id}"]`;
async function clipState(page: Page) {
  return (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  );
}

test('[CV-001] canvas click selects a layer and empty canvas deselects', async ({
  page,
}, testInfo) => {
  await selectHeadline(page);
  const empty = await toScreen(page, 1200, 690);
  await page.mouse.click(empty.x, empty.y);
  expect((await hook(page)).session.selectedIds).toEqual([]);
  expect((await hook(page)).history.canUndo).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('canvas-selection.png') });
});

test('[CV-004] known pixel drag moves by composition delta with one undo', async ({
  page,
}, testInfo) => {
  const point = await selectHeadline(page);
  const before = await headlinePosition(page);
  const scale = (await artboard(page)).scale;
  // Exact pointer delta: snapping (CV-013) is disabled with Ctrl.
  await drag(page, point, 60, 40, true);
  const after = await headlinePosition(page);
  expect(after[0] - before[0]).toBeCloseTo(60 / scale, 0);
  expect(after[1] - before[1]).toBeCloseTo(40 / scale, 0);
  expect((await hook(page)).history.labels).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('canvas-move.png') });
  await page.locator('#undo').click();
  expect(await headlinePosition(page)).toEqual(before);
  expect((await hook(page)).history.canUndo).toBe(false);
});

test('[HIS-001] one undo restores a canvas drag and redo reapplies it', async ({
  page,
}) => {
  const point = await selectHeadline(page);
  const before = await headlinePosition(page);
  await drag(page, point, 60, 40);
  const after = await headlinePosition(page);
  expect(after).not.toEqual(before);
  await page.locator('#undo').click();
  expect(await headlinePosition(page)).toEqual(before);
  expect((await hook(page)).history.canUndo).toBe(false);
  await page.locator('#redo').click();
  expect(await headlinePosition(page)).toEqual(after);
  expect((await hook(page)).history.canRedo).toBe(false);
});

test('[TL-021] Split button and S key create two contiguous clips at one second', async ({
  page,
  openFixtureProject,
}, testInfo) => {
  await openFixtureProject('nle-example.json');
  const before = await clipState(page);
  const assertSplit = async () => {
    const pieces = (await hook(page)).project.compositions[0]!.tracks.find(
      (track) => track.id === 'video-1',
    )!
      .clips.filter((clip) => clip.startTime < 2.5)
      .sort((a, b) => a.startTime - b.startTime);
    expect(pieces).toHaveLength(2);
    expect(pieces.map((clip) => [clip.startTime, clip.duration])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(await clipState(page)).toHaveLength(4);
  };
  await page
    .locator(clipSelector('clip-a'))
    .click({ position: { x: 40, y: 10 } });
  await seek(page, 1);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await assertSplit();
  await page.locator('#undo').click();
  expect(await clipState(page)).toEqual(before);
  await page
    .locator(clipSelector('clip-a'))
    .click({ position: { x: 40, y: 10 } });
  await seek(page, 1);
  await page.keyboard.press('s');
  await assertSplit();
  await page.screenshot({ path: testInfo.outputPath('timeline-split.png') });
});

test('[TL-025] Delete removes a selected clip and one undo restores it', async ({
  page,
  openFixtureProject,
}) => {
  await openFixtureProject('nle-example.json');
  const before = await clipState(page);
  await page
    .locator(clipSelector('clip-a'))
    .click({ position: { x: 40, y: 10 } });
  await page.keyboard.press('Delete');
  expect((await clipState(page)).map((clip) => clip.id)).not.toContain(
    'clip-a',
  );
  expect(await clipState(page)).toHaveLength(2);
  await page.locator('#undo').click();
  expect(await clipState(page)).toEqual(before);
  expect((await hook(page)).history.canUndo).toBe(false);
});

test('[PB-001] playback tracks elapsed time and Stop holds the playhead', async ({
  page,
  openFixtureProject,
}) => {
  await openFixtureProject('nle-example.json');
  await page
    .getByRole('button', { name: 'Play or pause', exact: true })
    .click();
  const started = Date.now();
  await expect
    .poll(() => Date.now() - started, { intervals: [20] })
    .toBeGreaterThanOrEqual(1000);
  const playing = (await hook(page)).session;
  expect(playing.playing).toBe(true);
  expect(playing.time).toBeGreaterThanOrEqual(0.7);
  expect(playing.time).toBeLessThanOrEqual(1.3);
  await page
    .getByRole('button', { name: 'Stop playback', exact: true })
    .click();
  const stopped = Date.now();
  await expect
    .poll(
      async () => {
        const state = (await hook(page)).session;
        if (state.playing || state.time !== 0)
          throw new Error('Stop did not hold at zero');
        return Date.now() - stopped;
      },
      { intervals: [20] },
    )
    .toBeGreaterThanOrEqual(500);
});
