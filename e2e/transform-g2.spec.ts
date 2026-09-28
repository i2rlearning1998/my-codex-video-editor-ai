import type { Page } from '@playwright/test';
import { test, expect, hook, artboard } from './fixtures';

// G2: what the Inspector says about an object's size and place matches what
// is drawn, for every kind of object, before and after a handle drag.
// Fixture g2-types.json (1280x720): text 60,60 360x60; rect 500,60
// 200x120; line 820,100 240x24 (8 wide); pen drawing 60,250 292x82; group
// 500,300 of two 120x80 boxes (0,0 and 140,40); image 860,300 240x135;
// video 60,500 240x135 (no media bytes: flat placeholders).
type Rect = [number, number, number, number];
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function board(page: Page) {
  let value = boards.get(page);
  if (!value) boards.set(page, (value = await artboard(page)));
  return value;
}
async function toScreen(page: Page, x: number, y: number) {
  const { x: left, y: top, scale } = await board(page);
  return { x: left + x * scale, y: top + y * scale };
}
/** Composition-space bounds of the ink (darker than the paper) in a rectangle. */
async function ink(page: Page, rect: Rect) {
  const { x, y, scale } = await board(page);
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, { rect, x, y, scale }) => {
      const box = canvas.getBoundingClientRect();
      const ratio = canvas.width / box.width;
      const px = (value: number, origin: number, base: number) =>
        Math.round((origin + value * scale - base) * ratio);
      const left = px(rect[0], x, box.x),
        top = px(rect[1], y, box.y);
      const width = px(rect[2], x, box.x) - left,
        height = px(rect[3], y, box.y) - top;
      const { data } = canvas
        .getContext('2d')!
        .getImageData(left, top, width, height);
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let row = 0; row < height; row++)
        for (let column = 0; column < width; column++) {
          const i = (row * width + column) * 4;
          if (data[i]! + data[i + 1]! + data[i + 2]! < 3 * 200) {
            minX = Math.min(minX, column);
            maxX = Math.max(maxX, column);
            minY = Math.min(minY, row);
            maxY = Math.max(maxY, row);
          }
        }
      const unit = ratio * scale;
      return {
        x: rect[0] + minX / unit,
        y: rect[1] + minY / unit,
        width: (maxX + 1 - minX) / unit,
        height: (maxY + 1 - minY) / unit,
      };
    },
    { rect, x, y, scale },
  );
}
async function inspector(page: Page): Promise<Box> {
  const read = async (id: string) =>
    Number(await page.locator(`#inspector-${id}`).inputValue());
  return {
    x: await read('x'),
    y: await read('y'),
    width: await read('w'),
    height: await read('h'),
  };
}
async function select(page: Page, ...ids: string[]) {
  for (const [index, id] of ids.entries())
    await page
      .locator(`#scene-list [data-layer-id="${id}"]`)
      .click(index ? { modifiers: ['Shift'] } : {});
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(ids);
}
async function deselect(page: Page) {
  await page.locator('#canvas-stage').focus();
  while ((await hook(page)).session.selectedIds.length)
    await page.keyboard.press('Escape');
}
async function drag(
  page: Page,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  const a = await toScreen(page, ...from);
  const b = await toScreen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
/** One screen pixel in composition units, plus antialiasing slack. */
async function tolerance(page: Page) {
  return 1.5 + 2 / (await board(page)).scale;
}
function expectBox(actual: Box, expected: Box, slack: number) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(slack);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(slack);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(slack);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(slack);
}

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('g2-types.json');
});

