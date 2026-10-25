import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';
import { mockStock, GOOD_KEY } from './stock-mock';
import { pickColor } from './controls';

// FIX1 F2: stock fixes against real-shaped provider answers (F9): Pixabay's
// empty `large`, Pexels' HLS entries with null sizes, icons on a light tile
// that land big and can be recoloured, a mixed sticker set, truthful errors
// with Copy diagnostics.
const elements = (page: Page) => page.locator('#library-elements');
const panel = (page: Page) => elements(page).locator('.stock-panel');
const openTile = async (page: Page, tile: string) => {
  await showCategory(page, 'Elements');
  const back = elements(page).locator('[data-action="browse-back"]');
  while (await back.isVisible()) await back.click();
  await elements(page).locator(`[data-tile="${tile}"]`).click();
};
const withKey = (page: Page, provider: string) =>
  page.addInitScript(
    ([provider, key]) =>
      localStorage.setItem(
        `aive.provider-key.${provider}.apiKey`,
        JSON.stringify(key),
      ),
    [provider, GOOD_KEY] as const,
  );
type Asset = {
  id: string;
  type: string;
  width?: number;
  metadata: Record<string, unknown>;
};
const assets = async (page: Page) =>
  (await hook(page)).project.assets as unknown as Asset[];

test('[FX1-003][MED-028][MED-029] Pixabay videos never use an empty rendition: the default is medium (up to 1080p); Details lists the qualities with sizes; the card shows download progress', async ({
  page,
}) => {
  const mock = await mockStock(page);
  await withKey(page, 'pixabay');
  await page.goto('/');
  await openTile(page, 'videos');
  const card = panel(page).locator('.stock-item').first();
  await expect(card).toBeVisible();
  // The licence is a small corner chip that leaves the picture free.
  const chip = (await card.locator('.stock-licence').boundingBox())!;
  const thumb = (await card.locator('.shelf-thumb').boundingBox())!;
  expect(chip.width).toBeLessThanOrEqual(24);
  expect(chip.width * chip.height).toBeLessThan(
    thumb.width * thumb.height * 0.05,
  );
  // Details: tiny, small and medium with their sizes; no empty large.
  await card.hover();
  await card.locator('[data-action="stock-more"]').click();
  await page.locator('#stock-menu [data-action="stock-details"]').click();
  const options = page.locator('.stock-quality-option');
  await expect(options).toHaveCount(3);
  await expect(options.nth(2)).toContainText('Medium');
  await expect(options.nth(2)).toContainText('3.5 MB');
  await expect(options.nth(2).locator('input')).toBeChecked();
  await page.locator('[data-action="stock-details-add"]').click();
  await expect
    .poll(() => mock.downloads.some((url) => url.endsWith('43_medium.mp4')))
    .toBe(true);
  expect(mock.downloads.some((url) => url.includes('large'))).toBe(false);
  await expect
    .poll(async () =>
      (await assets(page)).some(
        (asset) => asset.type === 'video' && asset.metadata.stockLicense,
      ),
    )
    .toBe(true);
  // A slow download shows a progress bar with Cancel on the card.
  await page.route(
    'https://cdn.pixabay.com/video/43_small.mp4',
    () => undefined,
  );
  await card.hover();
  await card.locator('[data-action="stock-more"]').click();
  await page.locator('#stock-menu [data-action="stock-details"]').click();
  await page.locator('.stock-quality-option', { hasText: 'Small' }).click();
  await page.locator('[data-action="stock-details-add"]').click();
  const progress = card.locator('.stock-progress');
  await expect(progress.locator('progress')).toBeVisible();
  await page.screenshot({ path: 'reports/fix1/f2-stock-progress.png' });
  await progress.locator('.stock-cancel').click();
  await expect(progress).toHaveCount(0);
});

test('[FX1-004] Pexels videos with HLS entries (null width and height, missing fps, null quality) list and import an MP4 up to 1080p', async ({
  page,
}) => {
  const mock = await mockStock(page);
  await withKey(page, 'pexels');
  await page.goto('/');
  await openTile(page, 'videos');
  await expect(panel(page).locator('.stock-item')).toHaveCount(2);
  await expect(
    panel(page).locator('.stock-message[data-state="error"]'),
  ).toHaveCount(0);
  expect(
    mock.requests.some((url) => new URL(url).pathname === '/v1/videos/search'),
  ).toBe(true);
  const card = panel(page).locator('.stock-item').first();
  await card.hover();
  await card.locator('[data-action="stock-plus"]').click();
  await expect
    .poll(() => mock.downloads.some((url) => url.endsWith('/12/hd.mp4')))
    .toBe(true);
  expect(mock.downloads.some((url) => url.includes('.m3u8'))).toBe(false);
  expect(mock.downloads.some((url) => url.includes('uhd'))).toBe(false);
  await expect
    .poll(async () => (await assets(page)).some((a) => a.type === 'video'))
    .toBe(true);
});

