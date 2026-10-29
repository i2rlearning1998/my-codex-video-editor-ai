import { test, expect, hook, showCategory } from './fixtures';

// FIX7: the Draw palette is Canva's: a vertical tool rail with a flyout per
// tool (pen gallery with colours, size and transparency; shape tiles; line
// styles; sticky colours; table sizes).
test('[FIX7-010] Draw palette flyouts: pens with colours and transparency, shapes, lines, sticky colours and table sizes place on the canvas', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  const count = async () => {
    const state = await hook(page);
    return state.project.compositions.find(
      (item) => item.id === state.session.compositionId,
    )!.layers.length;
  };
  await showCategory(page, 'Draw');
  const flyout = page.locator('#draw-flyout');
  await expect(flyout.locator('[data-brush]')).toHaveCount(5);
  await expect(flyout.locator('[data-brush="pen"] svg')).toBeVisible();
  await expect(flyout.locator('[data-swatch]').first()).toBeVisible();
  await expect(flyout.getByText('Transparency')).toBeVisible();
  await page.screenshot({ path: 'reports/fix7-draw-pen.png' });
  const palette = page.locator('#draw-palette');
  const before = await count();
  await palette.locator('[data-palette-tool="shape"]').click();
  await expect(flyout.locator('.draw-tile').nth(2)).toBeVisible();
  await page.screenshot({ path: 'reports/fix7-draw-shape.png' });
  await flyout.locator('.draw-tile').nth(2).click();
  await expect.poll(count).toBe(before + 1);
  await palette.locator('[data-palette-tool="line"]').click();
  await expect(flyout.locator('.draw-tile')).toHaveCount(5);
  await flyout.locator('.draw-tile').nth(3).click();
  await expect.poll(count).toBe(before + 2);
  await palette.locator('[data-palette-tool="sticky"]').click();
  await expect(flyout.locator('.draw-tile')).toHaveCount(6);
  await flyout.locator('.draw-tile').nth(3).click();
  await expect.poll(count).toBe(before + 3);
  await palette.locator('[data-palette-tool="table"]').click();
  await expect(flyout.locator('.draw-tile')).toHaveCount(3);
  await page.screenshot({ path: 'reports/fix7-draw-table.png' });
  await flyout.locator('.draw-tile').nth(1).click();
  await expect.poll(count).toBe(before + 4);
});
