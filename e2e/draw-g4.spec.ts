import type { Page } from '@playwright/test';
import { test, expect, hook, artboard, showCategory } from './fixtures';
import { pickColor } from './controls';

// G4: the rebuilt Draw tools. Fixture g2-types.json leaves the area
// x 420..1250, y 470..710 empty (paper #f0eee7), where these tests draw.
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function toScreen(page: Page, x: number, y: number) {
  let board = boards.get(page);
  if (!board) boards.set(page, (board = await artboard(page)));
  return { x: board.x + x * board.scale, y: board.y + y * board.scale };
}
async function stroke(page: Page, points: [number, number][], shift = false) {
  const first = await toScreen(page, ...points[0]!);
  await page.mouse.move(first.x, first.y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const next = await toScreen(page, ...point);
    await page.mouse.move(next.x, next.y, { steps: 8 });
  }
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}
/** RGB at a composition point. */
async function pixel(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y);
  return page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement, point) => {
      const box = canvas.getBoundingClientRect();
      const ratio = canvas.width / box.width;
      return [
        ...canvas
          .getContext('2d')!
          .getImageData(
            Math.round((point.x - box.x) * ratio),
            Math.round((point.y - box.y) * ratio),
            1,
            1,
          ).data,
      ].slice(0, 3);
    }, point);
}
const PAPER = [0xf0, 0xee, 0xe7];
const differs = (rgb: number[], from = PAPER) =>
  rgb.reduce((sum, value, i) => sum + Math.abs(value - from[i]!), 0) > 24;
const light = (rgb: number[]) => rgb[0]! + rgb[1]! + rgb[2]!;
/** The rightmost inked x on a row, scanning outward from `x` in 0.5 steps. */
async function inkEnd(page: Page, x: number, y: number) {
  let end = x;
  for (let at = x; at < x + 30; at += 0.5)
    if (differs(await pixel(page, at, y))) end = at;
  return end;
}
async function useBrush(page: Page, brush: string, color = '#0055ff') {
  await page.locator(`[data-brush="${brush}"]`).click();
  await pickColor(page, 'draw-color', color);
}
const drawings = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers.filter(
    (layer) => (layer.properties as any).path,
  ) as any[];

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('g2-types.json');
  await showCategory(page, 'Draw');
});

test('[SHP-021][SHP-018] Pen, Marker, Highlighter and Glow pen draw differently, and each is stored as its brush', async ({
  page,
}, testInfo) => {
  // Pen 4, Marker 12, Highlighter 24 (40%), Glow pen 8: the defaults.
  await useBrush(page, 'pen');
  await stroke(page, [
    [460, 490],
    [1150, 490],
  ]);
  await useBrush(page, 'marker');
  await stroke(page, [
    [460, 540],
    [1150, 540],
  ]);
  await useBrush(page, 'highlighter');
  await stroke(page, [
    [460, 600],
    [1150, 600],
  ]);
  await useBrush(page, 'glow');
  await stroke(page, [
    [460, 670],
    [1150, 670],
  ]);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('brushes.png') });
  expect(
    // (The fixture has its own pen drawing first.)
    (await drawings(page))
      .slice(-4)
      .map((layer) => layer.properties.brush.value),
  ).toEqual(['pen', 'marker', 'highlighter', 'glow']);
  // Pen: a solid line in its colour.
  const pen = await pixel(page, 800, 490);
  expect(pen[2]).toBeGreaterThan(200);
  expect(pen[0]).toBeLessThan(40);
  // Marker: the rim (5 units out of 6) is lighter than the core.
  expect(light(await pixel(page, 800, 545))).toBeGreaterThan(
    light(await pixel(page, 800, 540)) + 60,
  );
  // Highlighter: translucent (the paper shows through) with flat ends,
  // while a round cap reaches past the end of its line.
  const highlighter = await pixel(page, 800, 600);
  expect(differs(highlighter)).toBe(true);
  expect(highlighter[0]).toBeGreaterThan(90);
  expect(await inkEnd(page, 1140, 600)).toBeLessThanOrEqual(1151);
  // (The Marker's round cap, 12 wide, reaches 6 units past its end.)
  expect(await inkEnd(page, 1140, 540)).toBeGreaterThan(1153);
  // Glow pen: a white-ish core and a halo well past the line's width (4 each
  // side), where the pen leaves the paper bare.
  expect(light(await pixel(page, 800, 670))).toBeGreaterThan(light(pen) + 150);
  expect(differs(await pixel(page, 800, 670 + 9))).toBe(true);
  expect(differs(await pixel(page, 800, 490 + 9))).toBe(false);
});

