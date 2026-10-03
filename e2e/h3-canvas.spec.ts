import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';
import { reveal } from './controls';

// H3: the Canva canvas. Default example: 1280 × 720, paper #f0eee7; the
// headline (example-headline) at 76,165 (730 × 230), the lavender badge
// (example-badge) at 76,456 (224 × 48), the subtitle below it.
type Point = [number, number];
interface Debug {
  view: [number, number, number, number, number, number];
  corners: Point[] | null;
  selection: { id: number | string; point: Point; cursor: string }[] | null;
  hover: string | null;
  canvasSelected: boolean;
  crop: {
    layerId: string;
    frame: { x: number; y: number; width: number; height: number };
  } | null;
}
const MEDIA = 'tests/fixtures/media';
async function debug(page: Page): Promise<Debug> {
  return page.evaluate(() =>
    (
      window as unknown as { __AIVE__: { getCanvas(): Debug } }
    ).__AIVE__.getCanvas(),
  );
}
/** Composition point → page point, through the drawn view. */
async function screen(page: Page, x: number, y: number) {
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  const [a, b, c, d, e, f] = (await debug(page)).view;
  return { x: box.x + a * x + c * y + e, y: box.y + b * x + d * y + f };
}
/** Canvas CSS point (from the hook) → page point. */
async function page2(page: Page, point: Point) {
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  return { x: box.x + point[0], y: box.y + point[1] };
}
/** RGB of the drawn canvas at canvas CSS points. */
async function pixels(page: Page, points: Point[]) {
  return page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement, points) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / rect.width;
      const context = canvas.getContext('2d')!;
      return points.map(([x, y]) => [
        ...context
          .getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1)
          .data.slice(0, 3),
      ]);
    }, points);
}
/** Canvas CSS point → composition point. */
async function toComposition(page: Page, point: Point): Promise<Point> {
  const [a, , , d, e, f] = (await debug(page)).view;
  return [(point[0] - e) / a, (point[1] - f) / d];
}
/** The exported frame (EXP-009 PNG, drawn like the video export). */
async function exported(page: Page, testInfo: TestInfo, points: Point[]) {
  await page.locator('#export').click();
  const saving = page.waitForEvent('download');
  await page.locator('.modal-dialog #export-png').click();
  const file = testInfo.outputPath(`frame-${Date.now()}.png`);
  await (await saving).saveAs(file);
  await page.locator('.modal-dialog .modal-close').click();
  await expect(page.locator('.modal-dialog')).toHaveCount(0);
  return page.evaluate(
    async ({ png64, points }) => {
      const bytes = Uint8Array.from(atob(png64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return points.map(([x, y]) => [
        ...context
          .getImageData(Math.round(x), Math.round(y), 1, 1)
          .data.slice(0, 3),
      ]);
    },
    { png64: readFileSync(file).toString('base64'), points },
  );
}
const near = (a: number[], b: number[], tolerance = 8) =>
  a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);
const bar = (page: Page) => page.locator('#context-toolbar');
const control = (page: Page, id: string) =>
  page.locator(`#context-toolbar [data-control="${id}"]`);
async function select(page: Page, id: string) {
  await showCategory(page, 'Scene');
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([id]);
}
const layerOf = async (page: Page, id: string) => {
  const find = (layers: any[]): any =>
    layers.find((layer) => layer.id === id) ??
    layers.map((layer) => find(layer.children)).find(Boolean);
  return find((await hook(page)).project.compositions[0]!.layers);
};
const labels = async (page: Page) => (await hook(page)).history.labels;
/** Imports media files and drops the first on the canvas centre. */
async function addPicture(page: Page, names: string[]) {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles(names.map((name) => path.resolve(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
  const canvas = page.locator('#composition-canvas');
  const box = (await canvas.boundingBox())!;
  const at = await screen(page, 640, 360);
  await page
    .locator(`.media-card[data-name="${names[0]}"]`)
    .dragTo(canvas, { targetPosition: { x: at.x - box.x, y: at.y - box.y } });
  const asset = (await hook(page)).project.assets.find(
    (item) => item.name === names[0],
  )!;
  const layer = (await hook(page)).project.compositions[0]!.layers.find(
    (item) => item.assetId === asset.id,
  )!;
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([layer.id]);
  return layer.id as string;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[CV-052] hovering outlines an object or the empty artboard; the artboard selects the canvas, the stage around it deselects everything', async ({
  page,
}) => {
  const over = await screen(page, 300, 250);
  await page.mouse.move(over.x, over.y);
  await expect
    .poll(async () => (await debug(page)).hover)
    .toBe('example-headline');
  const empty = await screen(page, 1000, 650);
  await page.mouse.move(empty.x, empty.y);
  await expect.poll(async () => (await debug(page)).hover).toBe('artboard');
  // Select the headline, then click the stage outside the artboard: nothing
  // is selected and the floating toolbar goes away.
  await page.mouse.click(over.x, over.y);
  await expect(bar(page)).toHaveAttribute('data-mode', 'text');
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  const outside = await screen(page, 640, -20);
  expect(outside.y).toBeGreaterThan(box.y);
  await page.mouse.click(outside.x, outside.y);
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([]);
  expect((await debug(page)).canvasSelected).toBe(false);
  // I1.5 (CV-057): the stage around the artboard shows the canvas bar.
  await expect(bar(page)).toHaveAttribute('data-mode', 'canvas');
  // A click on the empty artboard selects the canvas: the scene toolbar.
  await page.mouse.click(empty.x, empty.y);
  await expect(bar(page)).toHaveAttribute('data-mode', 'scene');
  expect((await debug(page)).canvasSelected).toBe(true);
});

test('[CV-053] Canva handles: round white corners, pills on the sides and the rotate handle 28 px below the box', async ({
  page,
}) => {
  await select(page, 'example-badge');
  const { selection, corners } = await debug(page);
  const rotate = selection!.find((handle) => handle.id === 'rotate')!;
  const bottom = Math.max(...corners!.map((point) => point[1]));
  expect(rotate.point[1] - bottom).toBeCloseTo(28, 0);
  expect(rotate.point[0]).toBeCloseTo(
    (corners![2]![0] + corners![3]![0]) / 2,
    0,
  );
  // The corner handle is a white disc; the side handle a white pill.
  const [corner, pill] = await pixels(page, [
    corners![0]!,
    [
      (corners![1]![0] + corners![2]![0]) / 2,
      (corners![1]![1] + corners![2]![1]) / 2,
    ],
  ]);
  expect(near(corner!, [255, 255, 255], 12)).toBe(true);
  expect(near(pill!, [255, 255, 255], 12)).toBe(true);
  // The rotate handle below turns the badge.
  const handle = await page2(page, rotate.point);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 60, handle.y - 30, { steps: 5 });
  await page.mouse.up();
  expect((await labels(page)).at(-1)).toBe('Rotate layer');
  expect(
    Math.abs((await layerOf(page, 'example-badge')).transform.rotation.value),
  ).toBeGreaterThan(10);
});

test('[CV-054] one fixed floating toolbar row (the scene bar starts with the canvas size chip); it never scrolls, and extra tools move into More', async ({
  page,
}) => {
  for (const id of ['example-headline', 'example-badge', null] as const) {
    if (id) await select(page, id);
    else {
      const empty = await screen(page, 1000, 650);
      await page.mouse.click(empty.x, empty.y);
    }
    // I1.5 (CV-057): only the scene bar starts with the size chip; object
    // toolbars carry none.
    if (id)
      await expect(
        bar(page).locator('[data-control="canvas-size"]'),
      ).toHaveCount(0);
    else {
      await expect(bar(page).locator('> *').first()).toHaveAttribute(
        'data-control',
        'canvas-size',
      );
      await expect(control(page, 'canvas-size')).toContainText('16:9');
    }
    const shape = await bar(page).evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      radius: getComputedStyle(element).borderTopLeftRadius,
      overflow: element.scrollWidth - element.clientWidth,
    }));
    expect(shape).toEqual({ height: 44, radius: '12px', overflow: 0 });
  }
  // Showing the toolbar never moves the canvas.
  const before = await page.locator('#composition-canvas').boundingBox();
  await select(page, 'example-subtitle');
  expect(await page.locator('#composition-canvas').boundingBox()).toEqual(
    before,
  );
  // Narrow: the text row keeps its first tools and puts the rest in More.
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(control(page, 'toolbar-more')).toBeVisible();
  expect(
    await bar(page).evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBe(0);
  await control(page, 'toolbar-more').click();
  const overflow = page.locator('.toolbar-overflow');
  await expect(overflow.locator('[data-control="position"]')).toBeVisible();
  await overflow.locator('[data-control="position"]').click();
  await expect(page.locator('[data-deep-panel="position"]')).toBeVisible();
});

