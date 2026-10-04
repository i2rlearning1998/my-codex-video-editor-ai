import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect, hook, showCategory, toScreen } from './fixtures';

// J9: drag and drop. Media dragged from the Media panel shows where it lands
// (a box over the canvas only; a ghost clip with its time on the timeline; a
// purple separator with + for a new lane), a clip of the same kind offers
// Replace, and a timeline clip released outside the timeline stays put.
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const PNG = 'image_gradient_1920x1080.png';

const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const labels = async (page: Page) => (await hook(page)).history.labels;
const card = (page: Page, name: string) =>
  page.locator(`.media-card[data-name="${name}"]`);
const visualLanes = (page: Page) =>
  page.locator(
    '#timeline-foundation .timeline-nle-row[data-lane-group="visual"]',
  );

async function importMedia(page: Page, ...names: string[]) {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(names.map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
}
/** Presses on a media card and moves a little, starting an HTML5 drag. */
async function pickUp(page: Page, from: Locator) {
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, {
    steps: 3,
  });
}
async function moveTo(page: Page, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 6 });
}
/** Adds an imported file from its media menu; returns the new layer's id. */
async function addToScene(page: Page, name: string) {
  const item = page.locator(
    `.media-item:has(.media-card[data-name="${name}"])`,
  );
  await item.locator('.media-card').click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  return (await hook(page)).session.selectedIds[0]!;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TL-066] media over the canvas shows a drop box only there; over the timeline a ghost clip with its time, and a separator with + makes a new lane', async ({
  page,
}, testInfo) => {
  await importMedia(page, JPG, PNG);
  // A first picture gives the scene a visual lane.
  await addToScene(page, JPG);
  const lanesBefore = (await scene(page)).tracks.length;
  const box = page.locator('.canvas-drop-box');
  await pickUp(page, card(page, PNG));
  // Over the canvas: the box, the picture's shape (16:9), centred on the
  // pointer.
  const centre = await toScreen(page, 640, 360);
  await moveTo(page, centre.x, centre.y);
  await expect(box).toBeVisible();
  const drawn = (await box.boundingBox())!;
  expect(drawn.width / drawn.height).toBeCloseTo(16 / 9, 1);
  expect(Math.abs(drawn.x + drawn.width / 2 - centre.x)).toBeLessThan(3);
  await page.screenshot({ path: testInfo.outputPath('canvas-drop-box.png') });
  // Over the timeline: no box; a ghost clip with its start time. (At 6 s,
  // past the first picture's 5 s clip: over a clip it would offer Replace.)
  const lane = visualLanes(page).first();
  await lane.scrollIntoViewIfNeeded();
  const track = (await lane.locator('.timeline-track').boundingBox())!;
  await moveTo(page, track.x + 480, track.y + track.height / 2);
  await expect(box).toBeHidden();
  const ghost = page.locator('#timeline-foundation .timeline-asset-ghost');
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveText(/^\d+(\.\d+)? s$/);
  await expect(lane).toHaveClass(/asset-drop-target/);
  await page.screenshot({ path: testInfo.outputPath('timeline-ghost.png') });
  // At the lane's bottom edge: the separator; the drop makes a new lane.
  await moveTo(page, track.x + 480, track.y + track.height - 2);
  const separator = page.locator('#timeline-foundation .timeline-lane-insert');
  await expect(separator).toBeVisible();
  await page.mouse.up();
  await expect(separator).toHaveCount(0);
  const after = await scene(page);
  expect(after.tracks.length).toBe(lanesBefore + 1);
  expect((await labels(page)).at(-1)).toBe('Add timeline clip');
  // The new clip has a lane of its own, in the visual group.
  const png = after.layers.find(
    (layer) => layer.type === 'image' && layer.name === PNG,
  )!;
  const home = after.tracks.find((item) =>
    item.clips.some((clip) => clip.layerId === png.id),
  )!;
  expect(home.type).toBe('video');
  expect(home.clips).toHaveLength(1);
});

test('[TL-067] media over a lane of another group is refused, and a clip of the same kind offers Replace', async ({
  page,
}) => {
  await importMedia(page, JPG, PNG);
  const first = await addToScene(page, JPG);
  const steps = (await labels(page)).length;
  // Over a text-and-shapes lane: not allowed; the drop changes nothing.
  await pickUp(page, card(page, PNG));
  const text = page
    .locator('#timeline-foundation .timeline-nle-row[data-lane-group="text"]')
    .last();
  await text.scrollIntoViewIfNeeded();
  const textBox = (await text.locator('.timeline-track').boundingBox())!;
  await moveTo(page, textBox.x + 200, textBox.y + textBox.height / 2);
  await expect(text).toHaveClass(/drop-refused/);
  await expect(page.locator('#timeline-foundation')).toHaveClass(
    /lane-refused/,
  );
  await page.mouse.up();
  expect((await labels(page)).length).toBe(steps);
  // Over the picture's clip: the drop offers Replace and Add as a new clip.
  const clip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === first)!;
  const element = page.locator(
    `#timeline-foundation .timeline-clip[data-clip-id="${clip.id}"]`,
  );
  await element.scrollIntoViewIfNeeded();
  const at = (await element.boundingBox())!;
  await pickUp(page, card(page, PNG));
  await moveTo(page, at.x + 30, at.y + at.height / 2);
  await expect(element).toHaveClass(/replace-target/);
  await page.mouse.up();
  const menu = page.locator('.replace-drop-menu');
  await expect(menu.locator('[role="menuitem"]')).toHaveText([
    'Replace clip',
    'Add as a new clip',
  ]);
  await menu.locator('[data-action="drop-replace"]').click();
  expect((await labels(page)).at(-1)).toBe('Replace media');
  const png = (await hook(page)).project.assets.find(
    (asset) => asset.name === PNG,
  )!;
  const layer = (await scene(page)).layers.find((item) => item.id === first)!;
  expect(layer.assetId).toBe(png.id);
  // One step: Undo puts the first picture back.
  await page.keyboard.press('Control+z');
  expect(
    (await scene(page)).layers.find((item) => item.id === first)!.assetId,
  ).not.toBe(png.id);
});

test('[TL-068] a timeline clip released outside the timeline stays where it was; Escape cancels a clip drag', async ({
  page,
}) => {
  const clip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === 'example-headline')!;
  const element = page.locator(
    `#timeline-foundation .timeline-clip[data-clip-id="${clip.id}"]`,
  );
  await element.scrollIntoViewIfNeeded();
  const steps = (await labels(page)).length;
  const at = (await element.boundingBox())!;
  // Drag up onto the canvas and let go there.
  await page.mouse.move(at.x + 40, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + 120, at.y + at.height / 2, { steps: 4 });
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  await page.mouse.move(at.x + 120, canvas.y + canvas.height / 2, {
    steps: 6,
  });
  await expect(page.locator('#timeline-foundation')).toHaveClass(
    /drag-outside/,
  );
  await page.mouse.up();
  const after = (await scene(page)).tracks
    .flatMap((track) => track.clips.map((item) => ({ ...item, track })))
    .find((item) => item.id === clip.id)!;
  expect(after.startTime).toBe(clip.startTime);
  expect((await labels(page)).length).toBe(steps);
  // Escape during a drag puts it back too.
  await page.mouse.move(at.x + 40, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + 140, at.y + at.height / 2, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const still = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.id === clip.id)!;
  expect(still.startTime).toBe(clip.startTime);
  expect((await labels(page)).length).toBe(steps);
});
