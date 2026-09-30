import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { test, expect, hook, rulerBox } from './fixtures';

// G5: scenes on a board. Fixture two-scenes.json: "Main composition" (5 s;
// layer-a, layer-b, layer-c; clips clip-a, clip-b, clip-c) then "Scene 2"
// (5 s; scene2-layer on scene2-clip).
const board = (page: Page) => page.locator('#scene-board');
const cards = (page: Page) => board(page).locator('.scene-card');
const card = (page: Page, id: string) =>
  board(page).locator(`.scene-card[data-scene-id="${id}"]`);
const scenes = async (page: Page) =>
  (await hook(page)).project.compositions.map((item) => item.id);
const MAIN = '46f0ce98-5945-45bd-9549-526f147c3383';
async function openBoard(page: Page) {
  await page.locator('#scene-board-toggle').click();
  await expect(board(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[PRJ-014][PRJ-020] the board shows every scene in playback order with a poster, name, length and a transition chip; double-click opens a scene', async ({
  page,
  openFixtureProject,
}, testInfo) => {
  await openFixtureProject('two-scenes.json');
  await openBoard(page);
  await expect(cards(page)).toHaveCount(2);
  expect(
    await cards(page).evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.sceneId),
    ),
  ).toEqual([MAIN, 'scene-2']);
  await expect(cards(page).nth(0)).toContainText('1. Main composition');
  await expect(cards(page).nth(1)).toContainText('2. Scene 2');
  // Its length is the one derived from its content.
  const second = (await hook(page)).project.compositions[1]!;
  await expect(cards(page).nth(1)).toContainText(`${second.duration} s`);
  await expect(card(page, MAIN)).toHaveAttribute('aria-current', 'true');
  // The poster is drawn: more than one colour in it.
  const colours = await cards(page)
    .nth(0)
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const { data } = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 16)
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return seen.size;
    });
  expect(colours).toBeGreaterThan(2);
  // Between the scenes: a transition chip that names its wave.
  await expect(board(page).locator('.scene-transition')).toHaveCount(1);
  await expect(board(page).locator('.scene-transition')).toHaveAttribute(
    'title',
    'Planned: Wave 6 (TR-001)',
  );
  await page.screenshot({ path: testInfo.outputPath('board.png') });
  // Double-click opens scene 2; the timeline shows only its clips.
  await card(page, 'scene-2').dblclick();
  await expect(board(page)).toBeHidden();
  await expect
    .poll(async () => (await hook(page)).session.compositionId)
    .toBe('scene-2');
  await expect(page.locator('[data-clip-id="scene2-clip"]')).toBeVisible();
  await expect(page.locator('[data-clip-id="clip-a"]')).toHaveCount(0);
  // Esc closes the board too.
  await openBoard(page);
  await page.keyboard.press('Escape');
  await expect(board(page)).toBeHidden();
});

test('[PRJ-013] scenes are added (blank, copy, layout), renamed, reordered by drag and deleted, one undo step each', async ({
  page,
  openFixtureProject,
}) => {
  await openFixtureProject('two-scenes.json');
  await openBoard(page);
  // "+" adds a blank scene right after the current one and opens it.
  await board(page).locator('[data-action="add-scene"]').click();
  await page.locator('.scene-add-menu [data-add="blank"]').click();
  let ids = await scenes(page);
  expect(ids).toHaveLength(3);
  expect(ids[0]).toBe(MAIN);
  expect(ids[2]).toBe('scene-2');
  const blank = ids[1]!;
  expect((await hook(page)).session.compositionId).toBe(blank);
  expect((await hook(page)).history.labels.at(-1)).toBe('Add scene');
  // The layout template brings the example design, with its clips.
  await board(page).locator('[data-action="add-scene"]').click();
  await page.locator('.scene-add-menu [data-add="template"]').click();
  ids = await scenes(page);
  const layout = (await hook(page)).project.compositions.find(
    (item) => item.id === ids[2],
  )!;
  expect(layout.name).toBe('Example layout');
  expect(layout.layers.length).toBeGreaterThan(3);
  expect(layout.tracks.flatMap((track) => track.clips).length).toBe(
    layout.layers.length,
  );
  // Duplicate copies a scene with new ids.
  await card(page, 'scene-2')
    .locator('[data-action="duplicate-scene"]')
    .click();
  ids = await scenes(page);
  expect(ids).toHaveLength(5);
  const copy = (await hook(page)).project.compositions.at(-1)!;
  expect(copy.name).toBe('Scene 2 copy');
  expect(copy.layers[0]!.id).not.toBe('scene2-layer');
  // Rename.
  await card(page, 'scene-2').locator('[data-action="rename-scene"]').click();
  await page.locator('.scene-name-input').fill('Outro');
  await page.locator('.scene-name-input').press('Enter');
  await expect(card(page, 'scene-2')).toContainText('Outro');
  expect((await hook(page)).history.labels.at(-1)).toBe('Rename scene');
  // Drag scene 2 onto the first card: it moves to the front.
  const dragged = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData('application/x-editor-scene', 'scene-2');
    return data;
  });
  await card(page, MAIN).dispatchEvent('dragover', { dataTransfer: dragged });
  await card(page, MAIN).dispatchEvent('drop', { dataTransfer: dragged });
  expect((await scenes(page))[0]).toBe('scene-2');
  expect((await hook(page)).history.labels.at(-1)).toBe('Reorder scenes');
  // Delete the blank scene; undo brings it back in place.
  const before = await scenes(page);
  await card(page, blank).locator('[data-action="delete-scene"]').click();
  expect(await scenes(page)).not.toContain(blank);
  await page.keyboard.press('Control+z');
  expect(await scenes(page)).toEqual(before);
});

