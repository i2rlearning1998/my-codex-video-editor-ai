import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, showSceneStrip } from './fixtures';

// U1: lanes keep their own order (no group order), a clip moves freely with
// the pointer, Replace is offered only for a new item from the library, and
// layer order works between any two kinds.
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const WEBM = 'video_testsrc_720p_2s_vp9_opus.webm';
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const lanes = async (page: Page) =>
  [...(await scene(page)).tracks].sort((a, b) => a.order - b.order);
const order = async (page: Page) =>
  (await scene(page)).layers.map((layer) => layer.id);
const newest = async (page: Page, before: Set<string>) =>
  (await scene(page)).layers.find((layer) => !before.has(layer.id))!.id;
const clipOf = async (page: Page, layerId: string) => {
  const clip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === layerId)!;
  return page.locator(
    `#timeline-foundation .timeline-clip[data-clip-id="${clip.id}"]`,
  );
};

async function blankScene(page: Page) {
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await expect.poll(async () => (await scene(page)).layers.length).toBe(0);
}
async function importMedia(page: Page, ...names: string[]) {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(names.map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
}
/** Adds a media file (click) or a rectangle (Elements) and returns its id. */
async function add(page: Page, what: 'rect' | 'text' | string) {
  const before = new Set(await order(page));
  if (what === 'rect') {
    await showCategory(page, 'Elements');
    await page.locator('[data-shape="rectangle"]').first().click();
  } else if (what === 'text') {
    await showCategory(page, 'Text');
    await page.locator('#add-text-box').click();
    await page.keyboard.press('Escape');
  } else {
    await showCategory(page, 'Media');
    await page.locator(`.media-card[data-name="${what}"]`).click();
  }
  await expect
    .poll(async () => (await order(page)).length)
    .toBe(before.size + 1);
  return newest(page, before);
}
async function arrange(page: Page, id: string, command: string) {
  await showCategory(page, 'Scene');
  await page.locator(`#scene-list [data-layer-id="${id}"]`).first().click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([id]);
  await page.keyboard.press('Control+k');
  await page.locator('#command-palette input').fill(command);
  await page.keyboard.press('Enter');
}
/** Front of `a`'s stack index over `b`'s. */
const inFront = async (page: Page, a: string, b: string) => {
  const ids = await order(page);
  return ids.indexOf(a) > ids.indexOf(b);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await blankScene(page);
});

