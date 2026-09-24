import type { Page } from '@playwright/test';
import { test, expect, hook, artboard, rulerBox } from './fixtures';

// The artboard never moves in these tests: scan the canvas once per page, not
// on every coordinate (full-canvas readbacks are expensive for the browser).
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function toScreen(page: Page, x: number, y: number) {
  let board = boards.get(page);
  if (!board) boards.set(page, (board = await artboard(page)));
  return { x: board.x + x * board.scale, y: board.y + y * board.scale };
}

// nle-example: layer-a 100..500 × 100..325 (0..2 s), layer-b 600..1000 ×
// 100..325 (3..5 s), layer-c 300..700 × 400..625 (1..4 s); canvas 1280×720.
async function layer(page: Page, id: string) {
  return (await hook(page)).project.compositions[0]!.layers.find(
    (item) => item.id === id,
  )!;
}
const position = async (page: Page, id: string) =>
  (await layer(page, id)).transform.position.value;
async function guides(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: {
            getCanvas(): { guides: { axis: string; value: number }[] };
          };
        }
      ).__AIVE__.getCanvas().guides,
  );
}
async function seek(page: Page, seconds: number) {
  const box = await rulerBox(page);
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.click(box.x + seconds * zoom, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
/** Presses at composition `from`, moves by a composition delta, and holds. */
async function press(
  page: Page,
  from: [number, number],
  delta: [number, number],
  free = false,
) {
  const start = await toScreen(page, from[0], from[1]);
  const scale = boards.get(page)!.scale;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Ctrl after the press: a Ctrl press would toggle the selection instead.
  if (free) await page.keyboard.down('Control');
  await page.mouse.move(
    start.x + delta[0] * scale,
    start.y + delta[1] * scale,
    { steps: 12 },
  );
}
async function release(page: Page) {
  await page.mouse.up();
  await page.keyboard.up('Control');
}
/** True when a guide-pink pixel is drawn within 2 CSS px of composition x. */
async function pinkColumn(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y);
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement, at) => {
    const box = canvas.getBoundingClientRect();
    const ratio = canvas.width / box.width;
    const context = canvas.getContext('2d')!;
    for (let dx = -2; dx <= 2; dx++) {
      const [r, g, b] = context.getImageData(
        Math.round((at.x - box.x + dx) * ratio),
        Math.round((at.y - box.y) * ratio),
        1,
        1,
      ).data;
      // Pink, also when anti-aliased over the light artboard.
      if (r! > 200 && r! - g! > 50 && b! - g! > 20) return true;
    }
    return false;
  }, point);
}

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await openFixtureProject('nle-example.json');
});

test('[CV-013] dragging near the canvas center snaps exactly and shows a guide; Ctrl places freely', async ({
  page,
}, testInfo) => {
  // Only layer-a is drawn at 0 s. Its center (300) moved by 337 lands 3 short of 640.
  await press(page, [300, 212], [337, 0]);
  await expect
    .poll(() => guides(page))
    .toContainEqual({ axis: 'x', value: 640 });
  await expect.poll(() => pinkColumn(page, 640, 690)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('center-guide.png') });
  await release(page);
  expect(await position(page, 'layer-a')).toEqual([440, 100]);
  expect(await guides(page)).toEqual([]);
  expect((await hook(page)).history.labels).toEqual(['Move layer']);
  await page.locator('#undo').click();
  expect(await position(page, 'layer-a')).toEqual([100, 100]);
  // The same drag with Ctrl held stays off the line, with no guide.
  await press(page, [300, 212], [337, 0], true);
  await expect.poll(() => guides(page)).toEqual([]);
  await expect.poll(() => pinkColumn(page, 640, 690)).toBe(false);
  await release(page);
  const free = await position(page, 'layer-a');
  expect(Math.abs(free[0] - 437)).toBeLessThan(1.5);
  expect(free[0]).not.toBe(440);
});

test('[CV-013] a layer snaps edge to edge with another layer', async ({
  page,
}, testInfo) => {
  await seek(page, 1.5);
  // layer-c's left edge (300) moved by 203 lands 3 past layer-a's right edge (500).
  await press(page, [500, 512], [203, 0]);
  await expect
    .poll(() => guides(page))
    .toContainEqual({ axis: 'x', value: 500 });
  await page.screenshot({ path: testInfo.outputPath('edge-guide.png') });
  await release(page);
  expect(await position(page, 'layer-c')).toEqual([500, 400]);
});

