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

test('[FIX7-005] a saved scene card opens its assets in the same panel (2 columns, a thumbnail and "Name (Kind)" each, scrolling); a click or a drag adds one asset; the card itself never adds the scene', async ({
  page,
}) => {
  const point = await toScreen(page, 30, 700);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page
    .locator('#canvas-context-menu [data-action="save-scene-to-mine"]')
    .click();
  await showCategory(page, 'MyTemplates');
  // A short window: the view must scroll inside the panel.
  await page.setViewportSize({ width: 1280, height: 720 });
  const before = (await scene(page)).layers.length;
  const scenes = (await hook(page)).project.compositions.length;
  await page.locator('#library-mine .mine-card').click();
  // No dialog, no side panel, nothing added: the view is in the same panel.
  await expect(page.locator('.modal-dialog')).toHaveCount(0);
  await expect(page.locator('.scene-breakdown')).toHaveCount(0);
  const view = page.locator('#library-mine .asset-view');
  await expect(view).toBeVisible();
  expect((await hook(page)).project.compositions).toHaveLength(scenes);
  expect((await scene(page)).layers).toHaveLength(before);
  // The shelf (search, tabs, scene cards) gives way to the view.
  await expect(page.locator('#library-mine .shelf-tabs')).toBeHidden();
  const cards = view.locator('.asset-card');
  await expect(cards).toHaveCount(before);
  // Two columns; every card has its own picture and a "Name (Kind)" label.
  const first = (await cards.nth(0).boundingBox())!;
  const second = (await cards.nth(1).boundingBox())!;
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x + first.width / 2);
  for (let i = 0; i < before; i++) {
    await expect(cards.nth(i).locator('.asset-name')).toHaveText(
      /^.+ \((Shape|Text|Image|Video|Group|Animation|Background|Sticker|Annotation)\)$/,
    );
    await expect(cards.nth(i).locator('canvas')).toHaveCount(1);
  }
  const filled = await cards.locator('canvas').evaluateAll(
    (list) =>
      list.filter((canvas) => {
        const c = canvas as HTMLCanvasElement;
        const data = c
          .getContext('2d')!
          .getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
        return false;
      }).length,
  );
  expect(filled).toBeGreaterThan(before / 2);
  // It scrolls inside the panel: the last card can be reached.
  const body = page.locator('#mine-detail');
  await expect(body).toHaveCSS('overflow-y', 'auto');
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards.last()).toBeInViewport();
  await page.screenshot({ path: 'reports/fix9/mine-assets.png' });
  // A click adds that one asset.
  await cards.first().click();
  expect((await scene(page)).layers).toHaveLength(before + 1);
  // A drag onto the canvas adds it too.
  await cards.nth(1).dragTo(page.locator('#composition-canvas'));
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(before + 2);
  // Back returns to the scene cards.
  await view.locator('[data-action="asset-view-back"]').click();
  await expect(view).toHaveCount(0);
  await expect(page.locator('#library-mine .mine-card')).toBeVisible();
  expect((await hook(page)).project.compositions).toHaveLength(scenes);
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
