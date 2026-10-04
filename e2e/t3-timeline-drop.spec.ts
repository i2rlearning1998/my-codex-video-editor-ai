import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';

// T3: Clipchamp's timeline drop rules. A clip-sized ghost at the snapped time
// with a guide; over a clip the left third inserts before it, the right third
// after it and the middle replaces it; a "+" line at a lane's edge makes a new
// lane; a lane of another group refuses. Moving a clip follows the same rules,
// and a lane a move or drop leaves empty is removed in the same undo step.
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const lanes = async (page: Page) =>
  [...(await scene(page)).tracks].sort((a, b) => a.order - b.order);
const labels = async (page: Page) => (await hook(page)).history.labels;
const rows = (page: Page) =>
  page.locator('#timeline-foundation .timeline-nle-row');
const clipOf = (page: Page, clipId: string) =>
  page.locator(`#timeline-foundation .timeline-clip[data-clip-id="${clipId}"]`);
const ghost = (page: Page) =>
  page.locator('#timeline-foundation .timeline-asset-ghost');
const ZOOM = 80;
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';

async function blankScene(page: Page) {
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await expect.poll(async () => (await scene(page)).layers.length).toBe(0);
}
/** Adds a rectangle at the playhead by a click on its preset. */
async function addRectangle(page: Page) {
  await showCategory(page, 'Elements');
  const before = (await scene(page)).layers.length;
  await page.locator('[data-shape="rectangle"]').first().click();
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(before + 1);
  return (await scene(page)).layers.at(-1)!.id;
}
const clipIdOf = async (page: Page, layerId: string) =>
  (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.layerId === layerId)!.id;
/** Presses at (x, y), moves to (tx, ty) in steps and leaves the button
 *  down, so the caller can look at the drop marks before releasing. */