test('[CV-055] canvas size presets resize the open scene without moving its layers, one undo step, with Undo in the toast', async ({
  page,
}) => {
  const chip = control(page, 'canvas-size');
  await chip.click();
  // I4: the right panel's Canvas tab shows the same presets; this is the popover.
  const presets = page.locator('.toolbar-popover .canvas-size-preset');
  await expect(presets).toHaveCount(7);
  await expect(presets.locator('.canvas-size-ratio')).toHaveText([
    '16:9',
    '9:16',
    '1:1',
    '4:3',
    '4:5',
    '21:9',
    '2:3',
  ]);
  const headline = (await layerOf(page, 'example-headline')).transform.position
    .value;
  await page
    .locator('.toolbar-popover .canvas-size-preset[data-preset="square"]')
    .click();
  let project = (await hook(page)).project;
  expect(project.compositions.map((item) => [item.width, item.height])).toEqual(
    [[1080, 1080]],
  );
  // J1 (PRJ-025): a size change never rewrites a layer's transform.
  expect(
    (await layerOf(page, 'example-headline')).transform.position.value,
  ).toEqual(headline);
  expect(await labels(page)).toEqual(['Canvas size']);
  await expect(chip).toContainText('1:1');
  // The toast's Undo restores the old size.
  const toast = page.locator('.toast', {
    hasText: 'Canvas resized to 1,080 × 1,080',
  });
  await expect(toast).toBeVisible();
  await toast.locator('button', { hasText: 'Undo' }).click();
  project = (await hook(page)).project;
  expect([
    project.compositions[0]!.width,
    project.compositions[0]!.height,
  ]).toEqual([1280, 720]);
  // Custom size.
  await chip.click();
  for (const [id, value] of [
    ['canvas-size-w', '800'],
    ['canvas-size-h', '600'],
  ] as const) {
    await page.locator(`#${id}`).fill(value);
    await page.locator(`#${id}`).press('Enter');
  }
  await page.locator('#canvas-size-apply').click();
  project = (await hook(page)).project;
  expect([
    project.compositions[0]!.width,
    project.compositions[0]!.height,
  ]).toEqual([800, 600]);
  await expect(chip).toContainText('4:3');
});

