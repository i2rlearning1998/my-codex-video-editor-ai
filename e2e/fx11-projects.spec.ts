import type { Page } from '@playwright/test';
import { test, expect, menuAction, showCategory, toScreen } from './fixtures';

// FX11: Duplicate project brings the project-wise libraries; saved themes
// are listed in "Import Templates from your Cloud".
async function start(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
}
async function saveTemplate(page: Page) {
  const point = await toScreen(page, 80, 460);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page
    .locator('#canvas-context-menu [data-action="save-to-mine"]')
    .click();
  await page
    .locator('#canvas-context-menu [data-action="save-to-mine-shape"]')
    .click();
}
async function saveTheme(page: Page, name: string) {
  await showCategory(page, 'Theme');
  await page.locator('#library-theme-save-name').fill(name);
  await page.locator('#library-theme-save').click();
  await expect(
    page.locator('[data-group="saved"] .theme-card', { hasText: name }),
  ).toBeVisible();
}

test('[FX11-001] Duplicate project copies its My Templates and saved themes into the copy', async ({
  page,
}) => {
  await start(page);
  await saveTemplate(page);
  await saveTheme(page, 'Copy me');
  await page.waitForTimeout(1500);
  await menuAction(page, '#open-projects');
  const row = page.locator('.project-row').first();
  await row.locator('[data-role="duplicate"]').click();
  await expect(page.locator('.project-row')).toHaveCount(2);
  await page.waitForTimeout(500);
  // Open the copy (the one whose name has the copy word).
  await page
    .locator('.project-row', { hasText: /copy/i })
    .locator('[data-role="open"]')
    .click();
  const confirm = page.locator('.modal-dialog [data-role="confirm"]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await showCategory(page, 'MyTemplates');
  await expect(page.locator('#library-mine .shelf-item')).toHaveCount(1);
  await showCategory(page, 'Theme');
  await expect(
    page.locator('[data-group="saved"] .theme-card', { hasText: 'Copy me' }),
  ).toHaveCount(1);
});

test('[FX11-002] Import Templates from your Cloud lists saved themes of other projects and copies the chosen one', async ({
  page,
}) => {
  await start(page);
  await saveTheme(page, 'Mera blue');
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
  await showCategory(page, 'Theme');
  await expect(
    page.locator('[data-group="saved"] .theme-card', { hasText: 'Mera blue' }),
  ).toHaveCount(0);
  await showCategory(page, 'MyTemplates');
  await page.locator('#mine-import-library').click();
  const dialog = page.locator('.import-dialog');
  const themeRow = dialog.locator('.import-row', { hasText: 'Mera blue' });
  await expect(themeRow).toHaveCount(1);
  await themeRow.locator('input').check();
  await dialog.locator('[data-role="mine-import-confirm"]').click();
  await expect(dialog).toHaveCount(0);
  await showCategory(page, 'Theme');
  await expect(
    page.locator('[data-group="saved"] .theme-card', {
      hasText: /Mera blue/,
    }),
  ).toHaveCount(1);
});
