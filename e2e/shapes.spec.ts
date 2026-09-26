import type { Page } from '@playwright/test';
import { test, expect, hook, artboard } from './fixtures';

// W5-D shapes on the default example (1280x720). Presets are added centered:
// rectangle 520..760 x 280..440, ellipse 540..740 x 260..460, line 520..760 x
// 348..372, arrow 520..760 x 342..378. Pixels are compared with the canvas
// before the shape was added, with the selection cleared so no handles show.
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function toScreen(page: Page, x: number, y: number) {
  let board = boards.get(page);
  if (!board) boards.set(page, (board = await artboard(page)));
  return { x: board.x + x * board.scale, y: board.y + y * board.scale };
}
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
    ].slice(0, 3);
  }, point);
}
/** Pixels with the selection cleared, then the layer selected again. */
async function clean(page: Page, points: [number, number][], id?: string) {
  await page.locator('canvas').focus();
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([]);
  const values = [];
  for (const [x, y] of points) values.push(await pixel(page, x, y));
  if (id) await select(page, id);
  return values;
}
async function select(page: Page, id: string) {
  // The Scene list shows only in the Scene category.
  await page.locator('[data-category="Scene"]').click();
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([id]);
}
const layers = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers as any[];
const lastLabel = async (page: Page) =>
  (await hook(page)).history.labels.at(-1);
async function add(page: Page, preset: string) {
  await page.locator('[data-category="Elements"]').click();
  await page.locator(`[data-shape="${preset}"]`).click();
  expect(await lastLabel(page)).toBe('Add shape');
  const layer = (await layers(page)).at(-1)!;
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([layer.id]);
  return layer;
}
async function commit(page: Page, id: string, value: string) {
  const input = page.locator(`#toolbar-${id}`);
  await input.fill(value);
  await input.press('Enter');
}
const close = (a: number[], b: number[], tolerance = 12) =>
  a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);
const PURPLE = [0x8b, 0x6c, 0xff];
const INK = [0x27, 0x2b, 0x29];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[SHP-001] the Elements panel adds a rectangle, rounded rectangle, ellipse, line and arrow at the playhead', async ({
  page,
}, testInfo) => {
  const points: [number, number][] = [
    [640, 360], // center
    [523, 283], // rectangle's top-left corner
    [600, 352], // 8 units above the axis: beside a 6-unit shaft
  ];
  const [, corner, beside] = await clean(page, points);
  // Rectangle: fills its box, and its clip starts at the playhead.
  const rectangle = await add(page, 'rectangle');
  expect(rectangle.properties.shapeKind.value).toBe('rectangle');
  const clip = (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((item) => item.layerId === rectangle.id)!;
  expect(clip.startTime).toBe(0);
  let [c, k] = await clean(page, points.slice(0, 2));
  expect(close(c!, PURPLE)).toBe(true);
  expect(close(k!, PURPLE)).toBe(true);
  await page.keyboard.press('Control+z');
  // Rounded rectangle: the corner stays empty.
  const rounded = await add(page, 'rounded');
  expect(rounded.properties.cornerRadius.value).toBe(32);
  [c, k] = await clean(page, points.slice(0, 2));
  expect(close(c!, PURPLE)).toBe(true);
  expect(k).toEqual(corner);
  await page.keyboard.press('Control+z');
  // Ellipse: 200x200 centered; the rectangle's corner is outside it.
  await add(page, 'ellipse');
  [c, k] = await clean(page, points.slice(0, 2));
  expect(close(c!, PURPLE)).toBe(true);
  expect(k).toEqual(corner);
  await page.keyboard.press('Control+z');
  // Line: a 6-unit dark stroke along the middle.
  const line = await add(page, 'line');
  expect(line.properties.strokeWidth.value).toBe(6);
  [c] = await clean(page, [points[0]!]);
  expect(close(c!, INK, 30)).toBe(true);
  // Its fill controls are disabled.
  await select(page, line.id);
  await expect(page.locator('#toolbar-fill')).toBeDisabled();
  await page.keyboard.press('Control+z');
  // Arrow: the head at the right end is wider than the 6-unit shaft.
  await add(page, 'arrow');
  const [shaft, arrowHead] = await clean(page, [
    [600, 352],
    [750, 355],
  ]);
  expect(shaft).toEqual(beside);
  expect(close(arrowHead!, INK, 30)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('arrow.png') });
});