test('[PRJ-021] a layer dragged from the Scene list onto another scene moves there; with Alt it is copied', async ({
  page,
  openFixtureProject,
}) => {
  await openFixtureProject('two-scenes.json');
  await openBoard(page);
  await page
    .locator('#scene-list [data-layer-id="layer-c"]')
    .dragTo(card(page, 'scene-2'));
  let project = (await hook(page)).project;
  const main = project.compositions.find((item) => item.id === MAIN)!;
  const second = project.compositions.find((item) => item.id === 'scene-2')!;
  expect(main.layers.map((layer) => layer.id)).not.toContain('layer-c');
  expect(second.layers.map((layer) => layer.id)).toContain('layer-c');
  // Its clip came along, at the same time.
  const clip = second.tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === 'layer-c')!;
  expect(clip.startTime).toBe(1);
  expect(clip.duration).toBe(3);
  expect((await hook(page)).history.labels.at(-1)).toBe('Move to scene');
  // Alt copies (a drop with Alt held): the layer stays and a copy is added.
  await page.keyboard.press('Control+z');
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData('application/x-editor-layer', 'layer-a');
    return data;
  });
  await card(page, 'scene-2').dispatchEvent('dragover', {
    dataTransfer: transfer,
  });
  await card(page, 'scene-2').dispatchEvent('drop', {
    dataTransfer: transfer,
    altKey: true,
  });
  project = (await hook(page)).project;
  expect(
    project.compositions
      .find((item) => item.id === MAIN)!
      .layers.map((layer) => layer.id),
  ).toContain('layer-a');
  expect(
    project.compositions.find((item) => item.id === 'scene-2')!.layers,
  ).toHaveLength(2);
  expect((await hook(page)).history.labels.at(-1)).toBe('Copy to scene');
});

test('[PRJ-022] playback runs through the scenes in order', async ({
  page,
  openFixtureProject,
}) => {
  await openFixtureProject('two-scenes.json');
  // Seek to 4.8 s in scene 1 (5 s long), then play.
  const ruler = await rulerBox(page);
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.click(ruler.x + 4.8 * zoom, ruler.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(4.8, 1);
  await page.locator('[data-action="play"]').click();
  await expect
    .poll(async () => (await hook(page)).session.compositionId, {
      timeout: 5000,
    })
    .toBe('scene-2');
  await expect.poll(async () => (await hook(page)).session.playing).toBe(true);
  await page.locator('[data-action="play"]').click();
});

test('[EXP-019] export joins every scene one after another, or this scene only', async ({
  page,
}, testInfo) => {
  // Make the example 1 s long, then add a copy: two 1 s scenes.
  const length = page.locator('#toolbar-scene-length');
  await length.fill('1');
  await length.press('Enter');
  await openBoard(page);
  await board(page).locator('[data-action="add-scene"]').click();
  await page.locator('.scene-add-menu [data-add="duplicate"]').click();
  await page.keyboard.press('Escape');
  await page.locator('#export').click();
  const dialog = page.locator('.modal-dialog');
  await expect(dialog.locator('#export-scenes')).toHaveValue('all');
  await expect(dialog.locator('#export-end')).toHaveValue('2');
  await dialog.locator('#export-scenes').selectOption('current');
  await expect(dialog.locator('#export-end')).toHaveValue('1');
  await dialog.locator('#export-scenes').selectOption('all');
  await dialog.locator('#export-width').fill('320');
  await dialog.locator('#export-height').fill('180');
  await dialog.locator('#export-height').press('Tab');
  await expect(dialog.locator('#export-format')).not.toHaveText(/Checking/);
  const downloading = page.waitForEvent('download', { timeout: 120_000 });
  await dialog.locator('#export-start-button').click();
  const download = await downloading;
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const input = new Input({
    source: new BufferSource(new Uint8Array(readFileSync(file))),
    formats: ALL_FORMATS,
  });
  // Two 1 s scenes: a 2 s file.
  expect(await input.computeDuration()).toBeCloseTo(2, 1);
  input.dispose();
});
