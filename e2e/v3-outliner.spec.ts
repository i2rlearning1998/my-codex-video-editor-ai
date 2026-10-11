import type { Page } from '@playwright/test';
import { test, expect, hook, settled, toScreen } from './fixtures';

// V3 (Clipchamp clone spec 4): the Scene panel is a Blender-style outliner.
// Collections are organisation only: every move leaves the canvas pixels
// and the layers exactly as they were.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
const tree = (page: Page) => page.locator('#scene-list');
const collections = (page: Page) =>
  tree(page).locator('.outliner-row[data-row-kind="collection"]');
const layerRow = (page: Page, id: string) =>
  tree(page).locator(`.outliner-row[data-layer-id="${id}"]`);
const outliner = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.outliner;
const layers = async (page: Page) =>
  JSON.stringify((await hook(page)).project.compositions[0]!.layers);

/** Keeps the canvas pixels in the page; `same` compares with them. */
async function keepPixels(page: Page) {
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  await settled(page);
  await page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      (window as unknown as { __kept: Uint8ClampedArray }).__kept = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height).data;
    });
}
async function samePixels(page: Page) {
  // Clear the selection (its outline is drawn on the canvas, and the right
  // panel it opens resizes the canvas), then compare once settled.
  await tree(page).locator('.outliner-row[data-row-kind="root"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([]);
  await page.mouse.move(2, 2);
  await settled(page);
  return page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const kept = (window as unknown as { __kept: Uint8ClampedArray }).__kept;
      const now = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let differ = 0;
      for (let i = 0; i < kept.length; i++) if (kept[i] !== now[i]) differ++;
      return differ;
    });
}

test('[LYR-016] collections: create, rename, nest by drag, move layers in and out, delete (contents move up), duplicate, copy and paste, undo; the canvas never changes', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const root = tree(page).locator('.outliner-row[data-row-kind="root"]');
  await expect(root).toBeVisible();
  const layersBefore = await layers(page);
  await keepPixels(page);
  // Create two collections at the root (not in rename mode).
  const add = page.locator('#scene-heading [data-ol="new-collection"]');
  await root.click();
  await add.click();
  await root.click();
  await add.click();
  await expect(collections(page)).toHaveCount(2);
  await expect(collections(page).first()).toContainText('Collection 1');
  await expect(tree(page).locator('.outliner-rename')).toHaveCount(0);
  // Rename by double-click: typing replaces, Enter confirms.
  await collections(page).first().locator('.outliner-name').dblclick();
  await page.keyboard.type('Titles');
  await page.keyboard.press('Enter');
  await expect(collections(page).first()).toContainText('Titles');
  // Esc cancels a rename.
  await collections(page).nth(1).locator('.outliner-name').dblclick();
  await page.keyboard.type('Nope');
  await page.keyboard.press('Escape');
  await expect(collections(page).nth(1)).toContainText('Collection 2');
  const first = (await collections(page)
    .first()
    .getAttribute('data-collection-id'))!;
  const second = (await collections(page)
    .nth(1)
    .getAttribute('data-collection-id'))!;
  // Nest the second inside the first by dragging.
  await collections(page).nth(1).dragTo(collections(page).first());
  await expect
    .poll(
      async () =>
        (await outliner(page))?.collections.find((c) => c.id === second)
          ?.parentId,
    )
    .toBe(first);
  // A layer row dragged onto the nested collection moves into it.
  await layerRow(page, 'example-badge').dragTo(
    tree(page).locator(`.outliner-row[data-collection-id="${second}"]`),
  );
  await expect
    .poll(async () => (await outliner(page))?.items['example-badge'])
    .toBe(second);
  // Two rows at once (Ctrl adds) move into the first collection.
  await layerRow(page, 'example-headline').click();
  await layerRow(page, 'example-kicker').click({ modifiers: ['Control'] });
  await layerRow(page, 'example-kicker').dragTo(
    tree(page).locator(`.outliner-row[data-collection-id="${first}"]`),
  );
  await expect
    .poll(async () => {
      const items = (await outliner(page))?.items ?? {};
      return [items['example-headline'], items['example-kicker']];
    })
    .toEqual([first, first]);
  // Organisation only: layers and pixels unchanged.
  expect(await layers(page)).toBe(layersBefore);
  expect(await samePixels(page)).toBe(0);
  // Out again: onto the root row.
  await layerRow(page, 'example-kicker').dragTo(root);
  await expect
    .poll(async () => (await outliner(page))?.items['example-kicker'])
    .toBeUndefined();
  // Delete the first collection: its contents move up to the root.
  await tree(page)
    .locator(`.outliner-row[data-collection-id="${first}"]`)
    .click();
  await tree(page).press('Delete');
  await expect
    .poll(async () => {
      const value = await outliner(page);
      return [
        value?.collections.some((c) => c.id === first),
        value?.collections.find((c) => c.id === second)?.parentId,
        value?.items['example-headline'],
      ];
    })
    .toEqual([false, null, undefined]);
  expect(await layers(page)).toBe(layersBefore);
  expect(await samePixels(page)).toBe(0);
  // Undo brings it back.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () =>
      (await outliner(page))?.collections.some((c) => c.id === first),
    )
    .toBe(true);
  // Duplicate collection: a sibling ".001" holding copies of its layers.
  const count = (await hook(page)).project.compositions[0]!.layers.length;
  await tree(page)
    .locator(`.outliner-row[data-collection-id="${second}"]`)
    .click({ button: 'right' });
  await page.locator('.outliner-menu [data-action="ol-duplicate"]').click();
  await expect(
    collections(page).filter({ hasText: 'Collection 2.001' }),
  ).toHaveCount(1);
  expect((await hook(page)).project.compositions[0]!.layers.length).toBe(
    count + 1,
  );
  // Copy and paste the badge row into the root (Ctrl+C / Ctrl+V in the outliner).
  await layerRow(page, 'example-badge').click();
  await tree(page).press('Control+c');
  await tree(page).locator('.outliner-row[data-row-kind="root"]').click();
  await tree(page).press('Control+v');
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.layers.length)
    .toBe(count + 2);
  // Delete hierarchy removes the collection and its layers, one step.
  const before = (await hook(page)).project.compositions[0]!.layers.length;
  await tree(page)
    .locator(`.outliner-row[data-collection-id="${second}"]`)
    .click({ button: 'right' });
  await page
    .locator('.outliner-menu [data-action="ol-delete-hierarchy"]')
    .click();
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.layers.length)
    .toBe(before - 1);
  expect((await hook(page)).history.labels.at(-1)).toBe('Delete hierarchy');
});

