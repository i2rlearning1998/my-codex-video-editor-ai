import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { test, expect, hook, menuAction, showCategory } from './fixtures';

// T1: one drag controller for every in-app source. A long session of mixed
// drags and clicks keeps working, a dropped OS file imports (and lands where
// it was dropped), and the same holds after a new project.
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const WEBM = 'video_testsrc_720p_2s_vp9_opus.webm';
const PNG = 'image_gradient_1920x1080.png';

const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const layerCount = async (page: Page) => (await scene(page)).layers.length;
const labels = async (page: Page) => (await hook(page)).history.labels;
const textLane = async (page: Page) =>
  (await page
    .locator('#timeline-foundation .timeline-nle-row[data-lane-group="text"]')
    .first()
    .boundingBox())!;
const mediaCard = (page: Page, name: string) =>
  page.locator(`.media-card[data-name="${name}"]`);

async function importWithPicker(page: Page, names: string[]) {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(names.map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
}
/** The element's box once the panel has stopped moving (a Recently used
 *  row can appear above the cards after the previous step). */
async function stableBox(from: Locator) {
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
  return box!;
}
/** A real mouse drag (press, a few moves, release). */
async function drag(page: Page, from: Locator, x: number, y: number) {
  const box = await stableBox(from);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, {
    steps: 2,
  });
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
}
/** Drops real files on `selector` like an OS drag (dragenter … drop). */
async function dropFiles(page: Page, names: string[], selector: string) {
  const files = names.map((name) => ({
    name,
    bytes: readFileSync(path.join(MEDIA, name)).toString('base64'),
  }));
  const transfer = await page.evaluateHandle((items) => {
    const data = new DataTransfer();
    for (const item of items) {
      const binary = atob(item.bytes);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      data.items.add(new File([bytes], item.name));
    }
    return data;
  }, files);
  const target = page.locator(selector);
  await target.dispatchEvent('dragenter', { dataTransfer: transfer });
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
}

/** 30 mixed drags and clicks from Media, Elements and Text onto the canvas
 *  and the timeline; every one adds exactly one element. */
async function session(page: Page) {
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  const timeline = page.locator('#timeline-foundation .timeline-scroll');
  for (let i = 0; i < 30; i++) {
    const source = i % 5;
    let from: Locator;
    if (source <= 1) {
      await showCategory(page, 'Media');
      from = mediaCard(page, source === 0 ? JPG : WEBM);
    } else if (source <= 3) {
      await showCategory(page, 'Elements');
      from = page
        .locator(`[data-shape="${source === 2 ? 'rectangle' : 'rounded'}"]`)
        .first();
    } else {
      await showCategory(page, 'Text');
      from = page.locator('.library-card[data-item-id="text-1"]').first();
    }
    await expect(from).toBeVisible();
    const before = await layerCount(page);
    const mode = i % 6;
    if (mode === 5) {
      await stableBox(from);
      await from.click();
    } else if (mode === 2) {
      // Onto the "+" line under the last lane of the item's own group (a
      // picture under a visual lane, a shape or text under a text-and-shapes
      // lane): a new lane (T3; over a clip's middle it would replace it).
      const lane = timeline
        .locator(
          `.timeline-nle-row[data-lane-group="${source <= 1 ? 'visual' : 'text'}"]`,
        )
        .last();
      // A new project may have no such lane yet: then the empty timeline.
      const box =
        (await lane.count()) > 0
          ? (await lane.scrollIntoViewIfNeeded(), await stableBox(lane))
          : (await timeline.boundingBox())!;
      await drag(
        page,
        from,
        box.x + 600 + i * 4,
        (await lane.count()) > 0 ? box.y + box.height - 2 : box.y + 18,
      );
    } else
      await drag(
        page,
        from,
        canvas.x + canvas.width * (0.3 + (i % 4) * 0.12),
        canvas.y + canvas.height * (0.35 + (i % 3) * 0.1),
      );
    await expect
      .poll(() => layerCount(page), { message: `step ${i}` })
      .toBe(before + 1);
  }
  // Escape cancels a drag: nothing is added and nothing is left behind.
  await showCategory(page, 'Media');
  const before = await layerCount(page);
  const box = (await mediaCard(page, JPG).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 200, canvas.y + 200, { steps: 6 });
  await expect(page.locator('.drag-follow')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-follow')).toHaveCount(0);
  expect(await layerCount(page)).toBe(before);
  // An OS file dropped on the canvas imports it and places it there.
  const assets = (await hook(page)).project.assets.length;
  await dropFiles(page, [PNG], '#composition-canvas');
  await expect
    .poll(async () => (await hook(page)).project.assets.length)
    .toBe(assets + 1);
  await expect.poll(() => layerCount(page)).toBe(before + 1);
  await expect(page.locator('#drop-overlay')).toBeHidden();
}

test('[MED-039][MED-040][MED-041] 30 mixed drags and clicks, an OS file drop, and all of it again after a new project', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await importWithPicker(page, [JPG, WEBM]);
  // Thumbnails are images that must never start a browser drag of their own
  // (the cause of the stuck "no drop" pointer, D-169).
  await expect(mediaCard(page, JPG).locator('img')).toHaveAttribute(
    'draggable',
    'false',
  );
  await expect(mediaCard(page, JPG)).toHaveAttribute('draggable', 'false');
  await session(page);
  // A new project: the same session works again.
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
  expect(await layerCount(page)).toBe(0);
  await importWithPicker(page, [JPG, WEBM]);
  await session(page);
  expect((await labels(page)).length).toBeGreaterThanOrEqual(30);
});

test('[MED-040] a file dropped where a panel stops the event still hides the import overlay', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'Media');
  // The Media panel's drop zone stops the drop from bubbling; the overlay
  // used to stay up and catch every later drag.
  await dropFiles(page, [JPG], '#media-dropzone');
  await expect(page.locator('#drop-overlay')).toBeHidden();
  await expect(mediaCard(page, JPG)).toBeVisible();
  // The overlay never takes the pointer.
  expect(
    await page
      .locator('#drop-overlay')
      .evaluate((item) => getComputedStyle(item).pointerEvents),
  ).toBe('none');
});

test('[MED-041] a click adds a media or library item; a drag onto the timeline starts its clip at the drop time', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await importWithPicker(page, [JPG]);
  const time = (await hook(page)).session.time;
  await mediaCard(page, JPG).click();
  expect((await labels(page)).at(-1)).toBe('Add asset layer');
  const added = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.name === JPG)!;
  expect(added.startTime).toBeCloseTo(time, 3);
  // A rectangle dragged to 12 s on the timeline (empty time on the first
  // lane, past the example's 10 s) starts there.
  await showCategory(page, 'Elements');
  const ruler = (await page.locator('.timeline-ruler').boundingBox())!;
  const ids = new Set((await scene(page)).layers.map((layer) => layer.id));
  await drag(
    page,
    page.locator('[data-shape="rectangle"]').first(),
    ruler.x + 12 * 80,
    // (U1: the picture's lane is now on top; aim at a text lane.)
    (await textLane(page)).y + 18,
  );
  expect((await labels(page)).at(-1)).toBe('Add shape');
  // (U1: the layers array is in lane order; find the new one.)
  const shape = (await scene(page)).layers.find((layer) => !ids.has(layer.id))!;
  const clip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === shape.id)!;
  expect(clip.startTime).toBeCloseTo(12, 1);
});