test('[FX1-005] Icons: thumbnails on a light tile, one card per name, an added icon lands centred at 30 % of the canvas and can be recoloured; no Restored note', async ({
  page,
}) => {
  await mockStock(page);
  await page.goto('/');
  await openTile(page, 'icons');
  const card = panel(page).locator('.stock-item').first();
  await expect(card).toBeVisible();
  const tile = await card
    .locator('.shelf-thumb')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(tile).toBe('rgb(243, 244, 247)');
  await card.hover();
  await card.locator('[data-action="stock-plus"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  const state = await hook(page);
  const composition = state.project.compositions[0]!;
  const layer = composition.layers.find(
    (l) => l.id === state.session.selectedIds[0],
  )!;
  const asset = (await assets(page)).find((a) => a.id === layer.assetId)!;
  const width = (asset.width ?? 0) * layer.transform.scale.value[0];
  expect(width).toBeGreaterThanOrEqual(
    0.25 * Math.min(composition.width, composition.height),
  );
  const centre = layer.transform.position.value[0] + width / 2;
  expect(Math.abs(centre - composition.width / 2)).toBeLessThan(2);
  await expect(page.locator('.toast', { hasText: 'Restored' })).toHaveCount(0);
  // Recolour in the right panel: the icon's tint becomes the colour.
  await page.locator('#rail-right [data-section="Properties"]').click();
  const field = page.locator('#right-icon-color');
  await expect(field).toBeVisible();
  await page.screenshot({ path: 'reports/fix1/f2-icon.png' });
  await pickColor(page, 'right-icon-color', '#e53935');
  await expect
    .poll(async () => {
      const s = await hook(page);
      const l = s.project.compositions[0]!.layers.find(
        (x) => x.id === layer.id,
      )!;
      return (l.properties as Record<string, { value?: unknown }>).tint?.value;
    })
    .toBe('#e53935');
});

test('[FX1-006] Stickers: an empty search shows a mixed set of more than 12 distinct stickers from permissive sets (no share-alike OpenMoji), with Load more', async ({
  page,
}) => {
  const mock = await mockStock(page);
  await page.goto('/');
  await openTile(page, 'stickers');
  const names = panel(page).locator('.stock-item .shelf-name');
  await expect.poll(() => names.count()).toBeGreaterThan(12);
  const all = await names.allTextContents();
  expect(new Set(all).size).toBe(all.length);
  expect(new Set(all.map((n) => n.split(' ')[0])).size).toBeGreaterThan(4);
  expect(
    await panel(page)
      .locator('.stock-item')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-item-id'))),
  ).not.toContainEqual(expect.stringContaining('openmoji'));
  const search = mock.requests.find((url) => url.includes('prefixes'))!;
  expect(decodeURIComponent(search)).not.toContain('openmoji');
  // The whole sticker shows (contain).
  await expect(
    panel(page).locator('.stock-item img.stock-icon').first(),
  ).toHaveCSS('object-fit', 'contain');
  await page.screenshot({ path: 'reports/fix1/f2-stickers.png' });
  const before = await names.count();
  await panel(page).locator('.stock-load-more').click();
  await expect.poll(() => names.count()).toBeGreaterThan(before);
});

test('[FX1-007] Stock errors tell the truth: a 503 names the status, offline says No internet, a blocked download says so on the card with Retry, and Copy diagnostics leaves the key out', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const mock = await mockStock(page);
  await withKey(page, 'pixabay');
  await page.goto('/');
  await openTile(page, 'photos');
  const error = panel(page).locator('.stock-message[data-state="error"]');
  mock.mode = 'server';
  await panel(page).locator('.stock-search').fill('server down');
  await expect(error).toContainText('returned 503');
  await error.locator('[data-action="copy-diagnostics"]').click();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain('HTTP status: 503');
  expect(report).toContain('Endpoint: https://pixabay.com/api/');
  expect(report).not.toContain(GOOD_KEY);
  // Offline: only then "No internet".
  // A failed request while online is not "No internet".
  mock.mode = 'down';
  await panel(page).locator('.stock-search').fill('unreachable');
  await expect(error).toContainText('could not be reached');
  await expect(error).not.toContainText('No internet');
  await context.setOffline(true);
  await panel(page).locator('.stock-search').fill('offline words');
  await expect(error).toContainText('No internet');
  await context.setOffline(false);
  mock.mode = 'ok';
  // A blocked download: the card says so and offers Retry.
  await panel(page).locator('.stock-search').fill('lake');
  const card = panel(page).locator('.stock-item').first();
  await expect(card).toBeVisible();
  mock.mode = 'cors';
  await card.hover();
  await card.locator('[data-action="stock-plus"]').click();
  const failed = card.locator('.stock-progress[data-state="error"]');
  await expect(failed).toContainText('blocked this download');
  mock.mode = 'ok';
  await failed.locator('[data-action="stock-retry"]').click();
  await expect
    .poll(async () => (await assets(page)).some((a) => a.metadata.stockLicense))
    .toBe(true);
});
