import { test, expect, allowError } from './fixtures';

test('[LOC-002][LOC-003][LOC-004] browser default, live language switch and persisted choice', async ({
  page,
  browser,
}, testInfo) => {
  allowError(
    page,
    (message) => message.includes('404') && message.endsWith('/favicon.ico'),
    'Known REL-001 favicon bug is outside this brief.',
  );
  await page.goto('/');
  await expect(page.locator('#save')).toHaveText('Save locally');
  await page.locator('#language-toggle').click();
  await expect(page.locator('#save')).toHaveText('स्थानीय रूप से सहेजें');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.reload();
  await expect(page.locator('#save')).toHaveText('स्थानीय रूप से सहेजें');
  await page.screenshot({ path: testInfo.outputPath('hindi.png') });
  await page.locator('#language-toggle').click();
  await expect(page.locator('#save')).toHaveText('Save locally');
  for (const [locale, expected] of [
    ['hi-IN', 'hi'],
    ['fr-FR', 'en'],
  ]) {
    const context = await browser.newContext({ locale: locale! });
    const localized = await context.newPage();
    const errors: string[] = [];
    localized.on('pageerror', (error) => errors.push(error.message));
    localized.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !message.location().url.endsWith('/favicon.ico')
      )
        errors.push(message.text());
    });
    await localized.goto('http://127.0.0.1:4173/');
    await expect(localized.locator('html')).toHaveAttribute('lang', expected!);
    expect(errors).toEqual([]);
    await context.close();
  }
});
