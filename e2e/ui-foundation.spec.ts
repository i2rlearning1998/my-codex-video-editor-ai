import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// G1: shared UI foundation. Rail categories, number fields, selects, colour
// picker, menus, side panels and focus states.
const ready = async (page: Page) =>
  expect.poll(async () => page.evaluate(() => '__AIVE__' in window)).toBe(true);
/** The visible panels in the left library, by their rail tag. */
const visiblePanels = (page: Page) =>
  page
    .locator('.library [data-rail-panel]:visible')
    .evaluateAll((items) => [
      ...new Set(items.map((item) => (item as HTMLElement).dataset.railPanel)),
    ]);

test('[LAY-002] each rail category shows only its own panel, on first load, after every switch and after a reload', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  // First load: the Scene category, and nothing from Media.
  expect(await visiblePanels(page)).toEqual(['Scene']);
  await expect(page.locator('#asset-search')).toBeHidden();
  await expect(page.locator('#import-media')).toBeHidden();
  const expected: Record<string, string> = {
    Media: 'Media',
    Draw: 'Draw',
    Elements: 'Elements',
    Text: 'placeholder',
    Scene: 'Scene',
  };
  for (const [category, panel] of Object.entries(expected)) {
    await page.locator(`[data-category="${category}"]`).click();
    expect(await visiblePanels(page)).toEqual([panel]);
  }
  // After a reload (the reported bug showed Media and Scene mixed).
  await page.locator('[data-category="Media"]').click();
  await page.reload();
  await ready(page);
  expect(await visiblePanels(page)).toEqual(['Scene']);
  await expect(page.locator('[data-category="Scene"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
