import type { Page } from '@playwright/test';
import { test, expect, hook, artboard } from './fixtures';

// W2-F3: the Position panel (CV-042), opened from the context toolbar and the
// selection action cluster. Default example, back to front: kicker, headline,
// badge (76,456 224x48), badge text, subtitle, the cards group (2 children),
// edition.
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function clickAt(page: Page, x: number, y: number, shift = false) {
  let board = boards.get(page);
  if (!board) boards.set(page, (board = await artboard(page)));
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(board.x + x * board.scale, board.y + y * board.scale);
  if (shift) await page.keyboard.up('Shift');
}
const panel = (page: Page) => page.locator('#position-panel');
const order = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers.map((layer) => layer.id);
const badge = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers.find(
    (layer) => layer.id === 'example-badge',
  )!;
const row = (page: Page, id: string) =>
  panel(page).locator(`[data-layer-id="${id}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[CV-042] the toolbar Position button opens Arrange (order, align, distribute) and Layers (a front-first list that reorders by drag)', async ({
  page,
}, testInfo) => {
  await clickAt(page, 85, 462);
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['example-badge']);
  const before = await order(page);
  await page.locator('#context-toolbar [data-control="position"]').click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator('[data-tab="arrange"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.screenshot({ path: testInfo.outputPath('arrange.png') });
  // Order: Bring forward swaps the badge with the layer in front of it.
  await panel(page).locator('[data-arrange="forward"]').click();
  expect(await order(page)).toEqual([
    'example-kicker',
    'example-headline',
    'example-badge-text',
    'example-badge',
    'example-subtitle',
    'example-cards',
    'example-edition',
  ]);
  expect((await hook(page)).history.labels.at(-1)).toBe('Bring forward');
  await page.keyboard.press('Control+z');
  expect(await order(page)).toEqual(before);
  // Ctrl+Z keeps the panel open; the undo button, like any click outside it,
  // closes it.
  // Align: a single layer aligns to the canvas.
  await panel(page).locator('[data-align="left"]').click();
  expect((await badge(page)).transform.position.value[0]).toBeCloseTo(0, 3);
  await page.keyboard.press('Control+z');
  // Distribute needs three layers.
  await expect(
    panel(page).locator('[data-distribute="horizontal"]'),
  ).toBeDisabled();
  // Layers: front-first, groups show a folder icon and their item count.
  await panel(page).locator('[data-tab="layers"]').click();
  const rows = panel(page).locator('[data-layer-id]');
  await expect(rows).toHaveCount(7);
  await expect(rows.first()).toHaveAttribute(
    'data-layer-id',
    'example-edition',
  );
  await expect(row(page, 'example-cards')).toContainText('2 items');
  await expect(row(page, 'example-badge')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.screenshot({ path: testInfo.outputPath('layers.png') });
  // A click selects; Shift+click adds.
  await row(page, 'example-subtitle').click({ modifiers: ['Shift'] });
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['example-badge', 'example-subtitle']);
  // Dragging the badge onto the front row brings it to the front, one step.
  await row(page, 'example-badge').dragTo(row(page, 'example-edition'));
  expect((await order(page)).at(-1)).toBe('example-badge');
  expect((await hook(page)).history.labels.at(-1)).toBe('Reorder layer');
  await expect(rows.first()).toHaveAttribute('data-layer-id', 'example-badge');
  await page.keyboard.press('Control+z');
  expect(await order(page)).toEqual(before);
  // Clicking the canvas outside the panel closes it.
  await clickAt(page, 1240, 690);
  await expect(panel(page)).toBeHidden();
});

test('[CV-042] a multi-selection opens the Position panel from the action cluster; align and order act on every layer', async ({
  page,
}) => {
  await clickAt(page, 85, 462);
  await clickAt(page, 400, 600, true);
  await page.locator('#selection-actions [data-action="position"]').click();
  await expect(panel(page)).toBeVisible();
  // Two layers align to their combined box: both right edges meet at 756.
  await panel(page).locator('[data-align="right"]').click();
  expect((await hook(page)).history.labels.at(-1)).toBe('Align layers');
  const layers = (await hook(page)).project.compositions[0]!.layers;
  const right = (id: string) => {
    const layer = layers.find((item) => item.id === id)!;
    return layer.transform.position.value[0]!;
  };
  // Badge 224 wide and subtitle 680 wide share the right edge at 756.
  expect(right('example-badge') + 224).toBeCloseTo(756, 0);
  expect(right('example-subtitle') + 680).toBeCloseTo(756, 0);
  // Order buttons act on both layers at once.
  await panel(page).locator('[data-arrange="back"]').click();
  expect((await order(page)).slice(0, 2)).toEqual([
    'example-badge',
    'example-subtitle',
  ]);
});

test('[LYR-008] the Layers tab shows a distinct type icon for text, shape, group, video, image and audio layers', async ({
  page,
  openFixtureProject,
}) => {
  const icons = async () => {
    await page.locator('#context-toolbar [data-control="position"]').click();
    await panel(page).locator('[data-tab="layers"]').click();
    const rows = await panel(page)
      .locator('[data-layer-id]')
      .evaluateAll((items) =>
        items.map((item) => [
          (item as HTMLElement).dataset.type,
          item.querySelector<HTMLElement>('[data-icon]')?.dataset.icon,
        ]),
      );
    await page.keyboard.press('Escape');
    return Object.fromEntries(rows);
  };
  await clickAt(page, 85, 462);
  const example = await icons();
  expect(example).toEqual({ text: 'text', shape: 'elements', group: 'open' });
  await openFixtureProject('media-example.json');
  // The image layer (the audio layer has no toolbar).
  await page
    .locator('.scene-row[data-layer-id="layer-media-0d2dbf17c7d6f5e7"]')
    .click();
  const media = await icons();
  expect(media).toEqual({ video: 'media', image: 'image', audio: 'audio' });
  // Every type has its own icon.
  expect(
    new Set([...Object.values(example), ...Object.values(media)]).size,
  ).toBe(6);
});
