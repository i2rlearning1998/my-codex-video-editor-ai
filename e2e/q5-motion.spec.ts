import { test, expect, menuAction } from './fixtures';

// Q5: with the system asking for reduced motion, Settings › Animations On
// still animates the panels; Off never does; Auto follows the system.
test.use({ reducedMotion: 'reduce' });

const panelDuration = (page: import('@playwright/test').Page) =>
  page
    .locator('.editor-shell')
    .evaluate((shell) =>
      parseFloat(getComputedStyle(shell).transitionDuration),
    );

test('[QT-016] Animations On animates the panels even when the system reduces motion; the row shows the system signal', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'auto');
  // Auto with a reduce-motion system: about 0 (1 ms).
  expect(await panelDuration(page)).toBeLessThan(0.01);
  await menuAction(page, '#open-settings');
  const dialog = page.locator('.modal-dialog');
  await expect(dialog.locator('#motion-system')).toHaveText(
    'System reduce-motion: yes',
  );
  await dialog.locator('[data-motion-value="on"]').click();
  await expect(dialog.locator('[data-motion-value="on"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await expect.poll(() => panelDuration(page)).toBeGreaterThan(0.1);
  // Off reduces again; the choice is kept across a reload.
  await dialog.locator('[data-motion-value="off"]').click();
  await expect.poll(() => panelDuration(page)).toBeLessThan(0.01);
  await dialog.locator('[data-motion-value="on"]').click();
  await dialog.locator('#settings-done').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await expect.poll(() => panelDuration(page)).toBeGreaterThan(0.1);
});

test('[QT-016][RA-020] the shared library panels (Media, AI, My Templates) follow Settings › Animations: their panel slide and card buttons animate with On and not with Off', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  const cardButtons = () =>
    page.evaluate(() => {
      const probe = document.createElement('button');
      probe.className = 'shelf-more';
      document.querySelector('.shelf')!.append(probe);
      const value = parseFloat(getComputedStyle(probe).transitionDuration);
      probe.remove();
      return value;
    });
  const set = async (value: 'on' | 'off') => {
    await menuAction(page, '#open-settings');
    const dialog = page.locator('.modal-dialog');
    await dialog.locator(`[data-motion-value="${value}"]`).click();
    await dialog.locator('#settings-done').click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', value);
  };
  await set('on');
  for (const category of ['Media', 'AI', 'MyTemplates']) {
    await page.locator(`#rail-left [data-category="${category}"]`).click();
    await expect(page.locator('.shelf:visible')).toHaveCount(1);
    expect(await panelDuration(page)).toBeGreaterThan(0.1);
    expect(await cardButtons()).toBeGreaterThan(0.05);
  }
  await set('off');
  for (const category of ['Media', 'AI', 'MyTemplates']) {
    await page.locator(`#rail-left [data-category="${category}"]`).click();
    expect(await panelDuration(page)).toBeLessThan(0.01);
    expect(await cardButtons()).toBeLessThan(0.01);
  }
});
