import { menuAction, test, expect, hook } from './fixtures';
test('[KEY-002] fuzzy palette runs Undo and exposes shortcuts', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.locator('[data-layer-id="example-headline"]').first().click();
  const input = page.getByRole('spinbutton', {
    name: 'Position X',
    exact: true,
  });
  const before = await hook(page);
  await input.fill('321');
  await input.press('Enter');
  await menuAction(page, '#save');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#command-palette')).toBeVisible();
  await page.locator('#command-palette input').fill('udo');
  await expect(page.locator('#palette-results')).toContainText('Ctrl+Z');
  await page.screenshot({ path: testInfo.outputPath('palette.png') });
  await page.keyboard.press('Enter');
  await expect(page.locator('#command-palette')).toBeHidden();
  expect((await hook(page)).project).toEqual(before.project);
  expect((await hook(page)).history.canRedo).toBe(true);
});
