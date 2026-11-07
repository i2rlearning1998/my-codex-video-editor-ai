// P3U: Settings, Brand Kit, Asset Library and Learn in the Aurora Ink style.
import { test, expect } from './fixtures';
import { signUp, setPlan } from './p2-helpers';

test('[P3U-032] Settings has Profile and Preferences cards, Learn cards are numbered, and an empty Asset Library leads to Projects', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/settings');
  await expect(page.locator('.set-card')).toHaveCount(2);
  await expect(page.locator('.set-avatar')).toBeVisible();
  await page.goto('/panel/#/learn');
  await expect(page.locator('.learn-card .learn-num').first()).toHaveText('01');
  await page.goto('/panel/#/assets');
  await page.locator('.assets-empty a[href="#/projects"]').click();
  await expect(page).toHaveURL(/#\/projects/);
});

test('[P3U-033] Brand Kit shows a live preview of the colours and fonts, and a plan without it shows an upgrade teaser', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/brand');
  await expect(page.locator('.brand-teaser')).toBeVisible();
  await expect(page.locator('#brand-upgrade')).toBeVisible();
  await setPlan(page, 'pro');
  await page.goto('/panel/#/brand');
  const title = page.locator('#brand-preview h2');
  await page.locator('[data-color="0"]').fill('#ff0000');
  await expect(title).toHaveCSS('color', 'rgb(255, 0, 0)');
  await page.locator('#brand-heading').selectOption('Poppins');
  await expect(title).toHaveCSS('font-family', /Poppins/);
});
