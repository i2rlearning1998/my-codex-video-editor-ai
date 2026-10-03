import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, toScreen } from './fixtures';
import { reveal } from './controls';

// J2: gradient stops survive Solid, Linear and Radial; keyboard undo and
// redo work right after a panel edit without a click elsewhere.
const labels = async (page: Page) => (await hook(page)).history.labels;
const layer = async (page: Page, id: string): Promise<any> => {
  const state = await hook(page);
  const find = (layers: any[]): any =>
    layers.find((item) => item.id === id) ??
    layers.map((item) => find(item.children)).find(Boolean);
  return find(
    state.project.compositions.find(
      (item) => item.id === state.session.compositionId,
    )!.layers as any[],
  );
};
const gradientOf = async (page: Page, id: string) => {
  const value = (await layer(page, id)).properties.fillGradient?.value;
  return value ? JSON.parse(value) : null;
};
/** RGB of the canvas at a composition point. */
async function pixel(page: Page, x: number, y: number) {
  const at = await toScreen(page, x, y);
  return page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement, at) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / rect.width;
      return [
        ...canvas
          .getContext('2d')!
          .getImageData(
            Math.round((at.x - rect.x) * ratio),
            Math.round((at.y - rect.y) * ratio),
            1,
            1,
          )
          .data.slice(0, 3),
      ];
    }, at);
}
/** Sets a gradient stop's colour with the picker's hex field. */
async function stopColor(page: Page, index: number, hex: string) {
  await page.locator(`#gradient-stop-${index}`).click();
  const input = page
    .getByRole('dialog', { name: 'Colour stop' })
    .locator('#color-picker-hex');
  await input.fill(hex);
  await input.press('Enter');
  await expect(page.locator(`#gradient-stop-${index}`)).toHaveAttribute(
    'data-value',
    hex,
  );
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
}
async function addRectangle(page: Page) {
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="rectangle"]').click();
  const state = await hook(page);
  return state.session.selectedIds[0]!;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[SHP-029] Solid, Linear and Radial share one stop list: red and yellow survive every switch, Solid shows the first stop', async ({
  page,
}) => {
  const id = await addRectangle(page);
  // The rectangle spans 520..760 × 280..440 on the 1280 × 720 example.
  await reveal(page, 'toolbar-fill-opacity');
  await page.locator('[data-gradient-type="linear"]').click();
  await stopColor(page, 0, '#ff0000');
  await stopColor(page, 1, '#ffff00');
  const redYellow = [
    { offset: 0, color: '#ff0000' },
    { offset: 1, color: '#ffff00' },
  ];
  expect((await gradientOf(page, id)).stops).toEqual(redYellow);
  // Solid: the first stop, drawn red.
  await page.locator('[data-gradient-type="solid"]').click();
  let shape = await layer(page, id);
  expect(shape.properties.fillGradient.value).toBe('');
  expect(shape.properties.fill.value.slice(0, 7)).toBe('#ff0000');
  await expect.poll(() => pixel(page, 640, 360)).toEqual([255, 0, 0]);
  // Radial and Linear bring the same stops back exactly.
  await page.locator('[data-gradient-type="radial"]').click();
  let gradient = await gradientOf(page, id);
  expect(gradient.type).toBe('radial');
  expect(gradient.stops).toEqual(redYellow);
  await page.locator('[data-gradient-type="linear"]').click();
  gradient = await gradientOf(page, id);
  expect(gradient.type).toBe('linear');
  expect(gradient.stops).toEqual(redYellow);
  // Left is red and right is yellow.
  const left = await pixel(page, 524, 360),
    right = await pixel(page, 756, 360);
  // The gradient runs corner to corner, so the edges are nearly pure.
  expect(left[0]).toBeGreaterThan(200);
  expect(right[0]).toBeGreaterThan(200);
  expect(right[1]! - left[1]!).toBeGreaterThan(100);
  // Solid, then a new solid colour, then Linear: the new colour leads.
  await page.locator('[data-gradient-type="solid"]').click();
  shape = await layer(page, id);
  expect(shape.properties.fill.value.slice(0, 7)).toBe('#ff0000');
  // Undo walks back through the switches.
  await page.keyboard.press('Control+z');
  expect((await gradientOf(page, id)).stops).toEqual(redYellow);
  expect((await labels(page)).at(-1)).toBe('Set gradient');
});

test('[KEY-017] Ctrl+Z and Ctrl+Shift+Z work right after panel edits with no click elsewhere; Ctrl+Z inside a field being typed in stays with the field', async ({
  page,
}) => {
  const id = await addRectangle(page);
  // 1. A colour picker's hex field, committed with Enter: focus stays in it.
  await reveal(page, 'toolbar-fill-opacity');
  const before = (await layer(page, id)).properties.fill.value;
  // The Colour panel shows the fill's picker inline.
  const hex = page
    .getByRole('region', { name: 'Fill' })
    .locator('#color-picker-hex');
  await hex.fill('#123456');
  await hex.press('Enter');
  expect((await layer(page, id)).properties.fill.value.slice(0, 7)).toBe(
    '#123456',
  );
  await expect(hex).toBeFocused();
  await page.keyboard.press('Control+z');
  expect((await layer(page, id)).properties.fill.value).toBe(before);
  await page.keyboard.press('Control+Shift+z');
  expect((await layer(page, id)).properties.fill.value.slice(0, 7)).toBe(
    '#123456',
  );
  // 2. A segmented button in a side panel (the gradient type).
  await page.locator('[data-gradient-type="linear"]').click();
  expect(await gradientOf(page, id)).not.toBeNull();
  await page.keyboard.press('Control+z');
  expect(await gradientOf(page, id)).toBeNull();
  await page.keyboard.press('Control+y');
  expect(await gradientOf(page, id)).not.toBeNull();
  // 3. A number field committed with Enter (the fill opacity).
  const opacity = await reveal(page, 'toolbar-fill-opacity');
  await opacity.fill('40');
  await opacity.press('Enter');
  expect((await layer(page, id)).properties.fillOpacity.value).toBeCloseTo(0.4);
  await page.keyboard.press('Control+z');
  expect(
    (await layer(page, id)).properties.fillOpacity?.value ?? 1,
  ).toBeCloseTo(1);
  await page.keyboard.press('Control+Shift+z');
  expect((await layer(page, id)).properties.fillOpacity.value).toBeCloseTo(0.4);
  // 4. While typing (not committed), Ctrl+Z belongs to the field.
  const steps = (await labels(page)).length;
  const field = await reveal(page, 'toolbar-fill-opacity');
  await field.fill('');
  await field.pressSequentially('75');
  await page.keyboard.press('Control+z');
  expect((await labels(page)).length).toBe(steps);
  expect((await layer(page, id)).properties.fillOpacity.value).toBeCloseTo(0.4);
  // Other shortcuts never fire while typing (Delete keeps the shape).
  await page.keyboard.press('Delete');
  expect(await layer(page, id)).toBeTruthy();
  await field.press('Escape');
});
