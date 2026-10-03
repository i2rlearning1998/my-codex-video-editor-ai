import type { Page } from '@playwright/test';
import { test, expect, hook, toScreen } from './fixtures';

// J6: Show element timing, Alternative text, Resize canvas to selection.
// The example's subtitle text sits at 76,570 680 × 70.
const labels = async (page: Page) => (await hook(page)).history.labels;
const menu = (page: Page) => page.locator('.canvas-context-menu');
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const clipOf = async (page: Page, layerId: string) =>
  (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.layerId === layerId)!;
async function openMenu(page: Page, x: number, y: number) {
  const at = await toScreen(page, x, y);
  await page.mouse.click(at.x, at.y);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[CV-058] Show element timing opens a popover with start and duration, highlights the clip and edits it in one undo step each', async ({
  page,
}) => {
  await openMenu(page, 200, 600);
  await menu(page).locator('[data-action="show-timing"]').click();
  const popover = page.locator('.element-timing-popover');
  await expect(popover).toBeVisible();
  const clip = page.locator(
    '#timeline-foundation [data-action="clip"][data-id="example-subtitle"]',
  );
  await expect(clip).toHaveClass(/timing-highlight/);
  const before = await clipOf(page, 'example-subtitle');
  const start = popover.locator('#element-timing-start');
  await expect(start).toHaveValue(String(before.startTime));
  await start.fill('1.5');
  await start.press('Enter');
  expect((await clipOf(page, 'example-subtitle')).startTime).toBe(1.5);
  expect((await labels(page)).at(-1)).toBe('Edit timing');
  const duration = popover.locator('#element-timing-duration');
  await duration.fill('4');
  await duration.press('Enter');
  const after = await clipOf(page, 'example-subtitle');
  expect([after.startTime, after.duration]).toEqual([1.5, 4]);
  // Undo reverts the duration only.
  await page.keyboard.press('Control+z');
  expect((await clipOf(page, 'example-subtitle')).duration).toBe(
    before.duration,
  );
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(clip).not.toHaveClass(/timing-highlight/);
});

test('[CV-059] Alternative text is saved per layer with a confirmation and an ALT badge, and shows again when reopened', async ({
  page,
}) => {
  await openMenu(page, 200, 600);
  await menu(page).locator('[data-action="alt-text"]').click();
  const area = page.locator('#alt-text-input');
  await expect(area).toBeFocused();
  await area.fill('A subtitle about shapes');
  await page.locator('[data-action="alt-text-save"]').click();
  await expect(
    page.locator('.toast', { hasText: 'Alternative text saved' }),
  ).toBeVisible();
  const layer = (await scene(page)).layers.find(
    (item) => item.id === 'example-subtitle',
  )!;
  expect(layer.properties.altText!.value).toBe('A subtitle about shapes');
  expect((await labels(page)).at(-1)).toBe('Set alternative text');
  // The scene list (the open Scene panel) shows the badge.
  await expect(
    page.locator('#scene-list [data-layer-id="example-subtitle"] .alt-badge'),
  ).toHaveText('ALT');
  // Reopening shows the saved value; it survives a reload.
  await openMenu(page, 200, 600);
  await menu(page).locator('[data-action="alt-text"]').click();
  await expect(page.locator('#alt-text-input')).toHaveValue(
    'A subtitle about shapes',
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  const reloaded = (await scene(page)).layers.find(
    (item) => item.id === 'example-subtitle',
  )!;
  expect(reloaded.properties.altText!.value).toBe('A subtitle about shapes');
});

test('[CV-060] Resize canvas to selection asks first, gives this scene the selection size in one undo step, keeps the rest visible, and Fit fits the view', async ({
  page,
}) => {
  await openMenu(page, 200, 600);
  await menu(page).locator('[data-action="resize-to-selection"]').click();
  const dialog = page.locator('.modal-dialog');
  await expect(dialog).toContainText('680 × 70');
  // Cancel changes nothing.
  await dialog.locator('[data-role="cancel"]').click();
  expect([(await scene(page)).width, (await scene(page)).height]).toEqual([
    1280, 720,
  ]);
  await openMenu(page, 200, 600);
  await menu(page).locator('[data-action="resize-to-selection"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  let composition = await scene(page);
  expect([composition.width, composition.height]).toEqual([680, 70]);
  expect((await labels(page)).at(-1)).toBe('Resize canvas to selection');
  // The selection now fills the canvas: its layer moved to the origin.
  const subtitle = composition.layers.find(
    (item) => item.id === 'example-subtitle',
  )!;
  expect(subtitle.transform.position.value).toEqual([0, 0]);
  // Zoom in, then Fit: the whole artboard is in view, centred.
  await page.locator('[data-canvas-zoom="in"]').click();
  await page.locator('[data-canvas-zoom="in"]').click();
  await page.locator('[data-canvas-zoom="fit"]').click();
  const view = await page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getCanvas(): { view: number[] } };
        }
      ).__AIVE__.getCanvas().view,
  );
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  const [a, , , d, e, f] = view as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  expect(e).toBeGreaterThanOrEqual(0);
  expect(f).toBeGreaterThanOrEqual(0);
  expect(e + a * 680).toBeLessThanOrEqual(canvas.width + 0.5);
  expect(f + d * 70).toBeLessThanOrEqual(canvas.height + 0.5);
  expect(Math.abs(e - (canvas.width - a * 680) / 2)).toBeLessThan(2);
  // One undo restores the size and every position.
  await page.keyboard.press('Escape');
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  composition = await scene(page);
  expect([composition.width, composition.height]).toEqual([1280, 720]);
  expect(
    composition.layers.find((item) => item.id === 'example-subtitle')!.transform
      .position.value,
  ).toEqual([76, 570]);
});