// Box-shaped objects: the drawn pixels fill the box exactly.
async function boxCase(page: Page, ids: string[], region: Rect) {
  const slack = await tolerance(page);
  await select(page, ...ids);
  const before = await inspector(page);
  await deselect(page);
  expectBox(await ink(page, region), before, slack);
  // Drag the bottom-right corner 30 units out along the diagonal.
  await select(page, ...ids);
  const corner: [number, number] = [
    before.x + before.width,
    before.y + before.height,
  ];
  await drag(page, corner, [
    corner[0] + 30,
    corner[1] + (30 * before.height) / before.width,
  ]);
  const after = await inspector(page);
  // Proportional: the ratio is kept and the top-left stays put.
  expect(after.width).toBeGreaterThan(before.width + 20);
  expect(after.width / after.height).toBeCloseTo(
    before.width / before.height,
    1,
  );
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(slack);
  await deselect(page);
  expectBox(await ink(page, region), after, slack);
}
test('[CV-044][INS-004] rectangle: X, Y, W and H match the drawn pixels before and after a corner drag', async ({
  page,
}) => boxCase(page, ['g2-rect'], [480, 30, 800, 230]));
test('[CV-044][INS-004] drawing: X, Y, W and H match the drawn pixels before and after a corner drag', async ({
  page,
}) => boxCase(page, ['g2-draw'], [30, 230, 480, 480]));
test('[CV-044][INS-004] group: X, Y, W and H match the drawn pixels before and after a corner drag', async ({
  page,
}) => boxCase(page, ['g2-group'], [480, 260, 840, 480]));
test('[CV-044][INS-004] image: X, Y, W and H match the drawn pixels before and after a corner drag', async ({
  page,
}) => boxCase(page, ['g2-image'], [840, 260, 1270, 520]));
test('[CV-044][INS-004] video: X, Y, W and H match the drawn pixels before and after a corner drag', async ({
  page,
}) => boxCase(page, ['g2-video'], [30, 480, 480, 710]));

test('[CV-044][CV-045] text: the glyphs sit inside X, Y, W and H and keep their shape after a corner drag', async ({
  page,
}) => {
  const slack = await tolerance(page);
  const region: Rect = [30, 30, 480, 220];
  await select(page, 'g2-text');
  const before = await inspector(page);
  // A text box's height follows its text; the ratio lock does not apply.
  await expect(page.locator('#inspector-h')).toBeDisabled();
  await deselect(page);
  const glyphs = await ink(page, region);
  expect(glyphs.x).toBeGreaterThanOrEqual(before.x - slack);
  expect(glyphs.y).toBeGreaterThanOrEqual(before.y - slack);
  expect(glyphs.x + glyphs.width).toBeLessThanOrEqual(
    before.x + before.width + slack,
  );
  expect(glyphs.y + glyphs.height).toBeLessThanOrEqual(
    before.y + before.height + slack,
  );
  await select(page, 'g2-text');
  const corner: [number, number] = [
    before.x + before.width,
    before.y + before.height,
  ];
  await drag(page, corner, [
    corner[0] + 36,
    corner[1] + (36 * before.height) / before.width,
  ]);
  const after = await inspector(page);
  await deselect(page);
  const grown = await ink(page, region);
  // Never stretched: the glyphs grow by the same factor both ways.
  const factor = grown.width / glyphs.width;
  expect(factor).toBeGreaterThan(1.05);
  expect(grown.height / glyphs.height).toBeCloseTo(factor, 1);
  expect(grown.x + grown.width).toBeLessThanOrEqual(
    after.x + after.width + slack,
  );
});

test('[CV-044][CV-045] line: only its two ends are handles; dragging an end lengthens it and X, Y, W and H follow', async ({
  page,
}) => {
  const slack = await tolerance(page);
  const region: Rect = [800, 60, 1270, 180];
  await select(page, 'g2-line');
  const before = await inspector(page);
  await deselect(page);
  const drawn = await ink(page, region);
  // The stroke runs along the box's middle from end to end; W is the
  // length, and the round caps reach half the 8-unit stroke past each end.
  expect(Math.abs(drawn.x - (before.x - 4))).toBeLessThanOrEqual(slack);
  expect(Math.abs(drawn.width - (before.width + 8))).toBeLessThanOrEqual(slack);
  expect(
    Math.abs(drawn.y + drawn.height / 2 - (before.y + before.height / 2)),
  ).toBeLessThanOrEqual(slack);
  await select(page, 'g2-line');
  // The corner is not a handle: dragging there moves the line instead.
  const middle = before.y + before.height / 2;
  await drag(
    page,
    [before.x + before.width, middle],
    [before.x + before.width + 60, middle],
  );
  const after = await inspector(page);
  expect(after.width).toBeCloseTo(before.width + 60, 0);
  expect(after.height).toBeCloseTo(before.height, 1);
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(slack);
  await deselect(page);
  const longer = await ink(page, region);
  expect(Math.abs(longer.width - (after.width + 8))).toBeLessThanOrEqual(slack);
});

