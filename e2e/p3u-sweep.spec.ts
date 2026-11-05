// P3U: every screen of the panel, the website and the admin page opens at a
// laptop and a phone width without sideways scrolling or an error. Set
// P3U_SHOTS to a folder to save a picture of each.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUp, setPlan } from './p2-helpers';

const SHOTS = process.env.P3U_SHOTS ?? '';
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
];
const PANEL = [
  'home',
  'styles',
  'studio',
  'assets',
  'projects',
  'credits',
  'brand',
  'learn',
  'settings',
];
const SITE = ['', 'login', 'signup'];
const ADMIN = ['dashboard', 'users', 'flags', 'settings', 'audit', 'emergency'];

async function fits(page: Page, label: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      { message: `${label} scrolls sideways` },
    )
    .toBeLessThanOrEqual(1);
  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${SHOTS}/${label.replace(/[^a-z0-9]+/gi, '-')}.png`,
    });
  }
}

test('[P3U-034] every panel, website and admin screen opens at 1440 and 390 px without sideways scrolling', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);
  await setPlan(page, 'pro');
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const r of PANEL) {
      await page.goto(`/panel/#/${r}`);
      await expect(page.locator('#app, main').first()).toBeVisible();
      await expect(page.locator('.error-state')).toHaveCount(0);
      await fits(page, `panel-${r}-${size.name}`);
    }
    for (const r of SITE) {
      await page.goto(`/site/#/${r}`);
      await expect(page.locator('body')).toBeVisible();
      await fits(page, `site-${r || 'home'}-${size.name}`);
    }
  }
  await page.goto('/admin/');
  await page.locator('#ad-email').fill('admin@example.test');
  await page.locator('#ad-password').fill('admin-demo');
  await page.locator('#ad-signin').click();
  await expect(page.locator('#ad-outlet')).toBeVisible();
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const r of ADMIN) {
      await page.goto(`/admin/#/${r}`);
      await expect(page.locator('#ad-outlet')).not.toHaveAttribute(
        'aria-busy',
        'true',
      );
      await expect(page.locator('.ad-error')).toHaveCount(0);
      await fits(page, `admin-${r}-${size.name}`);
    }
  }
});

test('[P3U-035] on a phone the bottom navigation fits every item and Studio tools sit two to a row', async ({
  page,
}) => {
  await signUp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/panel/#/home');
  const items = page.locator('.side .nav-item');
  const count = await items.count();
  expect(count).toBeGreaterThan(6);
  const last = await items.nth(count - 1).boundingBox();
  expect(last!.x + last!.width).toBeLessThanOrEqual(390);
  const tools = page.locator('.tools .tool');
  await tools.first().scrollIntoViewIfNeeded();
  const a = await tools.nth(0).boundingBox();
  const b = await tools.nth(1).boundingBox();
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
});