test('[CV-013] a right-edge resize snaps to the safe margin', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="layer-a"]').click();
  // The right edge (500) dragged 713 lands 3 short of the 5% margin (1216).
  await press(page, [500, 212.5], [713, 0]);
  await expect
    .poll(() => guides(page))
    .toContainEqual({ axis: 'x', value: 1216 });
  await release(page);
  const after = await layer(page, 'layer-a');
  expect(after.transform.position.value).toEqual([100, 100]);
  expect(400 * after.transform.scale.value[0]).toBeCloseTo(1116, 9);
  expect(after.transform.scale.value[1]).toBe(1);
  expect((await hook(page)).history.labels).toEqual(['Resize layer']);
});

async function alignMenu(page: Page, at: [number, number]) {
  // An open menu sits under the pointer; close it before right-clicking again.
  if (await page.locator('#canvas-context-menu').isVisible())
    await page.keyboard.press('Escape');
  await expect(page.locator('#canvas-context-menu')).toBeHidden();
  const point = await toScreen(page, at[0], at[1]);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.locator('#canvas-context-menu [data-action="align"]').click();
}
async function select(page: Page, ids: string[]) {
  await page.locator(`#scene-list [data-layer-id="${ids[0]}"]`).click();
  for (const id of ids.slice(1))
    await page
      .locator(`#scene-list [data-layer-id="${id}"]`)
      .click({ modifiers: ['Control'] });
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(ids);
}

test('[CV-025] align two layers to their selection, and one layer to the canvas', async ({
  page,
}, testInfo) => {
  await seek(page, 1.5);
  await select(page, ['layer-a', 'layer-c']);
  await alignMenu(page, [500, 512]);
  await page.screenshot({ path: testInfo.outputPath('align-menu.png') });
  await page.locator('[data-action="align-left"]').click();
  expect(await position(page, 'layer-a')).toEqual([100, 100]);
  expect(await position(page, 'layer-c')).toEqual([100, 400]);
  expect((await hook(page)).history.labels).toEqual(['Align layers']);
  // Middle of the combined bounds (100..625): both centers at 362.5.
  await alignMenu(page, [300, 512]);
  await page.locator('[data-action="align-middle"]').click();
  expect((await position(page, 'layer-a'))[1]).toBe(250);
  expect((await position(page, 'layer-c'))[1]).toBe(250);
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  expect(await position(page, 'layer-c')).toEqual([300, 400]);
  // One layer aligns to the canvas: center x 640.
  await select(page, ['layer-c']);
  await alignMenu(page, [500, 512]);
  await page.locator('[data-action="align-center"]').click();
  expect(await position(page, 'layer-c')).toEqual([440, 400]);
});

test('[CV-025] relative to canvas, distribute with equal gaps, and distribute needs three layers', async ({
  page,
}) => {
  await seek(page, 1.5);
  await select(page, ['layer-a', 'layer-c']);
  await alignMenu(page, [500, 512]);
  await expect(
    page.locator('[data-action="distribute-horizontal"]'),
  ).toBeDisabled();
  await page.locator('[data-action="align-to-canvas"]').click();
  await expect(page.locator('[data-action="align-to-canvas"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.locator('[data-action="align-right"]').click();
  expect(await position(page, 'layer-a')).toEqual([880, 100]);
  expect(await position(page, 'layer-c')).toEqual([880, 400]);
  await page.locator('#undo').click();
  // Three layers from the palette-backed menu: a 100..500, c 300..700, b 600..1000.
  await page.keyboard.press('Control+a');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toHaveLength(3);
  await alignMenu(page, [500, 512]);
  await page.locator('[data-action="align-to-canvas"]').click();
  await alignMenu(page, [500, 512]);
  await expect(page.locator('[data-action="align-to-canvas"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.locator('[data-action="distribute-horizontal"]').click();
  const xs = await Promise.all(
    ['layer-a', 'layer-c', 'layer-b'].map(
      async (id) => (await position(page, id))[0],
    ),
  );
  // Outer layers stay; the middle one gets equal (here overlapping) gaps.
  expect(xs[0]).toBe(100);
  expect(xs[2]).toBe(600);
  expect(xs[1]! - (xs[0]! + 400)).toBeCloseTo(xs[2]! - (xs[1]! + 400), 9);
  expect((await hook(page)).history.labels.at(-1)).toBe('Distribute layers');
});
