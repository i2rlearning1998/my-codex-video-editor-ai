import type { Page } from '@playwright/test';
import { test, expect, showCategory } from './fixtures';
import { mockStock, GOOD_KEY } from './stock-mock';

// MED-032: category and colour filters on stock photos and videos.
const elements = (page: Page) => page.locator('#library-elements');
const panel = (page: Page) => elements(page).locator('.stock-panel');
const openTile = async (page: Page, tile: string) => {
  await showCategory(page, 'Elements');
  const back = elements(page).locator('[data-action="browse-back"]');
  while (await back.isVisible()) await back.click();
  await elements(page).locator(`[data-tile="${tile}"]`).click();
  await elements(page).locator('.browse-chip[data-chip="stock"]').click();
};

test('[MED-032] stock photos can be filtered by category and colour, and only the filters a provider supports are shown', async ({
  page,
}) => {
  const mock = await mockStock(page);
  await page.addInitScript(
    ([key]) => {
      for (const provider of ['pixabay', 'pexels'])
        localStorage.setItem(
          `aive.provider-key.${provider}.apiKey`,
          JSON.stringify(key),
        );
    },
    [GOOD_KEY] as const,
  );
  await page.goto('/');
  await openTile(page, 'photos');
  await expect(panel(page).locator('.stock-item').first()).toBeVisible();
  const lastUrl = () => new URL(mock.requests.at(-1)!);
  await panel(page).locator('select.stock-category').selectOption('nature');
  await expect
    .poll(() => lastUrl().searchParams.get('category'))
    .toBe('nature');
  await panel(page).locator('select.stock-color').selectOption('blue');
  await expect.poll(() => lastUrl().searchParams.get('colors')).toBe('blue');
  await expect(panel(page).locator('.stock-item').first()).toBeVisible();
  await page.screenshot({ path: 'reports/fix8-stock-filters.png' });
  // Pexels has colours for photos but no categories.
  await panel(page)
    .locator('.stock-providers [data-provider="pexels"]')
    .click();
  await expect(panel(page).locator('select.stock-category')).toHaveCount(0);
  await panel(page).locator('select.stock-color').selectOption('red');
  await expect.poll(() => lastUrl().searchParams.get('color')).toBe('red');
  // Videos: Pixabay has categories only.
  await openTile(page, 'videos');
  await expect(panel(page).locator('select.stock-color')).toHaveCount(0);
});