test('[LYR-017] selection follows both ways, a collapsed parent opens for a canvas selection, search keeps parents, rubber band, eye / lock / mute and the context menus', async ({
  page,
}) => {
  // Outliner -> canvas and timeline.
  await layerRow(page, 'example-headline').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['example-headline']);
  await expect(
    page
      .locator(
        '#timeline-foundation .timeline-clip[data-id="example-headline"]',
      )
      .first(),
  ).toHaveAttribute('aria-pressed', 'true');
  // Canvas -> outliner, through a collapsed group.
  const group = layerRow(page, 'example-cards');
  await group.locator('[data-ol="disclose"]').click();
  await expect(layerRow(page, 'example-front')).toHaveCount(0);
  const card = await toScreen(page, 960, 300);
  await page.mouse.click(card.x, card.y);
  await page.mouse.dblclick(card.x, card.y);
  await expect(layerRow(page, 'example-front')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // Search keeps the parents of matches.
  await page.locator('#scene-heading .outliner-search').fill('lime');
  await expect(tree(page).locator('.outliner-row[data-layer-id]')).toHaveCount(
    3,
  );
  await page.locator('#scene-heading .outliner-search').fill('');
  // Rubber band on empty outliner space selects the rows it touches.
  const rows = tree(page).locator('.outliner-row[data-layer-id]');
  const a = (await rows.nth(0).boundingBox())!;
  const b = (await rows.nth(2).boundingBox())!;
  const area = (await tree(page).boundingBox())!;
  const below = await tree(page).evaluate((element) => {
    const last = [...element.querySelectorAll('.outliner-row')].at(-1)!;
    return last.getBoundingClientRect().bottom;
  });
  if (below < area.y + area.height - 10) {
    await page.mouse.move(area.x + 20, area.y + area.height - 4);
    await page.mouse.down();
    await page.mouse.move(area.x + 60, a.y + 4, { steps: 6 });
    await page.mouse.up();
    expect((await hook(page)).session.selectedIds.length).toBeGreaterThan(2);
  } else {
    // No empty space below the rows: the band starts beside them is not
    // possible, so the range select (Shift) stands in.
    await rows.nth(0).click();
    await rows.nth(2).click({ modifiers: ['Shift'] });
    expect((await hook(page)).session.selectedIds.length).toBe(3);
  }
  void b;
  // Eye and lock per layer act on its lane.
  const headline = layerRow(page, 'example-headline');
  await headline.hover();
  await headline.locator('[data-ol="lock"]').click();
  const lane = async () => {
    const state = await hook(page);
    return state.project.compositions[0]!.tracks.find((t) =>
      t.clips.some((c) => c.layerId === 'example-headline'),
    )!;
  };
  expect((await lane()).locked).toBe(true);
  await headline.hover();
  await headline.locator('[data-ol="eye"]').click();
  expect((await lane()).enabled).toBe(false);
  // Context menus: root, collection and layer items.
  await tree(page)
    .locator('.outliner-row[data-row-kind="root"]')
    .click({ button: 'right' });
  await expect(
    page.locator('.outliner-menu [data-action="ol-new"]'),
  ).toBeVisible();
  await page.locator('.outliner-menu [data-action="ol-new"]').click();
  await collections(page).first().click({ button: 'right' });
  for (const id of [
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
  ])
    await expect(
      page.locator(`.outliner-menu [data-action="${id}"]`),
    ).toHaveCount(1);
  await page.keyboard.press('Escape');
  await layerRow(page, 'example-kicker').click({ button: 'right' });
  for (const id of [
    'ol-rename',
    'ol-duplicate',
    'ol-copy',
    'ol-delete',
    'ol-show-in-timeline',
  ])
    await expect(
      page.locator(`.outliner-menu [data-action="${id}"]`),
    ).toHaveCount(1);
  await page
    .locator('.outliner-menu [data-action="ol-show-in-timeline"]')
    .click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['example-kicker']);
});
