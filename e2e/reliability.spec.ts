import { test, expect } from './fixtures';

// A separate worker/browser process is required: Chrome caches favicon failures
// across isolated page contexts. This reproduces a genuinely fresh profile load.
// Extend (not replace) the configured launch options so a configured fallback
// executablePath (playwright.config.ts) still applies.
test.use({
  launchOptions: [
    async ({ launchOptions }, use) =>
      use({
        ...launchOptions,
        args: [...(launchOptions.args ?? []), '--disable-application-cache'],
      }),
    { scope: 'worker' },
  ],
});

test('[REL-001] fresh page load produces no console errors', async ({
  page,
}) => {
  // No exception: the delivered favicon must load without a console/network error.
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForLoadState('networkidle');
});