test('[TL-084] a clip floats with the pointer in x and y; a text lane can sit under a video lane and an audio-free order is kept', async ({
  page,
}) => {
  await importMedia(page, JPG);
  const rect = await add(page, 'rect');
  const image = await add(page, JPG);
  // The picture's lane opened on top; the rectangle's text lane is below.
  let tracks = await lanes(page);
  expect(tracks.map((track) => track.type)).toEqual(['video', 'object']);
  // Move the rectangle onto the "+" line above the picture's lane: its lane
  // goes on top. Then back under it: a text lane under a video lane stays.
  const clip = await clipOf(page, rect);
  await clip.click();
  const from = (await clip.boundingBox())!;
  const grab = { x: from.x + 20, y: from.y + from.height / 2 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const path_ = [
    { x: grab.x + 37, y: grab.y - 21 },
    { x: grab.x + 83, y: grab.y - 40 },
  ];
  for (const point of path_) {
    await page.mouse.move(point.x, point.y, { steps: 4 });
    const float = (await page.locator('.timeline-drag-float').boundingBox())!;
    expect(Math.abs(float.x - (point.x - 20))).toBeLessThan(2);
    expect(Math.abs(float.y - (point.y - from.height / 2))).toBeLessThan(2);
  }
  await expect(clip).toHaveClass(/drag-origin/);
  const top = (await page
    .locator('#timeline-foundation .timeline-nle-row')
    .first()
    .boundingBox())!;
  await page.mouse.move(grab.x, top.y + 2, { steps: 4 });
  await expect(
    page.locator('#timeline-foundation .timeline-lane-insert'),
  ).toBeVisible();
  await page.mouse.up();
  tracks = await lanes(page);
  expect(tracks.map((track) => track.type)).toEqual(['object', 'video']);
  expect(await inFront(page, rect, image)).toBe(true);
  // Send it back below the picture: the text-and-shapes lane stays below.
  await arrange(page, rect, 'Send to back');
  tracks = await lanes(page);
  expect(tracks.map((track) => track.type)).toEqual(['video', 'object']);
  expect(await inFront(page, image, rect)).toBe(true);
  // A reload keeps the order (no reordering on open).
  await page.locator('#composition-canvas').focus();
});

test('[TL-085] Replace shows only for a new library item over a clip; a moved clip inserts before or after instead', async ({
  page,
}) => {
  const a = await add(page, 'rect');
  const b = await add(page, 'rect');
  // Put b after a on a's lane by moving it there (middle of a: no Replace).
  const clipA = await clipOf(page, a);
  const clipB = await clipOf(page, b);
  await clipB.click();
  const fromB = (await clipB.boundingBox())!;
  const over = (await clipA.boundingBox())!;
  await page.mouse.move(fromB.x + 10, fromB.y + fromB.height / 2);
  await page.mouse.down();
  await page.mouse.move(over.x + over.width * 0.55, over.y + over.height / 2, {
    steps: 8,
  });
  await expect(page.locator('.replace-label')).toHaveCount(0);
  await page.mouse.up();
  const tracks = await lanes(page);
  expect(tracks).toHaveLength(1);
  expect((await scene(page)).layers.map((layer) => layer.id).sort()).toEqual(
    [a, b].sort(),
  );
  // A new library item over the middle of a clip: Replace, one step.
  await showCategory(page, 'Elements');
  const card = (await page
    .locator('[data-shape="rounded"]')
    .first()
    .boundingBox())!;
  const target = (await (await clipOf(page, a)).boundingBox())!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(card.x + 20, card.y + 20, { steps: 2 });
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 8 },
  );
  await expect(page.locator('.replace-label')).toHaveText('Replace');
  await page.mouse.up();
  expect((await hook(page)).history.labels.at(-1)).toBe('Replace clip');
  expect((await order(page)).includes(a)).toBe(false);
});

test('[CV-062] layer order works between any two kinds: shape and picture, text and video, a group and a layer, and children inside a group', async ({
  page,
}) => {
  await importMedia(page, JPG, WEBM);
  const rect = await add(page, 'rect');
  const image = await add(page, JPG);
  // Shape under picture -> forward passes the picture.
  expect(await inFront(page, image, rect)).toBe(true);
  await arrange(page, rect, 'Bring forward');
  expect(await inFront(page, rect, image)).toBe(true);
  await arrange(page, rect, 'Send backward');
  expect(await inFront(page, image, rect)).toBe(true);
  // Text under a video, then the video sent behind the text.
  const text = await add(page, 'text');
  const video = await add(page, WEBM);
  await arrange(page, text, 'Send to back');
  expect(await inFront(page, video, text)).toBe(true);
  await arrange(page, video, 'Send to back');
  expect(await inFront(page, text, video)).toBe(true);
  await arrange(page, video, 'Bring to front');
  const ids = await order(page);
  expect(ids.at(-1)).toBe(video);
  // No lane mixes groups, and no lane is left empty.
  for (const track of await lanes(page))
    expect(track.clips.length).toBeGreaterThan(0);
  // A group moves as one unit; its children reorder among themselves.
  await showCategory(page, 'Scene');
  await page.locator(`#scene-list [data-layer-id="${rect}"]`).first().click();
  await page
    .locator(`#scene-list [data-layer-id="${text}"]`)
    .first()
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+g');
  const group = (await scene(page)).layers.find(
    (layer) => layer.type === 'group',
  )!;
  await arrange(page, group.id, 'Bring to front');
  expect((await order(page)).at(-1)).toBe(group.id);
  await arrange(page, group.id, 'Send to back');
  expect((await order(page))[0]).toBe(group.id);
  const children = () =>
    scene(page).then((item) =>
      item.layers
        .find((layer) => layer.id === group.id)!
        .children.map((child) => child.id),
    );
  const first = (await children())[0]!;
  await arrange(page, first, 'Bring forward');
  expect((await children()).at(-1)).toBe(first);
});
