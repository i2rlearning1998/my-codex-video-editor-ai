// P3U: the public website: pricing cards say what each plan includes (from the
// owner's config) and lead to sign-up; the page ends with a call to action.
import { test, expect } from './fixtures';

test('[P3U-026] the website pricing cards list what each plan includes and lead to sign-up, and the page ends with a call to action and a footer', async ({
  page,
}) => {
  await page.goto('/site/#/');
  for (const card of await page.locator('#pricing [data-plan]').all()) {
    await card.scrollIntoViewIfNeeded();
    expect(await card.locator('.plan-features li').count()).toBeGreaterThan(3);
    await expect(card.locator('[data-plan-cta]')).toHaveAttribute(
      'href',
      '#/signup',
    );
  }
  await expect(page.locator('[data-plan="free"] .plan-features')).toContainText(
    'Watermark',
  );
  const cta = page.locator('[data-cta="bottom"]');
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeVisible();
  await expect(page.locator('.site-footer')).toBeVisible();
  await cta.click();
  await expect(page.locator('#auth-form, form').first()).toBeVisible();
  await expect(page).toHaveURL(/#\/signup/);
});

test('[P3U-027] the website pricing and footer read in Hindi and the page does not scroll sideways on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/site/#/');
  await page.locator('#site-lang, [data-lang]').first().click();
  await expect(page.locator('.site-footer')).toContainText('असली');
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
});
