import type { Page } from '@playwright/test';
import { test, expect, showCategory, toScreen } from './fixtures';

// S1: Clipchamp-level library panels and menus, measured at 1920 × 1080.
test.use({ viewport: { width: 1920, height: 1080 } });

const LEFT = [
  'Templates',
  'Elements',
  'Text',
  'Media',
  'Scene',
  'Record',
  'Audio',
  'AI',
  'MyTemplates',
  'Theme',
] as const;
const leftOpen = (page: Page) =>
  page.evaluate(
    () =>
      (
        document.querySelector('.library') as HTMLElement
      ).getBoundingClientRect().width > 100,
  );

test.beforeEach(async ({ page }) => {
  // The real right panel, not the legacy reserved column (D-190).
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_RIGHT__?: string }).__AIVE_E2E_RIGHT__ = 'off';
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[S1-001] every panel has one header: the title and exactly one collapse button, which collapses the panel', async ({
  page,
}) => {
  const head = page.locator('.library .panel-head');
  for (const category of LEFT) {
    await showCategory(page, category);
    await expect(head).toHaveCount(1);
    await expect(head.locator('.panel-head-title')).toHaveText(/\S/);
    await expect(head.locator('button')).toHaveCount(1);
    // No Back arrow or Close cross anywhere in the panel's visible headers.
    for (const old of [
      '.shelf-collapse',
      '.browse-close',
      '.browse-header:visible',
      '.theme-title',
    ])
      await expect(page.locator(`.library ${old}`)).toHaveCount(0);
  }
  for (const category of LEFT) {
    await showCategory(page, category);
    await head.locator('button').click();
    await expect.poll(() => leftOpen(page)).toBe(false);
  }
  // The right panel's header is the same component.
  const badge = await toScreen(page, 80, 460);
  await page.mouse.click(badge.x, badge.y);
  await page
    .locator('#rail-right button[data-section]:not([disabled]):visible')
    .first()
    .click();
  const right = page.locator('.inspector .panel-head');
  await expect(right).toHaveCount(1);
  await expect(right.locator('button')).toHaveCount(1);
  await expect(right.locator('.panel-head-title')).toHaveText(/\S/);
  await right.locator('button').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector('.inspector')!.getBoundingClientRect().width,
      ),
    )
    .toBeLessThan(10);
});
