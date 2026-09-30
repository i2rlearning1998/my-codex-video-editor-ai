import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// H1.4: wheel, trackpad and pan rules. Ctrl or Cmd with the wheel zooms
// toward the pointer. A plain wheel never moves an artboard that fits; when
// zoomed in it pans (Shift: sideways), and every pan (wheel, Space-drag, the
// middle button, the hand tool) is clamped so at most 48 px of stage shows
// past the artboard's edge. Below Fit the artboard stays centred; 10% is the
// smallest zoom.
type Matrix = [number, number, number, number, number, number];
const view = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __AIVE__: { getCanvas(): { view: Matrix } } }
      ).__AIVE__.getCanvas().view,
  );
async function frame(page: Page) {
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  const [a, , , d, e, f] = await view(page);
  return {
    left: e,
    top: f,
    right: e + a * 1280,
    bottom: f + d * 720,
    scale: a,
    width: box.width,
    height: box.height,
    box,
  };
}
async function center(page: Page) {
  const { box } = await frame(page);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function zoomIn(page: Page, times: number) {
  for (let i = 0; i < times; i++)
    await page.locator('[data-canvas-zoom="in"]').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[CV-050] at Fit the artboard never moves: wheel, Shift+wheel, Space-drag and the hand tool leave it in place', async ({
  page,
}) => {
  const start = await view(page);
  const middle = await center(page);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.wheel(0, 400);
  await page.mouse.wheel(300, 0);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 400);
  await page.keyboard.up('Shift');
  expect(await view(page)).toEqual(start);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(middle.x + 150, middle.y + 90, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  expect(await view(page)).toEqual(start);
  await page.locator('[data-canvas-tool="hand"]').click();
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x - 120, middle.y - 60, { steps: 5 });
  await page.mouse.up();
  expect(await view(page)).toEqual(start);
});

test('[CV-050] Ctrl+wheel zooms toward the pointer; zoomed in, the wheel pans and stops 48 px past each edge', async ({
  page,
}) => {
  const { box } = await frame(page);
  // Whole pixels: Chromium reports wheel events at integer coordinates.
  const at = {
    x: Math.round(box.x + box.width * 0.3),
    y: Math.round(box.y + box.height * 0.4),
  };
  const [a, , , d, e, f] = await view(page);
  const point = [(at.x - box.x - e) / a, (at.y - box.y - f) / d];
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  const zoomed = await view(page);
  expect(zoomed[0]).toBeGreaterThan(a * 1.5);
  expect(zoomed[0] * point[0]! + zoomed[4] + box.x).toBeCloseTo(at.x, 0);
  expect(zoomed[3] * point[1]! + zoomed[5] + box.y).toBeCloseTo(at.y, 0);
  // Far down: the artboard's bottom edge stops 48 px above the view's.
  await page.mouse.wheel(0, 20000);
  let now = await frame(page);
  expect(now.bottom).toBeCloseTo(now.height - 48, 0);
  await page.mouse.wheel(0, -40000);
  now = await frame(page);
  expect(now.top).toBeCloseTo(48, 0);
  // Shift+wheel pans sideways, clamped the same way.
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 40000);
  await page.keyboard.up('Shift');
  now = await frame(page);
  expect(now.right).toBeCloseTo(now.width - 48, 0);
  // A trackpad's two-finger scroll (deltaX) too.
  await page.mouse.wheel(-40000, 0);
  now = await frame(page);
  expect(now.left).toBeCloseTo(48, 0);
});

test('[CV-050] Space-drag, the middle button and the hand tool are clamped the same way', async ({
  page,
}) => {
  await zoomIn(page, 4);
  const middle = await center(page);
  await page.mouse.move(middle.x, middle.y);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(middle.x + 5000, middle.y + 5000, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  let now = await frame(page);
  expect(now.left).toBeCloseTo(48, 0);
  expect(now.top).toBeCloseTo(48, 0);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(middle.x - 8000, middle.y - 8000, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  now = await frame(page);
  expect(now.right).toBeCloseTo(now.width - 48, 0);
  expect(now.bottom).toBeCloseTo(now.height - 48, 0);
  await page.locator('[data-canvas-tool="hand"]').click();
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + 8000, middle.y, { steps: 4 });
  await page.mouse.up();
  now = await frame(page);
  expect(now.left).toBeCloseTo(48, 0);
});

test('[CV-050] below Fit the artboard stays centred and the zoom stops at 10%', async ({
  page,
}) => {
  for (let i = 0; i < 20; i++)
    await page.locator('[data-canvas-zoom="out"]').click();
  let now = await frame(page);
  expect(now.scale).toBeCloseTo(0.1, 5);
  expect((now.left + now.right) / 2).toBeCloseTo(now.width / 2, 0);
  expect((now.top + now.bottom) / 2).toBeCloseTo(now.height / 2, 0);
  const middle = await center(page);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.wheel(300, 300);
  const after = await frame(page);
  expect(after.left).toBeCloseTo(now.left, 5);
  expect(after.top).toBeCloseTo(now.top, 5);
  // Ctrl+wheel out at a corner still keeps it centred.
  await page.mouse.move(now.box.x + 20, now.box.y + 20);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 2000);
  await page.keyboard.up('Control');
  now = await frame(page);
  expect(now.scale).toBeCloseTo(0.1, 5);
  expect((now.left + now.right) / 2).toBeCloseTo(now.width / 2, 0);
  await expect(page.locator('#canvas-zoom-percent')).toHaveValue('10');
});