async function press(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
}
const centre = async (from: Locator) => {
  const box = (await from.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

/** The element's box once it stops moving (the timeline re-renders after
 *  an edit). */
async function stable(from: Locator) {
  let last = '';
  let box: Awaited<ReturnType<Locator['boundingBox']>> = null;
  await expect
    .poll(async () => {
      box = await from.boundingBox();
      const now = JSON.stringify(box);
      const same = now === last;
      last = now;
      return same && !!box;
    })
    .toBe(true);
  return box;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await blankScene(page);
});

test('[TL-076] moving a clip into another lane removes the lane it left; one Undo restores both', async ({
  page,
}) => {
  const a = await addRectangle(page);
  const b = await addRectangle(page);
  expect(await lanes(page)).toHaveLength(2);
  const clipA = await clipIdOf(page, a);
  const clipB = await clipIdOf(page, b);
  const laneB = (await lanes(page)).find((track) =>
    track.clips.some((clip) => clip.id === clipB),
  )!;
  // Drag A to 7 s on B's lane (empty time there).
  await clipOf(page, clipA).click();
  const from = await centre(clipOf(page, clipA));
  const row = await centre(
    page.locator(
      `#timeline-foundation .timeline-nle-row[data-track-id="${laneB.id}"]`,
    ),
  );
  const ruler = (await page.locator('.timeline-ruler').boundingBox())!;
  const steps = (await labels(page)).length;
  await press(page, from, { x: ruler.x + 7 * ZOOM + 2, y: row.y });
  await page.mouse.up();
  await expect.poll(async () => (await lanes(page)).length).toBe(1);
  await expect(rows(page)).toHaveCount(1);
  const [only] = await lanes(page);
  expect(only!.clips.map((clip) => clip.id).sort()).toEqual(
    [clipA, clipB].sort(),
  );
  expect((await labels(page)).length).toBe(steps + 1);
  // One Undo: two lanes again, A back where it was.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await lanes(page)).length).toBe(2);
  await expect(rows(page)).toHaveCount(2);
});

test('[TL-077] a dragged item shows a clip-sized ghost with its name and length at the snapped time and a guide; never the whole lane', async ({
  page,
}, testInfo) => {
  const a = await addRectangle(page);
  const lane = rows(page).first();
  const laneBox = (await lane.boundingBox())!;
  const ruler = (await page.locator('.timeline-ruler').boundingBox())!;
  await showCategory(page, 'Elements');
  const card = await centre(page.locator('[data-shape="rounded"]').first());
  // Over empty time on the rectangle's lane, a little after its 5 s end:
  // the ghost snaps to the end (5 s).
  await press(page, card, { x: ruler.x + 5 * ZOOM + 4, y: laneBox.y + 18 });
  await expect(ghost(page)).toBeVisible();
  const box = (await ghost(page).boundingBox())!;
  expect(Math.abs(box.x - (ruler.x + 5 * ZOOM))).toBeLessThan(2);
  // A 5 s preset: 5 s wide, inside the lane.
  expect(Math.abs(box.width - 5 * ZOOM)).toBeLessThan(2);
  expect(box.y).toBeGreaterThanOrEqual(laneBox.y - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(
    laneBox.y + laneBox.height + 1,
  );
  await expect(ghost(page).locator('.ghost-duration')).toHaveText(/5/);
  await expect(ghost(page).locator('.ghost-name')).not.toBeEmpty();
  const guide = page.locator('#timeline-foundation .timeline-drop-line');
  await expect(guide).toBeVisible();
  const line = (await guide.boundingBox())!;
  expect(Math.abs(line.x + line.width / 2 - (ruler.x + 5 * ZOOM))).toBeLessThan(
    2,
  );
  // The lane itself is not outlined.
  await expect(lane).not.toHaveClass(/asset-drop-target/);
  await page.screenshot({ path: testInfo.outputPath('ghost.png') });
  await page.mouse.up();
  const clip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId !== a)!;
  expect(clip.startTime).toBeCloseTo(5, 3);
  expect(await lanes(page)).toHaveLength(1);
});

test('[TL-078] over a clip: the left third inserts before it, the right third after it (later clips ripple), the middle replaces it with a Replace label', async ({
  page,
}, testInfo) => {
  const a = await addRectangle(page);
  const clipA = await clipIdOf(page, a);
  await showCategory(page, 'Elements');
  const card = page.locator('[data-shape="rounded"]').first();
  // Right third: after A (5 s), on A's lane.
  let over = await centre(clipOf(page, clipA));
  await press(page, await centre(card), {
    x: over.box.x + over.box.width * 0.85,
    y: over.y,
  });
  await page.mouse.up();
  let tracks = await lanes(page);
  expect(tracks).toHaveLength(1);
  const after = tracks[0]!.clips.find((clip) => clip.id !== clipA)!;
  expect(after.startTime).toBeCloseTo(5, 3);
  // Left third of A: before it; A and the clip after it ripple right by 5 s.
  over = await centre(clipOf(page, clipA));
  await press(page, await centre(card), {
    x: over.box.x + over.box.width * 0.15,
    y: over.y,
  });
  await page.mouse.up();
  tracks = await lanes(page);
  expect(tracks).toHaveLength(1);
  const byId = new Map(tracks[0]!.clips.map((clip) => [clip.id, clip]));
  expect(byId.get(clipA)!.startTime).toBeCloseTo(5, 3);
  expect(byId.get(after.id)!.startTime).toBeCloseTo(10, 3);
  const first = tracks[0]!.clips.find((clip) => clip.startTime < 0.001)!;
  expect(first.id).not.toBe(clipA);
  // Middle of A: Replace, with a label on A while over it.
  over = await centre(clipOf(page, clipA));
  const steps = (await labels(page)).length;
  await press(page, await centre(card), { x: over.x, y: over.y });
  const label = clipOf(page, clipA).locator('.replace-label');
  await expect(label).toBeVisible();
  await expect(label).toHaveText('Replace');
  await page.screenshot({ path: testInfo.outputPath('replace.png') });
  await page.mouse.up();
  tracks = await lanes(page);
  expect(tracks[0]!.clips.some((clip) => clip.id === clipA)).toBe(false);
  expect(tracks[0]!.clips).toHaveLength(3);
  expect(
    tracks[0]!.clips.find((clip) => Math.abs(clip.startTime - 5) < 0.001),
  ).toBeTruthy();
  expect((await labels(page)).length).toBe(steps + 1);
  expect((await labels(page)).at(-1)).toBe('Replace clip');
  // One Undo brings A back.
  await page.keyboard.press('Control+z');
  expect((await lanes(page))[0]!.clips.some((clip) => clip.id === clipA)).toBe(
    true,
  );
});

test('[TL-079] a "+" line at a lane edge makes a new lane; a lane of another group refuses; lanes are 36 px (text) and clips at least 28 px', async ({
  page,
}) => {
  await addRectangle(page);
  const lane = rows(page).first();
  const laneBox = (await lane.boundingBox())!;
  expect(Math.abs(laneBox.height - 36)).toBeLessThan(1);
  const clipBox = (await lane.locator('.timeline-clip').first().boundingBox())!;
  expect(clipBox.height).toBeGreaterThanOrEqual(28);
  const ruler = (await page.locator('.timeline-ruler').boundingBox())!;
  await showCategory(page, 'Elements');
  const card = await centre(page.locator('[data-shape="rounded"]').first());
  // At the lane's bottom edge: a "+" line, and the drop opens a new lane.
  await press(page, card, {
    x: ruler.x + 2 * ZOOM,
    y: laneBox.y + laneBox.height - 2,
  });
  const plus = page.locator('#timeline-foundation .timeline-lane-insert');
  await expect(plus).toBeVisible();
  const line = (await plus.boundingBox())!;
  expect(
    Math.abs(line.y + line.height / 2 - (laneBox.y + laneBox.height)),
  ).toBeLessThan(4);
  await expect(ghost(page)).toBeHidden();
  await page.mouse.up();
  await expect.poll(async () => (await lanes(page)).length).toBe(2);
  // A picture dragged over a text-and-shapes lane: refused, nothing changes.
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(path.join(MEDIA, JPG));
  await expect(page.locator('#media-import')).toBeHidden();
  const count = (await scene(page)).layers.length;
  await expect(rows(page)).toHaveCount(2);
  const target = (await stable(rows(page).first()))!;
  const steps = (await labels(page)).length;
  await press(
    page,
    await centre(page.locator(`.media-card[data-name="${JPG}"]`)),
    { x: ruler.x + 9 * ZOOM, y: target.y + target.height / 2 },
  );
  await expect(rows(page).first()).toHaveClass(/drop-refused/);
  await expect(ghost(page)).toBeHidden();
  await page.mouse.up();
  expect((await scene(page)).layers.length).toBe(count);
  expect((await labels(page)).length).toBe(steps);
});

test('[TL-080] a moved clip leaves a faint placeholder; released outside the timeline it stays where it was', async ({
  page,
}) => {
  const a = await addRectangle(page);
  const clipA = await clipIdOf(page, a);
  await clipOf(page, clipA).click();
  const from = await centre(clipOf(page, clipA));
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  const steps = (await labels(page)).length;
  // Over the "+" line under its lane: the clip stays as a faint placeholder.
  const lane = (await rows(page).first().boundingBox())!;
  await press(page, from, {
    x: from.x + 3 * ZOOM,
    y: lane.y + lane.height - 2,
  });
  await expect(clipOf(page, clipA)).toHaveClass(/drag-origin/);
  await expect(
    page.locator('#timeline-foundation .timeline-lane-insert'),
  ).toBeVisible();
  await page.mouse.move(canvas.x + 100, canvas.y + 100, { steps: 6 });
  await page.mouse.up();
  expect((await labels(page)).length).toBe(steps);
  const clip = (await scene(page)).tracks[0]!.clips[0]!;
  expect(clip.startTime).toBeCloseTo(0, 3);
  await expect(clipOf(page, clipA)).not.toHaveClass(/drag-origin/);
});
