import { test, expect, allowError } from './fixtures';

test('[DEV-001] app loads in a real browser', async ({
  page,
  browser,
}, testInfo) => {
  allowError(
    page,
    (message) => message.includes('404') && message.endsWith('/favicon.ico'),
    'REL-001 is an unfixed baseline bug; its dedicated reproduction keeps the guard enabled without this exception.',
  );
  await page.goto('/');
  await expect(page).toHaveTitle(/AI-Native Video Editor/);
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
    await page.evaluate(() => console.error('Intentional DEV-006 guard probe'));
  },
);
