import type { Page } from '@playwright/test';
import { test, expect, hook, settled } from './fixtures';

// V7 (Clipchamp clone spec 10.4): the Scene outliner's vertical menus,
// themed 32 px rows, Duplicate collection that keeps the tree, Delete that
// keeps the layers, and rename three ways.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
const tree = (page: Page) => page.locator('#scene-list');
const root = (page: Page) =>
  tree(page).locator('.outliner-row[data-row-kind="root"]');
const collections = (page: Page) =>
  tree(page).locator('.outliner-row[data-row-kind="collection"]');
const collection = (page: Page, id: string) =>
  tree(page).locator(`.outliner-row[data-collection-id="${id}"]`);
const layerRow = (page: Page, id: string) =>
  tree(page).locator(`.outliner-row[data-layer-id="${id}"]`);
const scene = async (page: Page) => (await hook(page)).project.compositions[0]!;
const menu = (page: Page) => page.locator('.outliner-menu');

/** Collection 1 holding headline, kicker and Collection 2 (badge). */
async function nested(page: Page) {
  const add = page.locator('#scene-heading [data-ol="new-collection"]');
  await root(page).click();
  await add.click();
  await root(page).click();
  await add.click();
  const a = (await collections(page)
    .first()
    .getAttribute('data-collection-id'))!;
  const b = (await collections(page)
    .nth(1)
    .getAttribute('data-collection-id'))!;
  await collections(page).nth(1).dragTo(collections(page).first());
  await layerRow(page, 'example-badge').dragTo(collection(page, b));
  await layerRow(page, 'example-headline').click();
  await layerRow(page, 'example-kicker').click({ modifiers: ['Control'] });
  await layerRow(page, 'example-kicker').dragTo(collection(page, a));
  await expect
    .poll(async () => (await scene(page)).outliner?.items['example-kicker'])
    .toBe(a);
  return { a, b };
}
async function pixels(page: Page) {
  await root(page).click();
  await page.mouse.move(2, 2);
  await settled(page);
  return page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement) =>
      Array.from(
        canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height)
          .data.filter((_, index) => index % 97 === 0),
      ).join(','),
    );
}

test('[LYR-018] outliner menus are the shared vertical list (200 to 240 px, 32 px rows, icons, shortcuts) below the clicked row; Shift+F10 opens them, Escape closes; rows are 32 px with 18 px icons', async ({
  page,
}) => {
  const { a } = await nested(page);
  // Rows: 32 px, and the hovered row keeps its height.
  const row = layerRow(page, 'example-subtitle');
  expect(Math.round((await row.boundingBox())!.height)).toBe(32);
  await row.hover();
  expect(Math.round((await row.boundingBox())!.height)).toBe(32);
  const icon = (await row.locator('.outliner-icon svg').boundingBox())!;
  expect(Math.round(icon.width)).toBe(18);
  // The root is a header with a count pill.
  await expect(root(page).locator('.outliner-count')).toHaveText(
    String((await scene(page)).layers.length),
  );
  // A collection's menu: a vertical list in the spec's order.
  const target = collection(page, a);
  const rowBox = (await target.boundingBox())!;
  await target.click({ button: 'right', position: { x: 40, y: 16 } });
  await expect(menu(page)).toBeVisible();
  const items = menu(page).locator(':scope > button');
  expect(
    await items.evaluateAll((list) =>
      list.map((item) => (item as HTMLElement).dataset.action),
    ),
  ).toEqual([
    'ol-new',
    'ol-duplicate',
    'ol-copy',
    'ol-paste',
    'ol-delete',
    'ol-delete-hierarchy',
    'ol-select',
    'ol-deselect',
    'ol-visibility',
    'ol-lock-all',
    'ol-unlock-all',
  ]);
  const boxes = await items.evaluateAll((list) =>
    list.map((item) => {
      const box = item.getBoundingClientRect();
      return { x: box.x, y: box.y, height: box.height };
    }),
  );
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.x).toBeCloseTo(boxes[0]!.x, 0);
    expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y);
  }
  for (const box of boxes) expect(Math.round(box.height)).toBe(32);
  const menuBox = (await menu(page).boundingBox())!;
  expect(menuBox.width).toBeGreaterThanOrEqual(200);
  expect(menuBox.width).toBeLessThanOrEqual(240);
  // It never covers the clicked row's name.
  expect(
    menuBox.y >= rowBox.y + rowBox.height - 1 ||
      menuBox.y + menuBox.height <= rowBox.y + 1,
  ).toBe(true);
  // Icons and shortcuts.
  await expect(menu(page).locator('[data-action="ol-copy"] kbd')).toContainText(
    'C',
  );
  await expect(menu(page).locator('[data-action="ol-copy"] svg')).toHaveCount(
    1,
  );
  // Visibility opens the same vertical list beside it.
  await menu(page).locator('[data-action="ol-visibility"]').hover();
  await expect(page.locator('[data-action="ol-hide-all"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  // From the keyboard: Shift+F10 on a layer row.
  await layerRow(page, 'example-subtitle').click();
  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  expect(
    await menu(page)
      .locator(':scope > button')
      .evaluateAll((list) =>
        list.map((item) => (item as HTMLElement).dataset.action),
      ),
  ).toEqual([
    'ol-rename',
    'ol-duplicate',
    'ol-copy',
    'ol-delete',
    'ol-show-in-timeline',
  ]);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
});

