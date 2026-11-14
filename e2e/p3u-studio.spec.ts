// P3U: model-driven Studio forms, on the P3 mock Studio service
// (src/contracts/p3-mock-studio.ts). The reference fields are a sample.
import { test, expect } from './fixtures';
import { openStudioResults, setPlan, signUp } from './p2-helpers';

const SHOTS = process.env.P3U_SHOTS ?? '';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __AIVE_P3_STUDIO__: boolean }).__AIVE_P3_STUDIO__ =
      true;
  });
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
  await openStudioResults(page, 'images');
  await expect(page.getByText('a lighthouse at dusk').first()).toBeVisible();
});

test('[P3U-010] the form fits a phone: no sideways scroll, the controls and the workspace stack, and tapping targets are at least 32 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/studio/images');
  await expect(page.locator('#studio-controls')).toBeVisible();
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
  const controls = (await page.locator('#studio-controls').boundingBox())!;
  const work = (await page.locator('#studio-work').boundingBox())!;
  expect(work.y).toBeGreaterThanOrEqual(controls.y + controls.height - 1);
  for (const b of await page
    .locator('#studio-model-button, .sf-chips .chip, .sf-card, #studio-run')
    .all())
    // Half a pixel for layout rounding (31.99997 px reads as 32 px).
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(31.5);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/studio-phone.png` });
});
