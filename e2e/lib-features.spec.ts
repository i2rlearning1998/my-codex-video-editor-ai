import { test, expect, hook } from './fixtures';

// Phase 1 library brief, P1-30: one place in the editor shows a plan
// feature as locked (with Upgrade) or hides it. Every feature is on today;
// the e2e page sets the dev/test-only `__AIVE_FEATURES__` to see the looks.
test('[LIB-030] the Export button is normal by default, shows Upgrade and says why when locked, and is gone when hidden', async ({
  page,
}) => {
  await page.goto('/');
  await hook(page);
  const exportButton = page.locator('#export');
  await expect(exportButton).toHaveAttribute('data-feature-state', 'on');
  await expect(exportButton.locator('.feature-upgrade')).toHaveCount(0);

  await page.addInitScript(() => {
    (
      window as { __AIVE_FEATURES__?: Record<string, string> }
    ).__AIVE_FEATURES__ = {
      'export.video': 'locked',
    };
  });
  await page.reload();
  await hook(page);
  await expect(exportButton.locator('.feature-upgrade')).toHaveText('Upgrade');
  await exportButton.click();
  await expect(page.locator('.toast:not(.toast-leaving)')).toContainText(
    'This feature is part of a plan.',
  );
  await expect(page.locator('.modal-dialog')).toHaveCount(0);

  await page.addInitScript(() => {
    (
      window as { __AIVE_FEATURES__?: Record<string, string> }
    ).__AIVE_FEATURES__ = {
      'export.video': 'hidden',
    };
  });
  await page.reload();
  await hook(page);
  await expect(exportButton).toBeHidden();
});
