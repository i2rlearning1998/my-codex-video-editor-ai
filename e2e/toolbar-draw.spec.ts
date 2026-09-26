import type { Page } from '@playwright/test';
import { test, expect, hook, artboard } from './fixtures';

// Default example: text "example-headline" (76,165, fill #272b29, size 78),
// shape "example-badge" (76,456 224×48, fill #cbbced), group "example-cards".
// nle-example: video layer-a 100..500 × 100..325 (0..2 s).
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function toScreen(page: Page, x: number, y: number) {
  let board = boards.get(page);
  if (!board) boards.set(page, (board = await artboard(page)));
  return { x: board.x + x * board.scale, y: board.y + y * board.scale };
}
function layers(project: Awaited<ReturnType<typeof hook>>['project']) {
  const all: any[] = [];
  const visit = (items: readonly any[]) => {
    for (const item of items) {
      all.push(item);
      visit(item.children);
    }
  };
  visit(project.compositions[0]!.layers);
  return all;
}
const layer = async (page: Page, id: string) =>
  layers((await hook(page)).project).find((item) => item.id === id)!;
const toolbar = (page: Page) => page.locator('#context-toolbar');
const control = (page: Page, id: string) =>
  page.locator(`#context-toolbar [data-control="${id}"]`);
async function select(page: Page, ...ids: string[]) {
  await page.locator(`#scene-list [data-layer-id="${ids[0]}"]`).click();
  for (const id of ids.slice(1))
    await page
      .locator(`#scene-list [data-layer-id="${id}"]`)
      .click({ modifiers: ['Control'] });
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(ids);
}
async function commit(page: Page, id: string, value: string) {
  const input = page.locator(`#toolbar-${id}`);
  await input.fill(value);
  await input.press('Enter');
}
/** The canvas pixel at composition (x, y). */
async function pixel(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y);
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement, at) => {
    const box = canvas.getBoundingClientRect();
    const ratio = canvas.width / box.width;
    return [
      ...canvas
        .getContext('2d')!
        .getImageData(
          Math.round((at.x - box.x) * ratio),
          Math.round((at.y - box.y) * ratio),
          1,
          1,
        ).data,
    ];
  }, point);
}
async function stroke(page: Page, points: [number, number][]) {
  const [first, ...rest] = points;
  const start = await toScreen(page, ...first!);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of rest) {
    const at = await toScreen(page, ...point);
    await page.mouse.move(at.x, at.y, { steps: 8 });
  }
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[CV-035][CV-037][CV-038] the toolbar follows the selection: text Size and Color, shape Fill, disabled controls name their wave', async ({
  page,
}, testInfo) => {
  await expect(toolbar(page)).toBeHidden();
  const canvasBefore = await page.locator('canvas').boundingBox();
  await select(page, 'example-headline');
  await expect(toolbar(page)).toBeVisible();
  // Regression: the toolbar floats; showing it never moves the canvas.
  expect(await page.locator('canvas').boundingBox()).toEqual(canvasBefore);
  await expect(toolbar(page)).toHaveAttribute('data-kind', 'text');
  // The spec's text controls, in order.
  await expect(toolbar(page).locator('[data-control]')).toHaveCount(10);
  // W2-F5 made Font, Weight, Align and Spacing live; Effects is still later.
  await expect(control(page, 'effects')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(control(page, 'effects')).toHaveAttribute(
    'title',
    'Not built yet: planned for Wave 3 (TXT-019)',
  );
  await page.screenshot({ path: testInfo.outputPath('text-toolbar.png') });
  await commit(page, 'size', '60');
  expect(
    (await layer(page, 'example-headline')).properties.fontSize.value,
  ).toBe(60);
  await page.locator('#toolbar-color').fill('#ff0000');
  await expect
    .poll(
      async () => (await layer(page, 'example-headline')).properties.fill.value,
    )
    .toBe('#ff0000');
  expect((await hook(page)).history.labels).toEqual([
    'Set text size',
    'Set color',
  ]);
  // A shape: Fill edits; Stroke is not built yet.
  await select(page, 'example-badge');
  await expect(toolbar(page)).toHaveAttribute('data-kind', 'shape');
  await expect(control(page, 'stroke')).toHaveAttribute(
    'title',
    'Not built yet: planned for Wave 5 (SHP-005)',
  );
  await page.locator('#toolbar-fill').fill('#00aa00');
  await expect
    .poll(
      async () => (await layer(page, 'example-badge')).properties.fill.value,
    )
    .toBe('#00aa00');
  await page.screenshot({ path: testInfo.outputPath('shape-toolbar.png') });
  // Groups and multi-selections hide it.
  await select(page, 'example-cards');
  await expect(toolbar(page)).toBeHidden();
  await select(page, 'example-badge', 'example-headline');
  await expect(toolbar(page)).toBeHidden();
});

