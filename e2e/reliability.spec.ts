import { test, expect } from './fixtures';

// A separate worker/browser process is required: Chrome caches favicon failures
// across isolated page contexts. This reproduces a genuinely fresh profile load.
test.use({ launchOptions: { args: ['--disable-application-cache'] } });

test.fail(
  '[REL-001] fresh page load produces no console errors',
  async ({ page }) => {
    // No exception: the global guard must catch the actual favicon 404.
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForLoadState('networkidle');
  },
);
