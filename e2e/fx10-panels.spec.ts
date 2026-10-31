import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

// FX10: panels that showed only part of themselves the first time.
test('[FX10-012] choosing the right rail Animate tab right after selecting an object shows the presets at once, not only "Open 2D animation"', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await page.locator('#rail-right [data-section="Animate"]').click();
  const body = page.locator('#right-section .right-animate-body');
  await expect(body.locator('.animate-card').first()).toBeVisible();
  await expect(body.locator('.animate-tabs')).toBeVisible();
  // Another object: the tab keeps showing presets (and a click on the rail
  // Properties tab and back does too).
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  await expect(body.locator('.animate-card').first()).toBeVisible();
  await page.locator('#rail-right [data-section="Properties"]').click();
  await page.locator('#rail-right [data-section="Animate"]').click();
  await expect(body.locator('.animate-card').first()).toBeVisible();
});
