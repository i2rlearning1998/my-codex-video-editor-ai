import { readFileSync } from 'node:fs';
import { test, expect, hook, showCategory } from './fixtures';
import { importPack } from './creator-helpers';

// T1: one-click themes, My themes, the right Theme tab and theme items from
// Creator Packs.
const SUNNY = readFileSync('examples/creator-packs/theme-sunny.json', 'utf8');
const SHAPE = readFileSync('examples/creator-packs/shape.json', 'utf8');
const scene = async (page: import('@playwright/test').Page) =>
  (await hook(page)).project.compositions[0]!;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[QT-017][QT-018][QT-020] apply Dark Neon in one step, undo and redo; save, rename and delete My themes', async ({
  page,
}) => {
  await showCategory(page, 'Theme');
  const panel = page.locator('#library-theme');
  await expect(
    panel.locator('.theme-group[data-group="builtin"] .theme-card'),
  ).toHaveCount(8);
  const before = await scene(page);
  const steps = (await hook(page)).history.labels.length;
  await panel
    .locator('.theme-card[data-theme-id="dark-neon"] .theme-apply')
    .click();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps + 1);
  expect((await hook(page)).history.labels.at(-1)).toBe('Apply theme');
  expect((await scene(page)).backgroundColor).toBe('#0b0b1a');
  await expect(
    panel.locator('.theme-card[data-theme-id="dark-neon"] .theme-apply'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.theme-current')).toHaveText(
    'Current theme: Dark Neon',
  );
  // Undo restores the colours, redo applies them again.
  await page.locator('#undo').click();
  await expect
    .poll(async () => (await scene(page)).backgroundColor)
    .toBe(before.backgroundColor);
  await page.locator('#redo').click();
  await expect
    .poll(async () => (await scene(page)).backgroundColor)
    .toBe('#0b0b1a');
  // My themes: save, rename, delete.
  await panel.locator('#library-theme-save-name').fill('My neon');
  await panel.locator('#library-theme-save').click();
  const mine = panel.locator('.theme-group[data-group="saved"] .theme-card');
  await expect(mine).toHaveCount(1);
  await expect(mine.locator('.theme-name')).toHaveText('My neon');
  await mine.locator('.theme-more').click();
  await page
    .locator('#library-theme-menu [data-action="theme-rename"]')
    .click();
  const field = panel.locator('.theme-rename-field');
  await field.fill('Night drive');
  await field.press('Enter');
  await expect(mine.locator('.theme-name')).toHaveText('Night drive');
  await mine.locator('.theme-more').click();
  await page
    .locator('#library-theme-menu [data-action="theme-delete"]')
    .click();
  await expect(mine).toHaveCount(0);
  // FIX9-006: the right panel has no Theme tab (themes live on the left).
  await page.keyboard.press('Escape');
  await expect(page.locator('#rail-right [data-section="Theme"]')).toBeHidden();
  await expect(page.locator('#right-theme')).toHaveCount(0);
});

test('[QT-021][QT-019] a theme from a Creator Pack applies from the AI category; the project keeps its own copy; an AI shape follows the palette', async ({
  page,
}) => {
  await importPack(page, SUNNY);
  await importPack(page, SHAPE);
  // An AI shape remembers its palette slot (primary).
  await showCategory(page, 'AI');
  await page
    .locator('#library-ai .ai-card[data-item="shape-pack--shape-kite"]')
    .click();
  const shapeId = (await hook(page)).session.selectedIds[0]!;
  const fill = async () =>
    (
      (await scene(page)).layers.find((layer) => layer.id === shapeId)!
        .properties as Record<string, { value: unknown }>
    ).fill!.value;
  await page.keyboard.press('Escape');
  await expect(
    page.locator('#library-ai .ai-group[data-kind="theme"] .ai-card'),
  ).toHaveCount(1);
  // R6: Creator Pack themes are in the AI category, not the Theme panel.
  await showCategory(page, 'Theme');
  await expect(
    page.locator(
      '#library-theme [data-theme-id="theme-pack-sunny--theme-sunny"]',
    ),
  ).toHaveCount(0);
  await showCategory(page, 'AI');
  await page
    .locator(
      '#library-ai .ai-group[data-kind="theme"] .ai-card[data-item="theme-pack-sunny--theme-sunny"]',
    )
    .click();
  await expect
    .poll(async () => (await scene(page)).backgroundColor)
    .toBe('#fffbeb');
  await expect.poll(fill).toBe('#f59e0b');
  // The project keeps a copy of the theme (a reserved marker).
  expect(
    (await scene(page)).markers.some((marker) =>
      marker.label.includes('theme-pack-sunny--theme-sunny'),
    ),
  ).toBe(true);
});
