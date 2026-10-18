import { test, expect, menuAction } from './fixtures';
import { mockStock, GOOD_KEY } from './stock-mock';

test.use({ viewport: { width: 1920, height: 1080 } });

// FINAL2 U1: Settings › Stock & API keys (save, test, clear with a mocked
// provider) and Appearance › Accent colour (kept per theme).
test('[F2-001] Settings keys: save masks the key, Test says Working or Key not valid, Clear removes it; Iconify needs no key; offline engines show their status', async ({
  page,
}) => {
  await mockStock(page);
  await page.goto('/');
  await menuAction(page, '#open-settings');
  const dialog = page.locator('.modal-dialog');
  await dialog.locator('[data-settings-tab="keys"]').click();
  await expect(
    dialog.getByText('Keys stay in this browser.', { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.locator('.key-block[data-provider="iconify"] .key-state'),
  ).toHaveText('No key needed');
  const pexels = dialog.locator('.key-block[data-provider="pexels"]');
  await expect(pexels.locator('.key-state')).toHaveText('Not set');
  // A wrong key: Test reports it in plain words.
  await pexels.locator('.key-input').fill('wrong-key-0000');
  await pexels.locator('[data-key-action="test"]').click();
  await expect(pexels.locator('.key-result')).toHaveText(/Key not valid/);
  // The right key: saved, masked, Working.
  await pexels.locator('.key-input').fill(GOOD_KEY);
  await pexels.locator('[data-key-action="save"]').click();
  await expect(pexels.locator('.key-state')).toHaveText('Saved');
  await expect(pexels.locator('.key-input')).toHaveValue('');
  await expect(pexels.locator('.key-input')).toHaveAttribute(
    'placeholder',
    '••••••••1234',
  );
  await pexels.locator('[data-key-action="test"]').click();
  await expect(pexels.locator('.key-result')).toHaveText('Working');
  // Kept in this browser, never in the project.
  expect(
    await page.evaluate(() =>
      localStorage.getItem('aive.provider-key.pexels.apiKey'),
    ),
  ).toBe(JSON.stringify(GOOD_KEY));
  await pexels.locator('[data-key-action="clear"]').click();
  await expect(pexels.locator('.key-state')).toHaveText('Not set');
  // Offline engines.
  await dialog.locator('[data-settings-tab="offline"]').click();
  await expect(
    dialog.locator('[data-engine="local-tts"] .settings-note'),
  ).toContainText('cloud voice');
  await page.screenshot({ path: 'reports/final-ui/u1-settings-offline.png' });
});

test('[F2-002] Accent colour: a light and a dark choice are kept separately, follow the theme switch and survive a reload; purple keeps the default tokens', async ({
  page,
}) => {
  await page.goto('/');
  const accent = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim(),
    );
  expect(await accent()).toBe('#7c5cff');
  await menuAction(page, '#open-settings');
  const dialog = page.locator('.modal-dialog');
  await dialog.locator('[data-settings-tab="appearance"]').click();
  await dialog
    .locator('[data-accent-mode="dark"][data-accent-id="teal"]')
    .click();
  await dialog
    .locator('[data-accent-mode="light"][data-accent-id="pink"]')
    .click();
  await expect.poll(accent).toBe('#2dd4bf');
  await page.screenshot({ path: 'reports/final-ui/u1-settings-accent.png' });
  await dialog.locator('#settings-done').click();
  await page.evaluate(() => {
    localStorage.setItem('aive.theme', 'light');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(accent).not.toBe('#2dd4bf');
  expect(await page.locator('html').getAttribute('data-accent')).toBe('pink');
  await page.evaluate(() => localStorage.setItem('aive.theme', 'dark'));
  await page.reload();
  await expect.poll(accent).toBe('#2dd4bf');
});
