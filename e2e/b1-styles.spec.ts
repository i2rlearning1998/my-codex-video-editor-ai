import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';
import { importPack } from './creator-helpers';

// B1: styles (a creative direction for the AI creator) in the AI category.
const read = (name: string) =>
  readFileSync(`examples/creator-packs/${name}`, 'utf8');
const ai = (page: Page) => page.locator('#library-ai');
const styleCard = (page: Page) =>
  ai(page).locator(
    '.shelf-item[data-item-id="style-pack-documentary--style-documentary"]',
  );
const layerCount = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (c) => c.id === state.session.compositionId,
  )!.layers.length;
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[B1-001] a style pack imports into AI › Styles as a card with its palette, icon and name; it is never placed; its "⋯" has Rename, Duplicate, Export, Move to folder, Details and Delete; Export imports again', async ({
  page,
}) => {
  await importPack(page, read('style-documentary.json'));
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
  await showCategory(page, 'AI');
  await expect(ai(page).locator('.shelf-tab[data-tab="style"]')).toHaveText(
    'Styles',
  );
  const card = styleCard(page);
  await expect(card).toContainText('Calm documentary');
  await expect(card.locator('.shelf-thumb img')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml;base64,/,
  );
  // "+" uses the style; neither it nor a click adds anything to the scene.
  const before = await layerCount(page);
  await card.hover();
  await expect(card.locator('.shelf-plus')).toHaveAttribute(
    'title',
    'Use this style',
  );
  await card.locator('.shelf-card').click();
  expect(await layerCount(page)).toBe(before);
  await page.keyboard.press('Escape');
  // The menu.
  await card.hover();
  await card.locator('.shelf-more').click();
  const menu = page.locator('#ai-menu');
  for (const action of [
    'ai-rename',
    'ai-add',
    'ai-duplicate',
    'ai-export',
    'ai-folder',
    'ai-details',
    'ai-delete',
  ])
    await expect(menu.locator(`[data-action="${action}"]`)).toBeVisible();
  await expect(menu.locator('[data-action="ai-add"]')).toHaveText(
    /Use this style/,
  );
  await menu.locator('[data-action="ai-duplicate"]').click();
  await expect(
    ai(page).locator('.shelf-item', { hasText: 'Calm documentary copy' }),
  ).toHaveCount(1);
  // Export: a one-item Creator Pack that AI › Import accepts again.
  await card.hover();
  await card.locator('.shelf-more').click();
  const download = page.waitForEvent('download');
  await menu.locator('[data-action="ai-export"]').click();
  const file = await (await download).path();
  const pack = JSON.parse(readFileSync(file, 'utf8')) as {
    items: { type: string }[];
  };
  expect(pack.items[0]!.type).toBe('style');
  await ai(page).locator('#ai-import').click();
  await page.locator('#ai-import-file').setInputFiles(file);
  await expect(page.locator('#ai-import-summary')).toHaveText(
    /passed the checks/,
    { timeout: 60_000 },
  );
});

test('[B1-001] a style whose kit names an unknown preset is rejected with the reason', async ({
  page,
}) => {
  await showCategory(page, 'AI');
  await ai(page).locator('#ai-import').click();
  await page.locator('#ai-import-source').fill(read('bad-style-kit.json'));
  const row = page.locator('.ai-import-item');
  await expect(row).toHaveAttribute('data-status', 'rejected', {
    timeout: 60_000,
  });
  await expect(row).toContainText('Unknown kit preset boing-boing');
});