test('[SHP-022] Shift draws a straight line, strokes are smoothed, and a brush-size circle follows the pointer', async ({
  page,
}) => {
  await useBrush(page, 'pen');
  // The cursor circle is the brush's size at the canvas scale.
  const over = await toScreen(page, 800, 600);
  await page.mouse.move(over.x, over.y);
  const cursor = page.locator('#brush-cursor');
  await expect(cursor).toBeVisible();
  const board = await artboard(page);
  expect((await cursor.boundingBox())!.width).toBeCloseTo(
    Math.max(4, 4 * board.scale),
    0,
  );
  // A zigzag with Shift held: a straight line from the start to the end.
  const zigzag: [number, number][] = [
    [460, 520],
    [560, 480],
    [660, 560],
    [760, 480],
    [860, 520],
  ];
  await stroke(page, zigzag, true);
  let [layer] = (await drawings(page)).slice(-1);
  const straight = layer.properties.path.value.trim().split(/\s+/);
  expect(straight).toHaveLength(4);
  // Without Shift the same zigzag is kept, but smoothed: its sharp peaks
  // are rounded off, so it spans less height than the pointer did.
  await stroke(
    page,
    zigzag.map(([x, y]) => [x, y + 120]),
  );
  [layer] = (await drawings(page)).slice(-1);
  expect(
    layer.properties.path.value.trim().split(/\s+/).length,
  ).toBeGreaterThan(10);
  expect(layer.properties.height.value).toBeLessThan(80 + 4 - 4);
  expect(layer.properties.height.value).toBeGreaterThan(40);
});

test('[SHP-018][SHP-019] each brush keeps its own size, colour and opacity; the picker offers the design colours; strokes stay selectable and resizable', async ({
  page,
}) => {
  await page.locator('[data-brush="marker"]').click();
  const size = page.locator('#draw-size');
  const opacity = page.locator('#draw-opacity');
  await size.fill('20');
  await size.press('Enter');
  await opacity.fill('60');
  await opacity.press('Enter');
  // Size and opacity are clamped to 1-100 with a message.
  await size.fill('250');
  await size.press('Enter');
  await expect(size).toHaveValue('100');
  await size.fill('20');
  await size.press('Enter');
  // The colour picker lists the design's colours and has the full picker.
  await page.locator('#draw-color').click();
  await expect(
    page.locator('.color-popover [data-row="document"] [data-color="#e04040"]'),
  ).toBeVisible();
  await page
    .locator('.color-popover [data-row="document"] [data-color="#e04040"]')
    .click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#draw-color')).toHaveAttribute(
    'data-value',
    '#e04040',
  );
  // Another brush has its own values; the marker's come back.
  await page.locator('[data-brush="pen"]').click();
  await expect(size).toHaveValue('4');
  await expect(opacity).toHaveValue('100');
  await page.locator('[data-brush="marker"]').click();
  await expect(size).toHaveValue('20');
  await expect(opacity).toHaveValue('60');
  await stroke(page, [
    [500, 560],
    [900, 620],
  ]);
  const [drawn] = (await drawings(page)).slice(-1);
  expect(drawn.properties.strokeWidth.value).toBe(20);
  expect(drawn.properties.stroke.value).toBe('#e04040');
  expect(drawn.transform.opacity.value).toBe(0.6);
  // Leave draw mode: the stroke selects and resizes from its corner.
  // (The Scene list is hidden while Draw is open: select on the canvas.)
  await page.keyboard.press('v');
  const on = await toScreen(page, 700, 590);
  await page.mouse.click(on.x, on.y);
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([drawn.id]);
  const w = Number(await page.locator('#inspector-w').inputValue());
  const h = Number(await page.locator('#inspector-h').inputValue());
  const x = Number(await page.locator('#inspector-x').inputValue());
  const y = Number(await page.locator('#inspector-y').inputValue());
  const corner = await toScreen(page, x + w, y + h);
  const out = await toScreen(page, x + w * 1.2, y + h * 1.2);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(out.x, out.y, { steps: 6 });
  await page.mouse.up();
  expect((await hook(page)).history.labels.at(-1)).toBe('Resize layer');
  expect(
    Number(await page.locator('#inspector-w').inputValue()),
  ).toBeGreaterThan(w * 1.1);
});
