import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';
import { pickColor } from './controls';

// R6: the Theme panel on the theme library (Codex, src/themes/library.ts):
// manual colours are kept unless overridden, one My themes list, a required
// unique name, Rename and Delete in a "⋯" menu, toasts, never undo steps.
const panel = (page: Page) => page.locator('#library-theme');
const toast = (page: Page, text: string | RegExp) =>
  page.locator('.toast:not(.toast-leaving)', { hasText: text });
interface Layer {
  id: string;
  type: string;
  properties: Record<string, { value: unknown }>;
  children: Layer[];
}
const textFill = async (page: Page) => {
  const state = await hook(page);
  const find = (layers: Layer[]): Layer | undefined => {
    for (const layer of layers) {
      if (layer.type === 'text') return layer;
      const inner = find(layer.children);
      if (inner) return inner;
    }
  };
  const text = find(
    state.project.compositions[0]!.layers as unknown as Layer[],
  )!;
  return { id: text.id, fill: String(text.properties.fill?.value) };
};
const apply = (page: Page, id: string) =>
  panel(page)
    .locator(`.theme-card[data-theme-id="${id}"] .theme-apply`)
    .click();
/** Closes every toast (they sit above menus near the panel's foot). */
async function closeToasts(page: Page) {
  for (const close of await page.locator('.toast .toast-close').all())
    await close.click().catch(() => undefined);
  await expect(page.locator('.toast:not(.toast-leaving)')).toHaveCount(0);
}
const saved = (page: Page) =>
  panel(page).locator('[data-group="saved"] .theme-card');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[RA-017] a text recoloured by hand keeps its colour when another theme is applied, unless Also override manual colors is ticked; the toast says so', async ({
  page,
}) => {
  await showCategory(page, 'Theme');
  const ids = await panel(page)
    .locator('[data-group="builtin"] .theme-card')
    .evaluateAll((cards) =>
      cards.map((card) => (card as HTMLElement).dataset.themeId!),
    );
  await apply(page, ids[0]!);
  const { id } = await textFill(page);
  // Recolour that text by hand (the toolbar's text colour).
  await showCategory(page, 'Scene');
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
  await pickColor(page, 'toolbar-color', '#ff0000');
  await expect
    .poll(async () => (await textFill(page)).fill.toLowerCase())
    .toBe('#ff0000');
  await showCategory(page, 'Theme');
  await apply(page, ids[1]!);
  await expect(toast(page, /manual colours kept/)).toHaveCount(1);
  expect((await textFill(page)).fill.toLowerCase()).toBe('#ff0000');
  // Ticked: the theme changes it too.
  await panel(page).locator('#library-theme-override').check();
  await apply(page, ids[2]!);
  await expect(toast(page, /manual colours overridden/)).toHaveCount(1);
  expect((await textFill(page)).fill.toLowerCase()).not.toBe('#ff0000');
});

test('[RA-018][RA-019] Save current as theme needs a unique name and lists it once in My themes; Undo never adds or removes it; Rename and Delete are in "⋯"; five rounds raise no error', async ({
  page,
}) => {
  await showCategory(page, 'Theme');
  // Only one list of my themes (no second My library list).
  await expect(panel(page).locator('[data-group="library"]')).toHaveCount(0);
  const name = panel(page).locator('#library-theme-save-name');
  const save = panel(page).locator('#library-theme-save');
  await expect(save).toBeDisabled();
  // A built-in name is taken.
  const builtIn = await panel(page)
    .locator('[data-group="builtin"] .theme-name')
    .first()
    .textContent();
  await name.fill(builtIn!);
  await expect(save).toBeDisabled();
  await expect(panel(page).locator('#library-theme-save-message')).toHaveText(
    'Name already used',
  );
  await name.fill('Studio blue');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(toast(page, 'Saved theme Studio blue')).toHaveCount(1);
  await expect(saved(page)).toHaveCount(1);
  for (let i = 0; i < 3; i++) {
    await page.locator('#composition-canvas').focus();
    await page.keyboard.press('Control+z');
  }
  await showCategory(page, 'Theme');
  await expect(saved(page)).toHaveCount(1);
  // Rename from "⋯".
  const more = saved(page).first().locator('.theme-more');
  await expect(more).toHaveAttribute('title', 'More options');
  await more.click();
  await page
    .locator('#library-theme-menu [data-action="theme-rename"]')
    .click();
  const field = panel(page).locator('.theme-rename-field');
  await field.fill('Studio navy');
  await field.press('Enter');
  await expect(saved(page).first()).toContainText('Studio navy');
  // Delete; Undo does not bring it back.
  await saved(page).first().locator('.theme-more').click();
  await page
    .locator('#library-theme-menu [data-action="theme-delete"]')
    .click();
  await expect(saved(page)).toHaveCount(0);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  await showCategory(page, 'Theme');
  await expect(saved(page)).toHaveCount(0);
  // Five rounds of save, rename and delete: no error toast.
  for (let round = 0; round < 5; round++) {
    await name.fill(`Round ${round}`);
    await save.click();
    await expect(saved(page)).toHaveCount(1);
    await closeToasts(page);
    await saved(page).first().locator('.theme-more').click();
    await page
      .locator('#library-theme-menu [data-action="theme-rename"]')
      .click();
    await panel(page).locator('.theme-rename-field').fill(`Round ${round} b`);
    await panel(page).locator('.theme-rename-field').press('Enter');
    await expect(saved(page).first()).toContainText(`Round ${round} b`);
    await closeToasts(page);
    await saved(page).first().locator('.theme-more').click();
    await page
      .locator('#library-theme-menu [data-action="theme-delete"]')
      .click();
    await expect(saved(page)).toHaveCount(0);
  }
  await expect(page.locator('.toast-error')).toHaveCount(0);
  expect((await hook(page)).errors).toEqual([]);
});