test('[SHP-003][SHP-006] fill opacity, no fill and corner radius, one undo step each', async ({
  page,
}) => {
  const points: [number, number][] = [
    [640, 360],
    [523, 283],
  ];
  const [center, corner] = await clean(page, points);
  const rectangle = await add(page, 'rectangle');
  await commit(page, 'fill-opacity', '50');
  expect(await lastLabel(page)).toBe('Set fill opacity');
  let [c] = await clean(page, points, rectangle.id);
  // Half purple over what was there.
  for (let i = 0; i < 3; i++)
    expect(c![i]).toBeCloseTo((PURPLE[i]! + center![i]!) / 2, -1);
  await page.locator('#context-toolbar [data-control="no-fill"]').click();
  expect(await lastLabel(page)).toBe('Remove fill');
  await expect(
    page.locator('#context-toolbar [data-control="no-fill"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  [c] = await clean(page, points, rectangle.id);
  expect(c).toEqual(center);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  // Corner radius 60 empties the corner; ellipses cannot take one.
  await select(page, rectangle.id);
  await commit(page, 'corners', '60');
  expect(await lastLabel(page)).toBe('Set corner radius');
  const [, k] = await clean(page, points, rectangle.id);
  expect(k).toEqual(corner);
  await commit(page, 'corners', '-5');
  await expect(
    page.locator('.toast-error', { hasText: 'out of range' }),
  ).toBeVisible();
  const ellipse = await add(page, 'ellipse');
  await select(page, ellipse.id);
  await expect(page.locator('#toolbar-corners')).toBeDisabled();
});

test('[SHP-005] stroke color, width, dash, caps and joins', async ({
  page,
}, testInfo) => {
  const rectangle = await add(page, 'rectangle');
  await page.locator('#toolbar-stroke').fill('#00aa00');
  // A stroke color on a shape without one also gives it a width of 4.
  expect(await lastLabel(page)).toBe('Set stroke');
  let layer = (await layers(page)).at(-1)!;
  expect(layer.properties.stroke.value).toBe('#00aa00');
  expect(layer.properties.strokeWidth.value).toBe(4);
  await commit(page, 'width', '12');
  expect(await lastLabel(page)).toBe('Set stroke width');
  // The stroke sits inside the box: its edge is green, the middle purple.
  let [edge, inside] = await clean(
    page,
    [
      [600, 285],
      [640, 360],
    ],
    rectangle.id,
  );
  expect(close(edge!, [0, 0xaa, 0])).toBe(true);
  expect(close(inside!, PURPLE)).toBe(true);
  // Dashes leave gaps along the top edge.
  await page.locator('#context-toolbar [data-control="stroke-style"]').click();
  await page.locator('#toolbar-dash').selectOption('dash');
  expect(await lastLabel(page)).toBe('Set stroke dash');
  const samples: [number, number][] = Array.from(
    { length: 40 },
    (_, i) => [540 + i * 4, 285] as [number, number],
  );
  const dashed = await clean(page, samples, rectangle.id);
  const green = dashed.filter((value) => close(value, [0, 0xaa, 0])).length;
  expect(green).toBeGreaterThan(8);
  expect(green).toBeLessThan(36);
  await page.screenshot({ path: testInfo.outputPath('dashed.png') });
  await page.locator('#toolbar-join').selectOption('round');
  await page.locator('#toolbar-cap').selectOption('round');
  layer = (await layers(page)).at(-1)!;
  expect(layer.properties.strokeJoin.value).toBe('round');
  expect(layer.properties.strokeCap.value).toBe('round');
  // Caps show on a line: a round cap reaches past the end, a flat one does not.
  const [beyond] = await clean(page, [[766, 360]]);
  const line = await add(page, 'line');
  await commit(page, 'width', '20');
  await page.locator('#toolbar-cap').selectOption('butt');
  let [cap] = await clean(page, [[766, 360]], line.id);
  expect(cap).toEqual(beyond);
  await page.locator('#toolbar-cap').selectOption('round');
  [cap] = await clean(page, [[766, 360]]);
  expect(close(cap!, INK, 30)).toBe(true);
});

test('[SHP-015] two overlapping shapes combine by union, subtract, intersect and exclude, one undo step each', async ({
  page,
}, testInfo) => {
  const points: [number, number][] = [
    [640, 360], // inside both
    [523, 283], // rectangle only
    [640, 263], // ellipse only
  ];
  const [center, corner, top] = await clean(page, points);
  const rectangle = await add(page, 'rectangle');
  const ellipse = await add(page, 'ellipse');
  const before = (await layers(page)).length;
  const combine = async (op: string) => {
    await select(page, rectangle.id);
    await page
      .locator(`#scene-list [data-layer-id="${ellipse.id}"]`)
      .click({ modifiers: ['Control'] });
    const at = await toScreen(page, 640, 360);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await page.locator('#canvas-context-menu [data-action="combine"]').click();
    await page.locator(`[data-action="combine-${op}"]`).click();
    const result = (await layers(page)).at(-1)!;
    expect(result.properties.shapeKind.value).toBe('path');
    expect((await layers(page)).length).toBe(before - 1);
    return clean(page, points);
  };
  let [c, r, e] = await combine('union');
  expect(await lastLabel(page)).toBe('Union shapes');
  expect([c, r, e].every((value) => close(value!, PURPLE))).toBe(true);
  await page.keyboard.press('Control+z');
  expect((await layers(page)).length).toBe(before);
  [c, r, e] = await combine('subtract');
  // The bottom shape (the rectangle) minus the ellipse.
  expect(c).toEqual(center);
  expect(close(r!, PURPLE)).toBe(true);
  expect(e).toEqual(top);
  await page.screenshot({ path: testInfo.outputPath('subtract.png') });
  await page.keyboard.press('Control+z');
  [c, r, e] = await combine('intersect');
  expect(close(c!, PURPLE)).toBe(true);
  expect(r).toEqual(corner);
  expect(e).toEqual(top);
  await page.keyboard.press('Control+z');
  [c, r, e] = await combine('exclude');
  expect(c).toEqual(center);
  expect(close(r!, PURPLE)).toBe(true);
  expect(close(e!, PURPLE)).toBe(true);
  // The result is an ordinary layer: it can be moved and saved.
  const result = (await layers(page)).at(-1)!;
  await page.keyboard.press('Control+s');
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await expect
    .poll(async () => (await layers(page)).at(-1)?.properties.polygon.value)
    .toBe(result.properties.polygon.value);
  // Combine needs closed shapes: a line is refused (the menu hides it).
  const line = await add(page, 'line');
  await select(page, line.id);
  await page
    .locator(`#scene-list [data-layer-id="${result.id}"]`)
    .click({ modifiers: ['Control'] });
  const at = await toScreen(page, 640, 360);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(
    page.locator('#canvas-context-menu [data-action="combine"]'),
  ).toHaveCount(0);
});