test('[VID-003] Crop: double-click a picture, drag the frame or pick a ratio, Done keeps the kept part in place; Escape cancels; export matches', async ({
  page,
}, testInfo) => {
  const before = await pixels(page, [[0, 0]]);
  void before;
  const id = await addPicture(page, ['image_testsrc_1200x800.jpg']);
  const box = (await debug(page)).corners!;
  const [left, top] = box[0]!,
    [right, bottom] = box[2]!;
  const width = right - left,
    height = bottom - top;
  // In a flat colour bar of the kept part (away from the diagonal line).
  const centre: Point = [left + width * 0.42, top + height * 0.75];
  // Above the kicker, where only the paper lies under the cut-off part.
  const cut: Point = [left + width * 0.08, top + height * 0.05];
  // What shows at those points with and without the picture.
  const [centreBefore, cutBefore] = await pixels(page, [centre, cut]);
  // Escape cancels a crop without history.
  const middle = await page2(page, centre);
  await page.mouse.dblclick(middle.x, middle.y);
  await expect.poll(async () => (await debug(page)).crop?.layerId).toBe(id);
  await expect(page.locator('[data-tool-panel="crop"]')).toBeVisible();
  const history = (await labels(page)).length;
  const edge = await page2(page, [right, top + height / 2]);
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x - width * 0.3, edge.y, { steps: 5 });
  await page.mouse.up();
  expect((await debug(page)).crop!.frame.width).toBeCloseTo(0.7, 1);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await debug(page)).crop).toBeNull();
  expect((await labels(page)).length).toBe(history);
  // 1:1 keeps the middle square of the 3:2 picture.
  await page.mouse.dblclick(middle.x, middle.y);
  await page.locator('[data-tool-panel="crop"] [data-ratio="1:1"]').click();
  const frame = (await debug(page)).crop!.frame;
  expect(frame.width).toBeCloseTo(2 / 3, 3);
  expect(frame.x).toBeCloseTo(1 / 6, 3);
  await page.locator('[data-action="crop-done"]').click();
  await expect.poll(async () => (await debug(page)).crop).toBeNull();
  expect((await labels(page)).at(-1)).toBe('Crop');
  const layer = await layerOf(page, id);
  expect(layer.properties.cropX.value).toBeCloseTo(1 / 6, 3);
  expect(layer.properties.cropW.value).toBeCloseTo(2 / 3, 3);
  expect(layer.properties.width.value).toBeCloseTo(
    layer.properties.height.value,
    3,
  );
  // The kept part stays where it was; the cut part is gone.
  const after = (await debug(page)).corners!;
  expect(after[0]![0]).toBeCloseTo(left + width / 6, 0);
  const [centreAfter, cutAfter] = await pixels(page, [centre, cut]);
  expect(near(centreAfter!, centreBefore!)).toBe(true);
  expect(near(cutAfter!, cutBefore!, 4)).toBe(false);
  // Export draws the same crop at both points.
  const [exportCentre, exportCut] = await exported(page, testInfo, [
    await toComposition(page, centre),
    await toComposition(page, cut),
  ]);
  expect(near(exportCentre!, centreAfter!, 12)).toBe(true);
  expect(near(exportCut!, cutAfter!, 12)).toBe(true);
  // One undo restores the whole picture.
  await page.keyboard.press('Control+z');
  expect((await layerOf(page, id)).properties.cropW).toBeUndefined();
});

