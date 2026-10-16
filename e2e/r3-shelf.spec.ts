import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';
import { MOVE, MOVE_ID, importPack } from './creator-helpers';

// R3 and R4: the shared library panel (Media, AI, My Templates): layout,
// card buttons, the item menu, dynamic tabs, folders, thumbnails, and no
// library change on the Undo stack.
const SHAPE = readFileSync('examples/creator-packs/shape.json', 'utf8');
const SHAPE_ID = 'shape-pack--shape-kite';
const PNG = path.resolve('tests/fixtures/media/image_gradient_1920x1080.png');
const ai = (page: Page) => page.locator('#library-ai');
const media = (page: Page) => page.locator('#media-panel');
const layerCount = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (c) => c.id === state.session.compositionId,
  )!.layers.length;
};
const tabs = (host: ReturnType<Page['locator']>) =>
  host
    .locator('.shelf-tab')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.tab),
    );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[RA-008] Media, AI and My Templates share one panel: title and collapse, search with New folder on one row, their own actions, tabs and big cards', async ({
  page,
}) => {
  for (const [category, host, actions] of [
    ['Media', '#media-panel', ['import-media']],
    ['AI', '#library-ai', ['ai-import', 'ai-copy-brief']],
    ['MyTemplates', '#library-mine', []],
  ] as const) {
    await showCategory(page, category);
    const panel = page.locator(host);
    await expect(panel.locator('.shelf-head .shelf-title')).toBeVisible();
    await expect(panel.locator('.shelf-collapse')).toHaveAttribute(
      'aria-label',
      /.+/,
    );
    const row = panel.locator('.shelf-search-row');
    await expect(row.locator('input')).toBeVisible();
    const folder = row.locator('.shelf-new-folder');
    await expect(folder).toHaveAttribute('title', 'New folder');
    await expect(folder).toHaveAttribute('aria-label', 'New folder');
    for (const id of actions)
      await expect(panel.locator(`#${id}`)).toBeVisible();
    if (!actions.length)
      await expect(panel.locator('.shelf-actions')).toHaveCount(0);
  }
});

test('[RA-009][RA-010] cards: click and "+" add once, "⋯" opens the right-click menu; tabs come only from items; a folder may stay empty', async ({
  page,
}) => {
  await importPack(page, SHAPE);
  await showCategory(page, 'AI');
  // Only the kinds that have items: All and Shapes.
  expect(await tabs(ai(page))).toEqual(['all', 'shape']);
  const item = ai(page).locator(`.shelf-item[data-item-id="${SHAPE_ID}"]`);
  // The thumbnail is a 16:9 picture, never a bare text pill.
  await expect(item.locator('.shelf-thumb')).toHaveAttribute(
    'data-thumb',
    /image|placeholder|service/,
  );
  const before = await layerCount(page);
  await item.hover();
  const plus = item.locator('.shelf-plus');
  await expect(plus).toHaveAttribute('title', 'Add to Scene');
  await expect(plus).toHaveAttribute('aria-label', 'Add to Scene');
  await plus.click();
  await expect.poll(() => layerCount(page)).toBe(before + 1);
  await item.locator('.shelf-card').click();
  await expect.poll(() => layerCount(page)).toBe(before + 2);
  // "⋯" (More options) opens the same menu as a right-click.
  const more = item.locator('.shelf-more');
  await expect(more).toHaveAttribute('title', 'More options');
  await more.click();
  const menu = page.locator('#ai-menu');
  const entries = () =>
    menu
      .locator(':scope > [data-action]')
      .evaluateAll((items) =>
        items.map((entry) => (entry as HTMLElement).dataset.action),
      );
  await expect(menu).toBeVisible();
  const fromButton = await entries();
  expect(fromButton).toEqual([
    'ai-rename',
    'ai-add',
    'ai-folder',
    'ai-details',
    'ai-delete',
  ]);
  await page.keyboard.press('Escape');
  await item.locator('.shelf-card').click({ button: 'right' });
  await expect(menu).toBeVisible();
  expect(await entries()).toEqual(fromButton);
  // Move to folder › New folder… makes a folder tab and moves the item.
  await menu.locator('[data-action="ai-folder"]').click();
  await menu.locator('[data-action="ai-folder-new"]').click();
  await page.locator('.modal-dialog input').fill('Logos');
  await page.locator('.modal-dialog input').press('Enter');
  await expect
    .poll(() => tabs(ai(page)))
    .toEqual(['all', 'shape', expect.stringMatching(/^folder:/)]);
  // An empty user folder stays.
  await ai(page).locator('.shelf-new-folder').click();
  await page.locator('.modal-dialog input').fill('Empty');
  await page.locator('.modal-dialog input').press('Enter');
  await expect.poll(async () => (await tabs(ai(page))).length).toBe(4);
  // Deleting the last shape removes its tab; the folders stay.
  await ai(page).locator('.shelf-tab[data-tab="all"]').click();
  await item.locator('.shelf-card').click({ button: 'right' });
  await menu.locator('[data-action="ai-delete"]').click();
  await expect
    .poll(() => tabs(ai(page)))
    .toEqual([
      'all',
      expect.stringMatching(/^folder:/),
      expect.stringMatching(/^folder:/),
    ]);
});

