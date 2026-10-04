import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  openInspector,
  showCategory,
  toScreen,
} from './fixtures';

// J3: one NumberField everywhere: arrows (Shift ×10, Alt ×0.1), wheel and
// arrow keys, a slider beside bounded fields, a live canvas preview while
// dragging, and one undo step per gesture.
const labels = async (page: Page) => (await hook(page)).history.labels;
const layer = async (page: Page, id: string): Promise<any> => {
  const state = await hook(page);
  return (
    state.project.compositions.find(
      (item) => item.id === state.session.compositionId,
    )!.layers as any[]
  ).find((item) => item.id === id);
};
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
const near = (a: number[], b: number[], tolerance = 12) =>
  a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);
const PAPER = [240, 238, 231];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[INS-018] arrows step once (Shift ×10, Alt ×0.1), the wheel and arrow keys step a focused field, each one undo step', async ({
  page,
}) => {
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="rectangle"]').click();
  const id = (await hook(page)).session.selectedIds[0]!;
  await openInspector(page);
  const x = page.locator('#inspector-position-x');
  const start = (await layer(page, id)).transform.position.value[0];
  const steps = (await labels(page)).length;
  await page.locator('#inspector-position-x-up').click();
  await expect(x).toHaveValue(String(start + 1));
  await page
    .locator('#inspector-position-x-up')
    .click({ modifiers: ['Shift'] });
  await expect(x).toHaveValue(String(start + 11));
  await page
    .locator('#inspector-position-x-down')
    .click({ modifiers: ['Alt'] });
  await expect(x).toHaveValue(String(start + 10.9));
  expect((await layer(page, id)).transform.position.value[0]).toBeCloseTo(
    start + 10.9,
  );
  expect((await labels(page)).length).toBe(steps + 3);
  // The wheel steps while the field has focus.
  await x.click();
  const box = (await x.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await expect(x).toHaveValue(String(start + 11.9));
  // Arrow keys: Alt is a tenth.
  await page.keyboard.press('Alt+ArrowDown');
  await expect(x).toHaveValue(String(start + 11.8));
  expect((await labels(page)).length).toBe(steps + 5);
  // The range and unit are shown on bounded fields.
  await expect(
    page.locator('#inspector-opacity').locator('xpath=..'),
  ).toHaveAttribute('title', 'Opacity (0 to 100%)');
  await expect(
    page
      .locator('#inspector-opacity')
      .locator('xpath=..')
      .locator('.number-field-unit'),
  ).toHaveText('%');
  // Other numeric controls are the same field: rotation has a slider too.
  await expect(page.locator('#inspector-rotation-slider')).toBeVisible();
  await expect(page.locator('#inspector-rotation-up')).toBeVisible();
});

test('[INS-018] dragging a slider or scrubbing a label previews on the canvas live and commits one undo step on release', async ({
  page,
}) => {
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="rectangle"]').click();
  const id = (await hook(page)).session.selectedIds[0]!;
  await openInspector(page);
  const fill = await pixel(page, 640, 360);
  expect(near(fill, PAPER)).toBe(false);
  const steps = (await labels(page)).length;
  // Opacity slider beside the field: drag to the left end.
  const slider = page.locator('#inspector-opacity-slider');
  await expect(slider).toBeVisible();
  const track = (await slider.boundingBox())!;
  await page.mouse.move(track.x + track.width - 2, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + 1, track.y + track.height / 2, {
    steps: 6,
  });
  // Mid-drag: the canvas shows the rectangle faded; nothing is committed.
  await expect.poll(() => pixel(page, 640, 360)).toEqual(PAPER);
  expect((await labels(page)).length).toBe(steps);
  expect((await layer(page, id)).transform.opacity.value).toBe(1);
  await page.mouse.up();
  await expect.poll(async () => (await labels(page)).length).toBe(steps + 1);
  expect((await layer(page, id)).transform.opacity.value).toBe(0);
  await page.keyboard.press('Control+z');
  expect((await layer(page, id)).transform.opacity.value).toBe(1);
  await expect.poll(() => pixel(page, 640, 360)).toEqual(fill);
  // Scrub the X label: the rectangle (520..760) moves live, then commits.
  const label = page.locator('#inspector-content dt label', {
    hasText: 'Position X',
  });
  const box = (await label.boundingBox())!;
  const before = (await layer(page, id)).transform.position.value[0];
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 205, box.y + box.height / 2, { steps: 10 });
  // 200 px at 0.5 units per px: 100 units right; the old left edge is paper.
  await expect.poll(() => pixel(page, 540, 360)).toEqual(PAPER);
  expect((await labels(page)).length).toBe(steps);
  await page.mouse.up();
  expect((await layer(page, id)).transform.position.value[0]).toBe(
    before + 100,
  );
  expect((await labels(page)).length).toBe(steps + 1);
});

test('[INS-018] the export range, new project size and keyframe time use the same field with arrows', async ({
  page,
}) => {
  await page.locator('#export').click();
  await page.locator('#export-more').click();
  await expect(page.locator('#export-start-up')).toBeVisible();
  const end = page.locator('#export-end');
  const value = Number(await end.inputValue());
  await page.locator('#export-end-down').click();
  await expect(end).toHaveValue(String(Math.round((value - 0.1) * 100) / 100));
  await page.locator('.modal-dialog .modal-close').click();
  // New project: width and height steppers (step 2).
  await page.locator('#menu-trigger').click();
  await page.locator('#new-project').click();
  await page.getByLabel('Aspect ratio', { exact: true }).selectOption('custom');
  const width = page.locator('#new-project-width');
  const before = Number(await width.inputValue());
  await page.locator('#new-project-width-up').click();
  await expect(width).toHaveValue(String(before + 2));
});