test('[VID-018] a picture takes a border (colour, width, style) and rounded corners, drawn in the preview and the export', async ({
  page,
}, testInfo) => {
  const id = await addPicture(page, ['image_testsrc_1200x800.jpg']);
  const corners = (await debug(page)).corners!;
  const [left, top] = corners[0]!;
  // Clear of the side's pill handle at mid-height.
  const inner: Point = [left + 3, top + (corners[3]![1] - top) * 0.3];
  await control(page, 'stroke-style').click();
  // I4: the right panel shows the same controls; this is the toolbar popover.
  await page
    .locator('.toolbar-popover .stroke-styles [data-stroke="solid"]')
    .click();
  expect((await labels(page)).at(-1)).toBe('Set stroke style');
  const width = await reveal(page, 'toolbar-width');
  await width.fill('24');
  await width.press('Enter');
  let layer = await layerOf(page, id);
  expect(layer.properties.strokeWidth.value).toBe(24);
  expect(layer.properties.stroke.value).toBe('#000000');
  const [edge] = await pixels(page, [inner]);
  expect(near(edge!, [0, 0, 0], 20)).toBe(true);
  await page.keyboard.press('Escape');
  // Rounded corners: the very corner shows the paper.
  const corners2 = await reveal(page, 'toolbar-corners');
  await corners2.fill('120');
  await corners2.press('Enter');
  layer = await layerOf(page, id);
  expect(layer.properties.cornerRadius.value).toBe(120);
  await page.keyboard.press('Escape');
  const tip: Point = [left + 2, top + 2];
  const [exportEdge, exportTip] = await exported(page, testInfo, [
    await toComposition(page, inner),
    await toComposition(page, tip),
  ]);
  expect(near(exportEdge!, [0, 0, 0], 20)).toBe(true);
  expect(near(exportTip!, [0xf0, 0xee, 0xe7], 8)).toBe(true);
});

