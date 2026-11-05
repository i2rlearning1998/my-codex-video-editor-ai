// P3U: the Credits & Plan screen: the balance hero, what each plan includes,
// usage against limits, and a checkout where the person picks how to pay.
import { test, expect } from './fixtures';
import { signUp } from './p2-helpers';

const SHOTS = process.env.P3U_SHOTS ?? '';

test('[P3U-015] Credits & Plan shows the balance hero, what each plan includes, usage meters and a checkout with a payment choice', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/credits');
  await expect(page.locator('.credit-big')).toHaveText('60');
  await expect(page.locator('#credit-hero')).toContainText('60 credits');
  // Every plan lists what it includes, from the owner's config.
  for (const card of await page.locator('#plan-cards [data-plan]').all()) {
    await expect(card.locator('.plan-features li').first()).toBeVisible();
    expect(await card.locator('.plan-features li').count()).toBeGreaterThan(3);
  }
  await expect(page.locator('[data-plan="free"] .plan-features')).toContainText(
    'Watermark',
  );
  // Usage rows keep a meter when the plan has a limit.
  await expect(
    page.locator('#usage-table tr', { hasText: 'Projects' }).locator('.meter'),
  ).toHaveCount(1);
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/credits.png`, fullPage: true });
  // The hero button leads to the top-up packs.
  await page.locator('#hero-topup').click();
  await expect(page.locator('#topups')).toBeInViewport();
  // The checkout says what is bought, where the person pays and keeps the card private.
  await page.locator('[data-buy="pack-200"]').click();
  await expect(page.locator('#pay-dialog .pay-summary')).toContainText(
    '200 credits',
  );
  await expect(page.locator('#pay-dialog')).toContainText(
    'never see your card',
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/checkout.png` });
  await page.locator('#pay-confirm').click();
  await expect(page.locator('.credit-big')).toHaveText('260');
});

test('[P3U-016] Credits & Plan fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await page.goto('/panel/#/credits');
  await expect(page.locator('.credit-big')).toBeVisible();
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
  if (SHOTS)
    await page.screenshot({
      path: `${SHOTS}/credits-phone.png`,
      fullPage: true,
    });
});
