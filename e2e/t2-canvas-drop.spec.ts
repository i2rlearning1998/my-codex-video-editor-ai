import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  toScreen,
  artboard,
} from './fixtures';

// T2: while a library item is dragged over the canvas, an outline of its real
// size and shape follows the pointer, snaps to the canvas centre and edges,
// and the canvas is highlighted; the drop lands exactly there in one step.
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const labels = async (page: Page) => (await hook(page)).history.labels;
const outline = (page: Page) => page.locator('.canvas-drop-box');

async function pickUp(page: Page, selector: string) {
  const card = page.locator(selector).first();
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, {
    steps: 2,
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[CV-061] a dragged rectangle shows its real-size outline at the pointer with the canvas highlighted; the drop lands exactly there in one step', async ({
  page,
}, testInfo) => {
  const board = await artboard(page);
  await showCategory(page, 'Elements');
  await pickUp(page, '[data-shape="rectangle"]');
  // At composition (300, 260): the 240 × 160 rectangle, centred there.
  const at = await toScreen(page, 300, 260);
  await page.mouse.move(at.x, at.y, { steps: 6 });
  await expect(outline(page)).toBeVisible();
  await expect(page.locator('#canvas-stage')).toHaveClass(/drop-highlight/);
  const box = (await outline(page).boundingBox())!;
  // (toScreen finds the artboard from whole canvas pixels: about 1 px.)
  const near = (a: number, b: number, d = 1.5) =>
    expect(Math.abs(a - b)).toBeLessThan(d);
  near(box.width, 240 * board.scale);
  near(box.height, 160 * board.scale);
  near(box.x + box.width / 2, at.x);
  near(box.y + box.height / 2, at.y);
  await page.screenshot({ path: testInfo.outputPath('drop-outline.png') });
  const steps = (await labels(page)).length;
  await page.mouse.up();
  await expect(outline(page)).toBeHidden();
  await expect(page.locator('#canvas-stage')).not.toHaveClass(/drop-highlight/);
  expect((await labels(page)).length).toBe(steps + 1);
  expect((await labels(page)).at(-1)).toBe('Add shape');
  const shape = (await scene(page)).layers.at(-1)!;
  const [x, y] = shape.transform.position.value as number[];
  near(x! + 120, 300, 2.5);
  near(y! + 80, 260, 2.5);
  // One Undo removes it.
  await page.keyboard.press('Control+z');
  expect((await scene(page)).layers.some((item) => item.id === shape.id)).toBe(
    false,
  );
});

test('[CV-061] the outline snaps to the canvas centre with a guide, and a text style shows its own size', async ({
  page,
}) => {
  await showCategory(page, 'Elements');
  await pickUp(page, '[data-shape="rectangle"]');
  // 4 px from the centre: the outline snaps onto it and a guide shows.
  const centre = await toScreen(page, 640, 360);
  await page.mouse.move(centre.x + 4, centre.y - 3, { steps: 6 });
  const box = (await outline(page).boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - centre.x)).toBeLessThan(1.5);
  expect(Math.abs(box.y + box.height / 2 - centre.y)).toBeLessThan(1.5);
  await expect(page.locator('.canvas-drop-guide.vertical')).toBeVisible();
  await expect(page.locator('.canvas-drop-guide.horizontal')).toBeVisible();
  await page.mouse.up();
  const shape = (await scene(page)).layers.at(-1)!;
  const [x, y] = shape.transform.position.value as number[];
  expect([x, y]).toEqual([520, 280]);
  // A text style: the outline has the size the inserted text then has.
  await showCategory(page, 'Text');
  await pickUp(page, '.library-card[data-item-id="text-1"]');
  const at = await toScreen(page, 400, 500);
  await page.mouse.move(at.x, at.y, { steps: 6 });
  const drawn = (await outline(page).boundingBox())!;
  await page.mouse.up();
  expect((await labels(page)).at(-1)).toBe('Add text');
  // The new text's drawn selection corners (canvas pixels) match the outline.
  const corners = await page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getCanvas: () => { corners: number[][] | null } };
        }
      ).__AIVE__.getCanvas().corners,
  );
  expect(corners).not.toBeNull();
  const xs = corners!.map((p) => p[0]!),
    ys = corners!.map((p) => p[1]!);
  expect(
    Math.abs(Math.max(...xs) - Math.min(...xs) - drawn.width),
  ).toBeLessThan(2);
  expect(
    Math.abs(Math.max(...ys) - Math.min(...ys) - drawn.height),
  ).toBeLessThan(2);
  expect(drawn.width).toBeGreaterThan(20);
});