test('[VID-009] Replace swaps the media and keeps position, size, crop and timing', async ({
  page,
}) => {
  const id = await addPicture(page, [
    'image_testsrc_1200x800.jpg',
    'image_gradient_1920x1080.png',
  ]);
  // Move it first, so the kept edits are visible.
  const nudged = await screen(page, 640, 360);
  await page.mouse.move(nudged.x, nudged.y);
  await page.mouse.down();
  await page.mouse.move(nudged.x + 40, nudged.y + 20, { steps: 4 });
  await page.mouse.up();
  const before = await layerOf(page, id);
  await control(page, 'replace').click();
  const panel = page.locator('[data-tool-panel="replace"]');
  const gradient = (await hook(page)).project.assets.find(
    (asset) => asset.name === 'image_gradient_1920x1080.png',
  )!;
  await panel.locator(`[data-asset-id="${gradient.id}"]`).click();
  const after = await layerOf(page, id);
  expect(after.assetId).toBe(gradient.id);
  expect(after.transform).toEqual(before.transform);
  expect(after.startTime).toBe(before.startTime);
  expect((await labels(page)).at(-1)).toBe('Replace media');
  const clip = (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((item) => item.layerId === id)!;
  expect(clip.assetId).toBe(gradient.id);
});

test('[CV-051] a locked element can be selected but not moved, resized, nudged or deleted; Unlock from the toolbar', async ({
  page,
}) => {
  const at = await screen(page, 300, 250);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.locator('.canvas-context-menu [data-action="lock"]').click();
  expect((await labels(page)).at(-1)).toBe('Lock');
  // The toolbar offers only Unlock; there are no handles.
  await expect(control(page, 'unlock')).toBeVisible();
  await expect(control(page, 'font')).toHaveCount(0);
  expect((await debug(page)).selection).toEqual([]);
  const start = (await layerOf(page, 'example-headline')).transform.position
    .value;
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 80, at.y + 40, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Delete');
  const locked = await layerOf(page, 'example-headline');
  expect(locked).toBeTruthy();
  expect(locked.transform.position.value).toEqual(start);
  expect((await labels(page)).at(-1)).toBe('Lock');
  await control(page, 'unlock').click();
  expect((await labels(page)).at(-1)).toBe('Unlock');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 80, at.y + 40, { steps: 5 });
  await page.mouse.up();
  expect(
    (await layerOf(page, 'example-headline')).transform.position.value,
  ).not.toEqual(start);
});

test('[CV-056] right-click menus per type: icons and shortcuts; timing, alternative text, background, info, download; the empty canvas offers scenes, size and guides', async ({
  page,
}, testInfo) => {
  const id = await addPicture(page, ['image_testsrc_1200x800.jpg']);
  const menu = page.locator('.canvas-context-menu');
  const open = async (x: number, y: number) => {
    const at = await screen(page, x, y);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(menu).toBeVisible();
  };
  await open(640, 360);
  for (const action of [
    'copy',
    'duplicate',
    'delete',
    'lock',
    'show-timing',
    'alt-text',
    'set-background',
    'resize-to-selection',
    'download-selection',
    'info',
  ])
    await expect(menu.locator(`[data-action="${action}"]`)).toBeVisible();
  // Icons in the icon column and shortcuts on the right.
  await expect(menu.locator('[data-action="duplicate"] svg')).toHaveCount(1);
  await expect(menu.locator('[data-action="duplicate"]')).toContainText(
    'Ctrl+D',
  );
  await expect(menu.locator('[data-action="comment"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(menu.locator('[data-action="comment"]')).toHaveAttribute(
    'title',
    'Planned: Wave 8 (ADV-008)',
  );
  // Info.
  await menu.locator('[data-action="info"]').click();
  await expect(
    page.locator('.toast', { hasText: 'Type: Image' }),
  ).toBeVisible();
  // Alternative text.
  await open(640, 360);
  await menu.locator('[data-action="alt-text"]').click();
  await page.locator('#alt-text-input').fill('A test pattern');
  await page.locator('[data-action="alt-text-save"]').click();
  expect((await layerOf(page, id)).properties.altText.value).toBe(
    'A test pattern',
  );
  // Download selection: a PNG the size of the picture.
  await open(640, 360);
  const saving = page.waitForEvent('download');
  await menu.locator('[data-action="download-selection"]').click();
  const download = await saving;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const file = testInfo.outputPath('selection.png');
  await download.saveAs(file);
  const size = await page.evaluate(async (png64) => {
    const bytes = Uint8Array.from(atob(png64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes]));
    return [bitmap.width, bitmap.height];
  }, readFileSync(file).toString('base64'));
  const drawn = (await debug(page)).corners!;
  const [a] = (await debug(page)).view;
  expect(size[0]).toBeCloseTo((drawn[1]![0] - drawn[0]![0]) / a, -1);
  // Show element timing moves the playhead to the clip's start.
  await open(640, 360);
  await menu.locator('[data-action="show-timing"]').click();
  await expect(
    page.locator('#timeline-foundation .timeline-scroll'),
  ).toBeFocused();
  // Set image as background: it covers the canvas and goes to the back.
  await open(640, 360);
  await menu.locator('[data-action="set-background"]').click();
  expect((await labels(page)).at(-1)).toBe('Set image as background');
  const project = (await hook(page)).project;
  expect(project.compositions[0]!.layers[0]!.id).toBe(id);
  const background = await layerOf(page, id);
  expect(background.transform.scale.value[0] * 1200).toBeCloseTo(1280, 0);
  expect(background.transform.position.value[0]).toBeCloseTo(0, 5);
  // The empty canvas: paste, scenes, canvas size and guides. (Undo first:
  // the background picture reaches past the canvas, where it is picked.)
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const outside = await screen(page, 640, -20);
  await page.mouse.click(outside.x, outside.y, { button: 'right' });
  await expect(menu).toBeVisible();
  for (const action of [
    'paste',
    'add-scene',
    'duplicate-scene',
    'canvas-size',
    'guides',
  ])
    await expect(menu.locator(`[data-action="${action}"]`)).toBeVisible();
  await menu.locator('[data-action="guides"]').hover();
  await expect(menu.locator('[data-action="guides-grid"]')).toHaveAttribute(
    'title',
    'Planned: Wave 2 (CV-014)',
  );
  await page.keyboard.press('Escape');
  await page.mouse.click(outside.x, outside.y, { button: 'right' });
  await menu.locator('[data-action="canvas-size"]').hover();
  await menu.locator('[data-preset="vertical"]').click();
  const sized = (await hook(page)).project.compositions[0]!;
  expect([sized.width, sized.height]).toEqual([1080, 1920]);
  // Add scene from the menu opens a new blank scene.
  const empty = await screen(page, 540, -20);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await menu.locator('[data-action="add-scene"]').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions.length)
    .toBe(2);
});

