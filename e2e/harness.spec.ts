import { test, expect } from './fixtures';

test('[DEV-001] app loads in a real browser', async ({
  page,
  browser,
}, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/AI-Native/);
  await expect(page.locator('canvas')).toBeVisible();
  testInfo.annotations.push({
    type: 'browser-version',
    description: browser.version(),
  });
});

test('[DEV-006] guard accepts a clean page', async ({ page }) => {
  await page.setContent('<p>Clean guard probe</p>');
  await expect(page.locator('p')).toHaveText('Clean guard probe');
});

test.fail(
  '[DEV-006] guard fails a test that logs console.error',
  async ({ page }) => {
    await page.setContent('<p>Intentional guard probe</p>');
    // Wait until the browser has reported the error, so the guard has seen it
    // before the test ends (on a slow machine the event can arrive late).
    const reported = page.waitForEvent(
      'console',
      (message) => message.type() === 'error',
    );
    await page.evaluate(() => console.error('Intentional DEV-006 guard probe'));
    await reported;
  },
);