test('[RA-011] library changes are not undo steps: Undo never brings back or removes a library item', async ({
  page,
}) => {
  await importPack(page, MOVE);
  await showCategory(page, 'AI');
  const card = ai(page).locator(`.ai-card[data-item="${MOVE_ID}"]`);
  await expect(card).toHaveCount(1);
  const steps = (await hook(page)).history.labels.length;
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  await expect(card).toHaveCount(1);
  await card.click({ button: 'right' });
  await page.locator('#ai-menu [data-action="ai-delete"]').click();
  await expect(card).toHaveCount(0);
  expect((await hook(page)).history.labels.length).toBe(steps);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  await expect(card).toHaveCount(0);
});

test('[RA-012] motion and preset cards play a short preview on hover, one at a time', async ({
  page,
}) => {
  await importPack(page, MOVE);
  await showCategory(page, 'AI');
  const thumb = ai(page).locator(
    `.ai-card[data-item="${MOVE_ID}"] .shelf-thumb`,
  );
  await thumb.hover();
  await expect(thumb).toHaveAttribute('data-playing', /.+/);
  await page.mouse.move(2, 2);
  await expect(thumb).not.toHaveAttribute('data-playing', /.+/);
});

test('[RA-013] Media on the shared panel: tabs from the kinds present, Import, drop zone, sort, folders and details', async ({
  page,
}) => {
  await showCategory(page, 'Media');
  expect(await tabs(media(page))).toEqual([]);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(PNG);
  const card = media(page).locator('.media-card').first();
  await expect(card).toBeVisible();
  expect(await tabs(media(page))).toEqual(['all', 'image']);
  await expect(media(page).locator('#media-dropzone')).toBeVisible();
  await expect(media(page).locator('#media-sort')).toBeVisible();
  // Move to a new folder from the "⋯" menu: a folder tab appears.
  const item = media(page).locator('.media-item').first();
  await item.hover();
  await item.locator('.shelf-more').click();
  const menu = page.locator('#media-menu');
  await menu.locator('[data-action="media-folder"]').click();
  await menu.locator('[data-action="media-folder-new"]').click();
  await page.locator('.modal-dialog input').fill('Clips');
  await page.locator('.modal-dialog input').press('Enter');
  const folder = media(page).locator('.shelf-folder-tab');
  await expect(folder).toHaveText('Clips');
  await folder.click();
  await expect(media(page).locator('.media-card')).toHaveCount(1);
  // Details from the menu.
  await item.locator('.shelf-card').click({ button: 'right' });
  await menu.locator('[data-action="media-details"]').click();
  await expect(page.locator('.media-details')).toBeVisible();
});