test('[TXT-036] underline, strikethrough and uppercase toggle from the toolbar, and a tall box anchors the text top, middle or bottom', async ({
  page,
}) => {
  await select(page, 'example-subtitle');
  await control(page, 'underline').click();
  await expect(control(page, 'underline')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    (await layerOf(page, 'example-subtitle')).properties.textDecoration.value,
  ).toBe('underline');
  await control(page, 'strike').click();
  expect(
    (await layerOf(page, 'example-subtitle')).properties.textDecoration.value,
  ).toBe('underline line-through');
  await control(page, 'uppercase').click();
  expect(
    (await layerOf(page, 'example-subtitle')).properties.textCase.value,
  ).toBe('upper');
  expect((await labels(page)).slice(-3)).toEqual([
    'Set underline',
    'Set strikethrough',
    'Set text case',
  ]);
  // Anchor: the 730 × 230 headline box is about 43 units taller than its
  // two lines, so Bottom moves the ink down by that much.
  await select(page, 'example-headline');
  const box = (await debug(page)).corners!;
  const inkTop = async () =>
    page
      .locator('#composition-canvas')
      .evaluate((canvas: HTMLCanvasElement, box) => {
        const rect = canvas.getBoundingClientRect();
        const ratio = canvas.width / rect.width;
        const [x0, y0] = [box[0]![0] * ratio + 4, box[0]![1] * ratio + 4];
        const [x1, y1] = [box[2]![0] * ratio - 4, box[2]![1] * ratio - 4];
        const context = canvas.getContext('2d')!;
        const { data, width } = context.getImageData(x0, y0, x1 - x0, y1 - y0);
        for (let i = 0; i < data.length; i += 4)
          if (data[i]! < 90 && data[i + 1]! < 90 && data[i + 2]! < 90)
            return Math.floor(i / 4 / width) / ratio;
        return -1;
      }, box);
  const top = await inkTop();
  await control(page, 'spacing').click();
  await page.locator('.toolbar-popover [data-anchor="bottom"]').click();
  expect(
    (await layerOf(page, 'example-headline')).properties.textAnchor.value,
  ).toBe('bottom');
  expect((await labels(page)).at(-1)).toBe('Set text anchor');
  const [a] = (await debug(page)).view;
  expect((await inkTop()) - top).toBeGreaterThan(30 * a);
  await page.locator('.toolbar-popover [data-anchor="middle"]').click();
  const middle = await inkTop();
  expect(middle - top).toBeGreaterThan(10 * a);
  expect(middle - top).toBeLessThan(30 * a);
});
