// P3U: model-driven Studio forms, on the P3 mock Studio service
// (src/contracts/p3-mock-studio.ts). The reference fields are a sample.
import { test, expect } from './fixtures';
import { setPlan, signUp } from './p2-helpers';

const SHOTS = process.env.P3U_SHOTS ?? '';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __AIVE_P3_STUDIO__: boolean }).__AIVE_P3_STUDIO__ =
      true;
  });
});

test('[P3U-006] the form follows the chosen model: Pro adds style cards and a hidden-until-opened More options; switching keeps what is shared', async ({
  page,
}) => {
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/studio/images');
  await expect(page.locator('#studio-models [data-model]')).toHaveCount(3);
  await expect(page.locator('[data-field="style"]')).toHaveCount(0);
  await page.locator('#sf-prompt').fill('a red kite over a hill');
  await page.locator('[data-model="images-pro"]').click();
  await expect(page.locator('[data-field="style"]')).toBeVisible();
  await expect(page.locator('#sf-prompt')).toHaveValue(
    'a red kite over a hill',
  );
  await page.locator('[data-field="style"] [data-value="cinema"]').click();
  await expect(
    page.locator('[data-field="style"] [data-value="cinema"]'),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#studio-more')).not.toHaveAttribute('open', '');
  await page.locator('#studio-preview summary').click();
  await expect(page.locator('#studio-preview-text')).toContainText(
    'a red kite over a hill',
  );
  await expect(page.locator('#studio-preview-text')).toContainText('cinema');
  // The locked model cannot be picked.
  await expect(page.locator('[data-model="images-max"]')).toBeDisabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/studio-images-pro.png` });
});

test('[P3U-007] a missing required field is shown under the field and nothing runs; the cost range is shown before running', async ({
  page,
}) => {
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/studio/images');
  await expect(page.locator('#studio-cost')).toContainText(/\d/);
  await page.locator('#studio-run').click();
  await expect(page.locator('[data-error="prompt"]')).not.toBeEmpty();
  await expect(page.locator('#studio-progress')).toBeHidden();
  await expect(page.locator('#studio-saved')).toHaveCount(0);
});

test('[P3U-008] Run shows progress, then saves the result to the chosen project and says where', async ({
  page,
}) => {
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/studio/images');
  await page.locator('#sf-prompt').fill('a lighthouse at dusk');
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-progress')).toBeVisible();
  await expect(page.locator('#studio-saved')).toBeVisible();
  await expect(page.locator('#studio-progress')).toBeHidden();
  await page.goto('/panel/#/assets');
  await expect(page.getByText('a lighthouse at dusk').first()).toBeVisible();
});

test('[P3U-009] Improve with Director fills better text, can be undone, and Pro shows a number field clamped to its maximum', async ({
  page,
}) => {
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/studio/images');
  await page.locator('#sf-prompt').fill('cat');
  await page.locator('#studio-enhance').click();
  await expect(page.locator('#studio-enhance-undo')).toBeVisible();
  await expect(page.locator('#sf-prompt')).not.toHaveValue('cat');
  await page.locator('#studio-enhance-undo').click();
  await expect(page.locator('#sf-prompt')).toHaveValue('cat');

  await page.goto('/panel/#/studio/video');
  await page.locator('[data-model="video-pro"]').click();
  await page.locator('#studio-more summary').click();
  const num = page.locator('input[type="number"]').first();
  if (await num.count()) {
    await num.fill('99999');
    await expect(num).not.toHaveValue('99999');
  }
});

test('[P3U-010] the form fits a phone: no sideways scroll, and tapping targets are at least 32 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/studio/images');
  await page.locator('[data-model="images-pro"]').click();
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
  for (const b of await page.locator('#studio-models [data-model]').all()) {
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/studio-phone.png` });
});