test('[CV-044] a multi-selection: X, Y, W and H are its dashed box, match the drawn pixels after a corner drag, and X moves both', async ({
  page,
}) => {
  const slack = await tolerance(page);
  // The text (60,60 360x60) and the rectangle (500,60 200x120).
  const region: Rect = [30, 30, 800, 230];
  await select(page, 'g2-text', 'g2-rect');
  const before = await inspector(page);
  expect(before).toEqual({ x: 60, y: 60, width: 640, height: 120 });
  await expect(page.locator('#inspector-w')).toBeDisabled();
  await drag(
    page,
    [700, 180],
    [700 + 40, 180 + (40 * before.height) / before.width],
  );
  const after = await inspector(page);
  expect(after.width).toBeGreaterThan(before.width + 30);
  await deselect(page);
  const drawn = await ink(page, region);
  // The rectangle fills the box's right, top and bottom edges.
  expect(
    Math.abs(drawn.x + drawn.width - (after.x + after.width)),
  ).toBeLessThanOrEqual(slack);
  expect(Math.abs(drawn.y - after.y)).toBeLessThanOrEqual(slack);
  expect(
    Math.abs(drawn.y + drawn.height - (after.y + after.height)),
  ).toBeLessThanOrEqual(slack);
  // Typing X moves both layers by the same amount, as one undo step.
  await select(page, 'g2-text', 'g2-rect');
  const input = page.locator('#inspector-x');
  await input.fill(String(after.x + 20));
  await input.press('Enter');
  expect((await hook(page)).history.labels.at(-1)).toBe('Move layers');
  await expect(input).toHaveValue(String(after.x + 20));
});

test('[CV-044] X, Y, W and H follow a handle drag live, before the release', async ({
  page,
}) => {
  await select(page, 'g2-rect');
  const a = await toScreen(page, 700, 180);
  const b = await toScreen(page, 750, 210);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  // Mid-drag: nothing is committed, yet the fields show the new size.
  await expect
    .poll(async () => Number(await page.locator('#inspector-w').inputValue()))
    .toBeGreaterThan(240);
  const live = await inspector(page);
  expect(live.width / live.height).toBeCloseTo(200 / 120, 1);
  expect((await hook(page)).history.labels).toEqual([]);
  await page.mouse.up();
  expect((await hook(page)).history.labels).toEqual(['Resize layer']);
  // The committed size is the one shown during the drag.
  expect((await inspector(page)).width).toBeCloseTo(live.width, 0);
});

test('[CV-045] groups, drawings and pictures in a multi-selection are never stretched: no side handles', async ({
  page,
}) => {
  for (const id of ['g2-group', 'g2-draw']) {
    await select(page, id);
    const before = await inspector(page);
    const middle = before.y + before.height / 2;
    // The right side's midpoint is not a handle for a group or a drawing, so
    // no drag there can stretch it along one axis.
    await drag(
      page,
      [before.x + before.width, middle],
      [before.x + before.width + 50, middle],
    );
    const layer = (await hook(page)).project.compositions[0]!.layers.find(
      (item) => item.id === id,
    )!;
    expect(layer.transform.scale.value).toEqual([1, 1]);
    expect((await hook(page)).history.labels).not.toContain('Resize layer');
  }
  // Two plain shapes can still be stretched from the box's side.
  await select(page, 'g2-group-a', 'g2-group-b');
  const box = await inspector(page);
  await drag(
    page,
    [box.x + box.width, box.y + box.height / 2],
    [box.x + box.width + 52, box.y + box.height / 2],
  );
  expect((await hook(page)).history.labels.at(-1)).toBe('Resize layers');
  const stretched = await inspector(page);
  // Smart guides may pull the edge a few units; the height is untouched.
  expect(Math.abs(stretched.width - (box.width + 52))).toBeLessThanOrEqual(
    await tolerance(page),
  );
  expect(stretched.height).toBeCloseTo(box.height, 1);
});