test('[LYR-018] Duplicate collection copies the tree: Collection 1.001 holds the copies and Collection 2.001 with the badge copy; Delete keeps the layers, clips and pixels; rename by F2, double-click and the menu', async ({
  page,
}) => {
  const { a, b } = await nested(page);
  const count = (await scene(page)).layers.length;
  await collection(page, a).click({ button: 'right' });
  await menu(page).locator('[data-action="ol-duplicate"]').click();
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(count + 3);
  const outliner = (await scene(page)).outliner!;
  const copyA = outliner.collections.find(
    (item) => item.name === 'Collection 1.001',
  )!;
  const copyB = outliner.collections.find(
    (item) => item.name === 'Collection 2.001',
  )!;
  expect(copyA.parentId).toBeNull();
  expect(copyB.parentId).toBe(copyA.id);
  const layers = (await scene(page)).layers;
  const nameOf = (id: string) => layers.find((layer) => layer.id === id)?.name;
  const inside = (id: string) =>
    Object.entries(outliner.items)
      .filter(([, owner]) => owner === id)
      .map(([layer]) => nameOf(layer))
      .sort();
  expect(inside(copyA.id)).toEqual(['Main headline', 'Studio note']);
  expect(inside(copyB.id)).toEqual(['Accent label']);
  // The originals are where they were.
  expect(inside(a)).toEqual(['Main headline', 'Studio note']);
  expect(inside(b)).toEqual(['Accent label']);
  // The tree shows it nested: Collection 2.001 is one level under 1.001.
  const depth = (id: string) =>
    collection(page, id).evaluate((row) =>
      Number((row as HTMLElement).style.getPropertyValue('--depth')),
    );
  expect(await depth(copyB.id)).toBe((await depth(copyA.id)) + 1);
  // Undo, then plain Delete of Collection 1: its layers move up, nothing
  // else changes.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await scene(page)).layers.length).toBe(count);
  const before = await pixels(page);
  const layersBefore = JSON.stringify((await scene(page)).layers);
  const tracksBefore = JSON.stringify((await scene(page)).tracks);
  await collection(page, a).click({ button: 'right' });
  await menu(page).locator('[data-action="ol-delete"]').click();
  await expect
    .poll(async () =>
      (await scene(page)).outliner?.collections.some((item) => item.id === a),
    )
    .toBe(false);
  const after = (await scene(page)).outliner!;
  expect(after.items['example-headline']).toBeUndefined();
  expect(after.collections.find((item) => item.id === b)?.parentId).toBeNull();
  expect(after.items['example-badge']).toBe(b);
  expect(JSON.stringify((await scene(page)).layers)).toBe(layersBefore);
  expect(JSON.stringify((await scene(page)).tracks)).toBe(tracksBefore);
  expect(await pixels(page)).toBe(before);
  // Rename: F2, double-click and the menu.
  await collection(page, b).click();
  await page.keyboard.press('F2');
  await page.keyboard.type('By key');
  await page.keyboard.press('Enter');
  await expect(collection(page, b)).toContainText('By key');
  await collection(page, b).locator('.outliner-name').dblclick();
  await page.keyboard.type('By mouse');
  await page.keyboard.press('Enter');
  await expect(collection(page, b)).toContainText('By mouse');
  await layerRow(page, 'example-subtitle').click({ button: 'right' });
  await menu(page).locator('[data-action="ol-rename"]').click();
  await page.keyboard.type('Renamed line');
  await page.keyboard.press('Enter');
  await expect
    .poll(
      async () =>
        (await scene(page)).layers.find(
          (layer) => layer.id === 'example-subtitle',
        )?.name,
    )
    .toBe('Renamed line');
});