test('[CV-036] image and video toolbar: position, scale, rotate, opacity and flip, one undo each; Crop names its wave', async ({
  page,
  openFixtureProject,
}, testInfo) => {
  await openFixtureProject('nle-example.json');
  await select(page, 'layer-a');
  await expect(toolbar(page)).toHaveAttribute('data-kind', 'media');
  await expect(control(page, 'crop')).toHaveAttribute(
    'title',
    'Not built yet: planned for Wave 4 (VID-003)',
  );
  await expect(control(page, 'replace')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await commit(page, 'x', '150');
  expect((await layer(page, 'layer-a')).transform.position.value).toEqual([
    150, 100,
  ]);
  await commit(page, 'scale', '50');
  expect((await layer(page, 'layer-a')).transform.scale.value).toEqual([
    0.5, 0.5,
  ]);
  await commit(page, 'opacity', '40');
  expect((await layer(page, 'layer-a')).transform.opacity.value).toBe(0.4);
  await commit(page, 'rotate', '90');
  expect((await layer(page, 'layer-a')).transform.rotation.value).toBe(90);
  await page.locator('#undo').click();
  // Flip horizontal: scale X turns negative, the visual center stays.
  const center = (item: any) => {
    const [x, y] = item.transform.position.value;
    const [sx, sy] = item.transform.scale.value;
    return [x + (400 * sx) / 2, y + (225 * sy) / 2];
  };
  const before = center(await layer(page, 'layer-a'));
  await control(page, 'flip-horizontal').click();
  const flipped = await layer(page, 'layer-a');
  expect(flipped.transform.scale.value).toEqual([-0.5, 0.5]);
  expect(center(flipped)[0]).toBeCloseTo(before[0]!, 9);
  expect(center(flipped)[1]).toBeCloseTo(before[1]!, 9);
  expect((await hook(page)).history.labels).toEqual([
    'Set Position X',
    'Set scale',
    'Set Opacity',
    'Flip horizontal',
  ]);
  await page.screenshot({ path: testInfo.outputPath('media-toolbar.png') });
});

test('[SHP-018][SHP-019] the Marker draws a stroke that becomes one layer and clip; Esc leaves draw mode', async ({
  page,
}, testInfo) => {
  await page.locator('[data-category="Draw"]').click();
  await page.locator('[data-brush="marker"]').click();
  await expect(page.locator('[data-brush="marker"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.locator('#draw-color').fill('#0055ff');
  const before = layers((await hook(page)).project).length;
  await stroke(page, [
    [900, 200],
    [1000, 260],
    [1100, 220],
  ]);
  const project = (await hook(page)).project;
  expect(layers(project)).toHaveLength(before + 1);
  const drawing = project.compositions[0]!.layers.at(-1)! as any;
  expect(drawing.type).toBe('shape');
  expect(drawing.properties.brush.value).toBe('marker');
  expect(drawing.properties.stroke.value).toBe('#0055ff');
  expect(drawing.properties.strokeWidth.value).toBe(12);
  const clip = project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((item) => item.layerId === drawing.id)!;
  expect(clip.startTime).toBe(0);
  expect((await hook(page)).history.labels).toEqual(['Draw']);
  // The stroke is drawn in its color at the start point.
  const [r, g, b] = await pixel(page, 900, 200);
  expect(r).toBeLessThan(40);
  expect(b).toBeGreaterThan(200);
  expect(g).toBeLessThan(120);
  await page.screenshot({ path: testInfo.outputPath('marker-stroke.png') });
  // Still drawing: a click does not select anything.
  const at = await toScreen(page, 1000, 260);
  await page.mouse.click(at.x, at.y);
  expect((await hook(page)).session.selectedIds).toEqual([]);
  // Esc leaves draw mode; now a click selects the drawing.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-brush="marker"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.mouse.click(at.x, at.y);
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([drawing.id]);
  // Regression: selecting by a click shows the toolbar without moving anything.
  expect((await hook(page)).history.labels).toEqual(['Draw']);
  // Undo removes the layer and its clip.
  await page.locator('#undo').click();
  const undone = (await hook(page)).project;
  expect(layers(undone)).toHaveLength(before);
  expect(
    undone.compositions[0]!.tracks.flatMap((track) => track.clips).some(
      (item) => item.layerId === drawing.id,
    ),
  ).toBe(false);
});

test('[SHP-019][CV-038] a highlighter stroke is 40% opaque, can be moved, edited from its toolbar and survives a reload', async ({
  page,
}) => {
  await page.locator('[data-category="Draw"]').click();
  await page.locator('[data-brush="highlighter"]').click();
  await stroke(page, [
    [900, 450],
    [1150, 450],
  ]);
  const id = (await hook(page)).project.compositions[0]!.layers.at(-1)!.id;
  let drawing = await layer(page, id);
  expect(drawing.transform.opacity.value).toBe(0.4);
  expect(drawing.properties.strokeWidth.value).toBe(24);
  // V leaves draw mode; select and move it on the canvas.
  await page.keyboard.press('v');
  await expect(page.locator('[data-brush="highlighter"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const start = await toScreen(page, 1000, 450);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.keyboard.down('Control');
  await page.mouse.move(start.x - 60, start.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  const moved = await layer(page, id);
  expect(moved.transform.position.value[0]).toBeLessThan(
    drawing.transform.position.value[0],
  );
  // Its toolbar edits color and brush size.
  await expect(toolbar(page)).toHaveAttribute('data-kind', 'drawing');
  await page.locator('#toolbar-color').fill('#ff8800');
  await commit(page, 'brush', '30');
  drawing = await layer(page, id);
  expect(drawing.properties.stroke.value).toBe('#ff8800');
  expect(drawing.properties.strokeWidth.value).toBe(30);
  // Saved and reloaded.
  await page.keyboard.press('Control+s');
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await expect
    .poll(async () => (await layer(page, id))?.properties.path.value)
    .toBe(drawing.properties.path.value);
});

test('[CV-039] Copy style from text and Paste style onto a shape and a text in one undo step', async ({
  page,
}, testInfo) => {
  await select(page, 'example-headline');
  const headline = await toScreen(page, 200, 250);
  await page.mouse.click(headline.x, headline.y, { button: 'right' });
  await page.locator('#canvas-context-menu [data-action="copy-style"]').click();
  await select(page, 'example-badge', 'example-subtitle');
  const badge = await toScreen(page, 150, 460);
  await page.mouse.click(badge.x, badge.y, { button: 'right' });
  await page.screenshot({ path: testInfo.outputPath('style-menu.png') });
  await page
    .locator('#canvas-context-menu [data-action="paste-style"]')
    .click();
  expect((await layer(page, 'example-badge')).properties.fill.value).toBe(
    '#272b29',
  );
  const subtitle = await layer(page, 'example-subtitle');
  expect(subtitle.properties.fill.value).toBe('#272b29');
  expect(subtitle.properties.fontSize.value).toBe(78);
  expect((await hook(page)).history.labels).toEqual(['Paste style']);
  await page.locator('#undo').click();
  expect((await layer(page, 'example-badge')).properties.fill.value).toBe(
    '#cbbced',
  );
});

test('[SHP-020] the Eraser removes the whole strokes it touches in one undo step; size, color and opacity are shared by the brushes', async ({
  page,
}, testInfo) => {
  await page.locator('[data-category="Draw"]').click();
  await page.locator('[data-brush="pen"]').click();
  const size = page.locator('#draw-size-value');
  await size.fill('10');
  await size.press('Enter');
  await page.locator('#draw-color').fill('#0055ff');
  const blank = await pixel(page, 1100, 60);
  const before = layers((await hook(page)).project).length;
  const lines = [60, 250, 650];
  for (const y of lines)
    await stroke(page, [
      [950, y],
      [1150, y],
    ]);
  const ids = (await hook(page)).project.compositions[0]!.layers.slice(-3).map(
    (item) => item.id,
  );
  expect(await pixel(page, 1100, 60)).not.toEqual(blank);
  // Shared settings: the Marker keeps the size and color set for the Pen.
  await page.locator('[data-brush="marker"]').click();
  await expect(size).toHaveValue('10');
  await expect(page.locator('#draw-color')).toHaveValue('#0055ff');
  // The Eraser uses the size; color and opacity do not apply to it.
  await page.locator('[data-brush="eraser"]').click();
  await expect(page.locator('[data-brush="eraser"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('#draw-color')).toBeDisabled();
  await expect(page.locator('#draw-opacity')).toBeDisabled();
  await expect(size).toHaveValue('10');
  // A vertical drag across the first two strokes (and the example's cards).
  const from = await toScreen(page, 1100, 20);
  const to = await toScreen(page, 1100, 400);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  // Touched strokes vanish at once, but nothing is committed before release.
  await expect.poll(() => pixel(page, 1100, 60)).toEqual(blank);
  expect((await hook(page)).history.labels.at(-1)).toBe('Draw');
  await page.screenshot({ path: testInfo.outputPath('erasing.png') });
  await page.mouse.up();
  const after = (await hook(page)).project.compositions[0]!.layers.map(
    (item) => item.id,
  );
  expect(after).not.toContain(ids[0]);
  expect(after).not.toContain(ids[1]);
  expect(after).toContain(ids[2]);
  // Only freehand strokes are erased: the example's own layers remain.
  expect(layers((await hook(page)).project)).toHaveLength(before + 1);
  const history = (await hook(page)).history.labels;
  expect(history.slice(-2)).toEqual(['Draw', 'Erase']);
  // The clips went with the layers.
  const clips = (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  );
  expect(clips.some((clip) => clip.layerId === ids[0])).toBe(false);
  // One undo brings both strokes back.
  await page.keyboard.press('Control+z');
  const restored = (await hook(page)).project.compositions[0]!.layers.map(
    (item) => item.id,
  );
  expect(restored).toEqual(expect.arrayContaining(ids));
  // A drag that touches nothing adds no history (redo stays available).
  const undoable = (await hook(page)).history.labels.length;
  await stroke(page, [
    [40, 700],
    [120, 700],
  ]);
  expect((await hook(page)).history.labels).toHaveLength(undoable);
  expect((await hook(page)).history.canRedo).toBe(true);
});
