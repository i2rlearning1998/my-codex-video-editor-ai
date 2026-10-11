import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// H1.5: one source of truth for the side panels. A rail category opens its
// panel; clicking the active category again collapses it; another category
// swaps the content; the top bar's toggles show and change the same state.
// The right side works the same way.
const leftOpen = (page: Page) =>
  page
    .locator('.editor-shell')
    .evaluate((shell) => !shell.classList.contains('library-collapsed'));
const rightOpen = (page: Page) =>
  page
    .locator('.editor-shell')
    .evaluate((shell) => !shell.classList.contains('inspector-collapsed'));
const rail = (page: Page, name: string) =>
  page.locator(`#rail-left [data-category="${name}"]`);
const rightRail = (page: Page, name: string) =>
  page.locator(`#rail-right [data-section="${name}"]`);
const leftToggle = (page: Page) => page.locator('[data-panel="left"]');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[LAY-031] the left rail opens, collapses and swaps its panel, and the top-bar toggle mirrors it', async ({
  page,
}) => {
  expect(await leftOpen(page)).toBe(true);
  await expect(rail(page, 'Scene')).toHaveAttribute('aria-pressed', 'true');
  await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'true');
  // Clicking the active category collapses the panel.
  await rail(page, 'Scene').click();
  await expect.poll(() => leftOpen(page)).toBe(false);
  await expect(rail(page, 'Scene')).toHaveAttribute('aria-pressed', 'false');
  await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'false');
  // Clicking it again reopens it.
  await rail(page, 'Scene').click();
  await expect.poll(() => leftOpen(page)).toBe(true);
  await expect(page.locator('#scene-list')).toBeVisible();
  // Another category swaps the content.
  await rail(page, 'Media').click();
  await expect(page.locator('#media-panel')).toBeVisible();
  await expect(page.locator('#scene-list')).toBeHidden();
  await expect(rail(page, 'Media')).toHaveAttribute('aria-pressed', 'true');
  // The top-bar toggle collapses; a category click reopens (the owner's bug).
  await leftToggle(page).click();
  await expect.poll(() => leftOpen(page)).toBe(false);
  await expect(rail(page, 'Media')).toHaveAttribute('aria-pressed', 'false');
  await rail(page, 'Text').click();
  await expect.poll(() => leftOpen(page)).toBe(true);
  await expect(rail(page, 'Text')).toHaveAttribute('aria-pressed', 'true');
  await expect(leftToggle(page)).toHaveAttribute('aria-expanded', 'true');
  // T-ALL (D-183): the toggle is in the panel's own header; it collapses the
  // panel, and the last category's rail button reopens it.
  await leftToggle(page).click();
  await expect.poll(() => leftOpen(page)).toBe(false);
  await rail(page, 'Text').click();
  await expect.poll(() => leftOpen(page)).toBe(true);
  await expect(rail(page, 'Text')).toHaveAttribute('aria-pressed', 'true');
});

test('[LAY-031] the right rail and the panel collapse button share the same open state', async ({
  page,
}) => {
  // V7 (spec 10.1): a selection only changes the rail; a rail click opens
  // the panel; its collapse button is in its header (no top-bar toggle).
  await expect(page.locator('.inspector')).toBeHidden();
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await expect.poll(() => rightOpen(page)).toBe(false);
  await rightRail(page, 'Properties').click();
  await expect.poll(() => rightOpen(page)).toBe(true);
  const active = page.locator('#rail-right button[aria-pressed="true"]');
  await expect(active).toHaveCount(1);
  const name = (await active.getAttribute('data-section'))!;
  await rightRail(page, name).click();
  await expect.poll(() => rightOpen(page)).toBe(false);
  await expect(
    page.locator('#rail-right button[aria-pressed="true"]'),
  ).toHaveCount(0);
  await rightRail(page, name).click();
  await expect.poll(() => rightOpen(page)).toBe(true);
  await page.locator('#right-panel-collapse').click();
  await expect.poll(() => rightOpen(page)).toBe(false);
  await rightRail(page, name).click();
  await expect.poll(() => rightOpen(page)).toBe(true);
});
