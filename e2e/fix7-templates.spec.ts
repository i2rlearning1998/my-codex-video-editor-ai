import { test, expect, hook, showCategory, toScreen } from './fixtures';

// FIX7: My Templates scene cards. A click opens the scene breakdown (never
// drops the scene); each part is added on its own; the card shows the whole
// picture; Review & swap lists media files without a rebuild.

const scene = async (page: import('@playwright/test').Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[FIX7-005] a saved scene card opens a breakdown with counts and every part; a part adds on its own; the card never drops the scene', async ({
  page,
}) => {
  const point = await toScreen(page, 30, 700);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page
    .locator('#canvas-context-menu [data-action="save-scene-to-mine"]')
    .click();
  await showCategory(page, 'MyTemplates');
  const before = (await scene(page)).layers.length;
  const scenes = (await hook(page)).project.compositions.length;
  await page.locator('#library-mine .mine-card').click();
  // No dialog, nothing added.
  await expect(page.locator('.modal-dialog')).toHaveCount(0);
  const panel = page.locator('.scene-breakdown');
  await expect(panel).toBeVisible();
  expect((await hook(page)).project.compositions).toHaveLength(scenes);
  expect((await scene(page)).layers).toHaveLength(before);
  // Counts and one row per layer, in their real format.
  await expect(panel.locator('.scene-count')).toHaveCount(4);
  const rows = panel.locator('.scene-part');
  await expect(rows).toHaveCount(before);
  // A part adds on its own (one more layer, the scene untouched otherwise).
  await rows.first().click();
  expect((await scene(page)).layers).toHaveLength(before + 1);
  // The poster is whole (contain), the panel closes with Escape.
  await expect(page.locator('#library-mine .mine-card img')).toHaveCSS(
    'object-fit',
    'contain',
  );
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('[FIX7-006] saving a shape as Text explains the mismatch, recommends Shape, and still saves as Text when asked', async ({
  page,
}) => {
  const menu = page.locator('#timeline-foundation .timeline-menu');
  await page
    .locator('#timeline-foundation .timeline-clip[data-id="example-badge"]')
    .click();
  await expect(async () => {
    await page
      .locator('#timeline-foundation .timeline-clip[data-id="example-badge"]')
      .click({ button: 'right', position: { x: 20, y: 10 } });
    await expect(menu).toBeVisible({ timeout: 1000 });
  }).toPass();
  await menu.locator('[data-action="save-mine"]').click();
  await page
    .locator(
      '.timeline-submenu [data-action="save-mine-kind"][data-kind="text"]',
    )
    .click();
  const dialog = page.locator('.modal-dialog');
  await expect(dialog).toContainText('Shape');
  await expect(
    dialog.locator('[data-action="mine-mismatch-recommended"]'),
  ).toContainText('Shape');
  await dialog.locator('[data-action="mine-mismatch-anyway"]').click();
  await showCategory(page, 'MyTemplates');
  await expect(page.locator('#library-mine .mine-card')).toHaveCount(1);
});
