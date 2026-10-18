import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';
import { mockStock, GOOD_KEY } from './stock-mock';

// FINAL2 U2: Elements › Photos, Videos, Icons, Stickers and Audio search
// the stock providers (mocked here: no live network).
test.use({ viewport: { width: 1920, height: 1080 } });

const elements = (page: Page) => page.locator('#library-elements');
const openTile = async (page: Page, tile: string) => {
  await showCategory(page, 'Elements');
  await elements(page).locator(`[data-tile="${tile}"]`).click();
};
const assets = async (page: Page) =>
  (await hook(page)).project.assets as unknown as {
    id: string;
    type: string;
    metadata: Record<string, unknown>;
  }[];

test('[F2-003] Photos: search, add to the scene with its credit in Media, Pexels attribution, drag to the timeline; Charts and Frames stay disabled', async ({
  page,
}) => {
  const mock = await mockStock(page);
  await page.addInitScript((key) => {
    localStorage.setItem(
      'aive.provider-key.pexels.apiKey',
      JSON.stringify(key),
    );
  }, GOOD_KEY);
  await page.goto('/');
  await showCategory(page, 'Elements');
  for (const tile of ['charts', 'frames', 'grids', '3d', 'animations'])
    await expect(
      elements(page).locator(`[data-tile="${tile}"]`),
    ).toBeDisabled();
  await openTile(page, 'photos');
  const panel = elements(page).locator('.stock-panel');
  await expect(panel.locator('.stock-attribution')).toHaveText(
    'Photos provided by Pexels',
  );
  const card = panel.locator('.stock-item').first();
  await expect(card.locator('.shelf-name')).toHaveText('Mountain lake');
  await expect(card.locator('.stock-licence')).toBeVisible();
  // Debounced search asks the provider with the typed words.
  await panel.locator('.stock-search').fill('lake');
  await expect
    .poll(() => mock.requests.some((url) => url.includes('query=lake')))
    .toBe(true);
  await expect(panel.locator('.stock-item')).toHaveCount(1);
  await page.screenshot({ path: 'reports/final-ui/u2-stock-photos.png' });
  const before = (await hook(page)).project.compositions[0]!.layers.length;
  await card.hover();
  await card.locator('[data-action="stock-plus"]').click();
  await expect
    .poll(async () =>
      (await assets(page)).some((asset) => asset.metadata.stockLicense),
    )
    .toBe(true);
  const stock = (await assets(page)).find(
    (asset) => asset.metadata.stockLicense,
  )!;
  expect((stock.metadata.stockLicense as { author: string }).author).toBe(
    'Mira',
  );
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.layers.length)
    .toBe(before + 1);
  // Media › Details shows the credit.
  await showCategory(page, 'Media');
  const media = page.locator(`[data-item-id="${stock.id}"]`).first();
  await media.click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-details"]').click();
  await expect(page.locator('.media-details')).toContainText('Mira');
  await page.keyboard.press('Escape');
  // Drag a card to the timeline: a second clip at the drop time (Elements
  // keeps its Photos page).
  await showCategory(page, 'Elements');
  const from = (await panel.locator('.stock-card').first().boundingBox())!;
  const view = (await page
    .locator('#timeline-foundation .timeline-scroll')
    .boundingBox())!;
  const layers = (await hook(page)).project.compositions[0]!.layers.length;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 3);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 3 });
  await page.mouse.move(view.x + view.width - 120, view.y + 30, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.layers.length)
    .toBe(layers + 1);
});

test('[F2-004] Stock states: no key shows a card that opens Settings; a rate limit says when to try again; a blocked download never crashes', async ({
  page,
}) => {
  const mock = await mockStock(page);
  await page.goto('/');
  await openTile(page, 'videos');
  const panel = elements(page).locator('.stock-panel');
  const keyCard = panel.locator('.stock-message[data-state="key"]');
  await expect(keyCard).toContainText('Add your free');
  await keyCard.getByRole('button').click();
  const dialog = page.locator('.modal-dialog');
  await expect(dialog.locator('[data-settings-tab="keys"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const block = dialog.locator(
    `.key-block[data-provider="${await panel.locator('[data-provider][aria-checked="true"]').getAttribute('data-provider')}"]`,
  );
  await block.locator('.key-input').fill(GOOD_KEY);
  await block.locator('[data-key-action="save"]').click();
  await dialog.locator('#settings-done').click();
  await expect(panel.locator('.stock-item').first()).toBeVisible();
  // Blocked download.
  mock.mode = 'cors';
  await panel.locator('.stock-card').first().click();
  await expect(page.locator('.toast').last()).toContainText(
    'This site blocks direct download',
  );
  await expect(page.locator('.editor-shell')).toBeVisible();
  // Rate limited.
  mock.mode = 'rate';
  await panel.locator('.stock-search').fill('ocean waves');
  await expect(
    panel.locator('.stock-message[data-state="error"]'),
  ).toContainText(/Try again in \d+ seconds/);
});
