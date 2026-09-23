import { test, expect } from './fixtures';

// A separate worker/browser process is required: Chrome caches favicon failures
// across isolated page contexts. This reproduces a genuinely fresh profile load.
test.use({ launchOptions: { args: ['--disable-application-cache'] } });

test('[REL-001] fresh page load produces no console errors', async ({
  page,
}) => {
  // No exception: the delivered favicon must load without a console/network error.
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForLoadState('networkidle');
});
