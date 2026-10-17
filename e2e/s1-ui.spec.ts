import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, toScreen } from './fixtures';
import { MOVE, importPack } from './creator-helpers';

// S1: Clipchamp-level library panels and menus, measured at 1920 × 1080.
test.use({ viewport: { width: 1920, height: 1080 } });
const SHAPE = readFileSync('examples/creator-packs/shape.json', 'utf8');
const PNG = path.resolve('tests/fixtures/media/image_gradient_1920x1080.png');

const LEFT = [
  'Templates',
  'Elements',
  'Text',
  'Media',
  'Scene',
  'Record',
  'Audio',
  'AI',
  'MyTemplates',
  'Theme',
] as const;
const leftOpen = (page: Page) =>
  page.evaluate(
    () =>
      (
        document.querySelector('.library') as HTMLElement
      ).getBoundingClientRect().width > 100,
  );

test.beforeEach(async ({ page }) => {
  // The real right panel, not the legacy reserved column (D-190).
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_RIGHT__?: string }).__AIVE_E2E_RIGHT__ = 'off';
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[S1-001] every panel has one header: the title and exactly one collapse button, which collapses the panel', async ({
  page,
}) => {
  const head = page.locator('.library .panel-head');
  for (const category of LEFT) {
    await showCategory(page, category);
    await expect(head).toHaveCount(1);
    await expect(head.locator('.panel-head-title')).toHaveText(/\S/);
    await expect(head.locator('button')).toHaveCount(1);
    // No Back arrow or Close cross anywhere in the panel's visible headers.
    for (const old of [
      '.shelf-collapse',
      '.browse-close',
      '.browse-header:visible',
      '.theme-title',
    ])
      await expect(page.locator(`.library ${old}`)).toHaveCount(0);
  }
  for (const category of LEFT) {
    await showCategory(page, category);
    await head.locator('button').click();
    await expect.poll(() => leftOpen(page)).toBe(false);
  }
  // The right panel's header is the same component.
  const badge = await toScreen(page, 80, 460);
  await page.mouse.click(badge.x, badge.y);
  await page
    .locator('#rail-right button[data-section]:not([disabled]):visible')
    .first()
    .click();
  const right = page.locator('.inspector .panel-head');
  await expect(right).toHaveCount(1);
  await expect(right.locator('button')).toHaveCount(1);
  await expect(right.locator('.panel-head-title')).toHaveText(/\S/);
  await right.locator('button').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector('.inspector')!.getBoundingClientRect().width,
      ),
    )
    .toBeLessThan(10);
});

type Box = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};
const box = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el): Box => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    });
const PANELS = [
  ['Media', '#media-panel'],
  ['AI', '#library-ai'],
  ['MyTemplates', '#library-mine'],
] as const;
/** One picture in Media, a shape and a preset in AI, a shape in My Templates. */
async function fill(page: Page) {
  await showCategory(page, 'Media');
  await page.locator('#import-media-input').setInputFiles(PNG);
  await expect(page.locator('#media-panel .shelf-item')).toHaveCount(1);
  await importPack(page, SHAPE);
  await importPack(page, MOVE);
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
  const point = await toScreen(page, 80, 460);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const menu = page.locator('#canvas-context-menu');
  await menu.locator('[data-action="save-to-mine"]').click();
  await menu.locator('[data-action="save-to-mine-shape"]').click();
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
}

test('[S1-002] Media, AI and My Templates share one layout: the same panel width, full-width rows on one left and right edge, search 40 px with a 40 × 40 New folder 8 px after it', async ({
  page,
}) => {
  await fill(page);
  const widths: number[] = [];
  for (const [category, host] of PANELS) {
    await showCategory(page, category);
    const panel = await box(page, '.library');
    widths.push(panel.width);
    const search = await box(page, `${host} .shelf-search`);
    const folder = await box(page, `${host} .shelf-new-folder`);
    const cards = await box(page, `${host} .shelf-cards`);
    expect(search.height).toBeCloseTo(40, 0);
    expect([folder.width, folder.height]).toEqual([40, 40]);
    expect(folder.left - search.right).toBeCloseTo(8, 0);
    // 16 px of padding on both sides of the panel's content.
    const content = await box(page, host);
    expect(search.left - content.left).toBeCloseTo(16, 0);
    expect(content.right - folder.right).toBeCloseTo(16, 0);
    const rows = [cards];
    if (category === 'Media') {
      rows.push(await box(page, '#media-panel .import-row'));
      rows.push(await box(page, '#media-dropzone'));
      const imp = await box(page, '#import-media');
      expect(imp.height).toBeCloseTo(44, 0);
      expect((await box(page, '#media-dropzone')).height).toBeCloseTo(56, 0);
      const sort = await box(page, '#media-sort');
      expect(sort.right).toBeCloseTo(folder.right, 0);
    }
    if (category === 'AI') {
      const actions = await box(page, '#ai-actions');
      rows.push(actions);
      const a = await box(page, '#ai-import');
      const b = await box(page, '#ai-copy-brief');
      expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
      expect(a.top).toBeCloseTo(b.top, 0);
    }
    if (category === 'MyTemplates')
      await expect(page.locator(`${host} .shelf-actions`)).toHaveCount(0);
    for (const row of rows) {
      expect(row.left).toBeCloseTo(search.left, 0);
      expect(row.right).toBeCloseTo(folder.right, 0);
    }
  }
  // The same width for every left panel, so the canvas never jumps.
  for (const category of [
    'Templates',
    'Elements',
    'Text',
    'Scene',
    'Audio',
    'Theme',
  ]) {
    await showCategory(page, category);
    widths.push((await box(page, '.library')).width);
  }
  expect(new Set(widths).size).toBe(1);
  expect(widths[0]).toBeGreaterThanOrEqual(370);
});

test('[S1-003] cards are two equal columns of the same width (at least 165 px) in Media, AI and My Templates; "⋯" and "+" sit inside the thumbnail, at least 28 px, and never also add the card', async ({
  page,
}) => {
  await fill(page);
  const widths: number[] = [];
  for (const [category, host] of PANELS) {
    await showCategory(page, category);
    const items = page.locator(`${host} .shelf-item`);
    for (const index of [...Array(await items.count()).keys()]) {
      const item = items.nth(index);
      const card = await item
        .locator('.shelf-card')
        .evaluate((el) => el.getBoundingClientRect().width);
      widths.push(card);
      // The thumbnail shows a picture, never a placeholder pill.
      const thumb = item.locator('.shelf-thumb');
      const t = await thumb.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      });
      expect(t.width / t.height).toBeCloseTo(16 / 9, 1);
      await item.hover();
      for (const [button, tip] of [
        ['.shelf-more', 'More options'],
        ['.shelf-plus', 'Add to Scene'],
      ] as const) {
        const control = item.locator(button);
        await expect(control).toHaveCSS('opacity', '1');
        await expect(control).toHaveAttribute('title', tip);
        const c = await control.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        });
        expect(c.width).toBeGreaterThanOrEqual(28);
        expect(c.height).toBeGreaterThanOrEqual(28);
        expect(c.left).toBeGreaterThanOrEqual(t.left);
        expect(c.right).toBeLessThanOrEqual(t.right);
        expect(c.top).toBeGreaterThanOrEqual(t.top);
        expect(c.bottom).toBeLessThanOrEqual(t.bottom);
        expect(t.right - c.right).toBeCloseTo(8, 0);
      }
      const more = await item.locator('.shelf-more').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top;
      });
      expect(more - t.top).toBeCloseTo(8, 0);
      const plus = await item
        .locator('.shelf-plus')
        .evaluate((el) => el.getBoundingClientRect().bottom);
      expect(t.bottom - plus).toBeCloseTo(8, 0);
    }
  }
  expect(widths.length).toBeGreaterThanOrEqual(4);
  for (const width of widths) {
    expect(width).toBeGreaterThanOrEqual(165);
    expect(Math.abs(width - widths[0]!)).toBeLessThanOrEqual(1);
  }
  // "⋯" opens the menu without adding; "+" adds once.
  await showCategory(page, 'AI');
  const steps = (await hook(page)).history.labels.length;
  const item = page.locator('#library-ai .shelf-item').first();
  await item.hover();
  await item.locator('.shelf-more').click();
  await expect(page.locator('#ai-menu')).toBeVisible();
  expect((await hook(page)).history.labels.length).toBe(steps);
  await page.keyboard.press('Escape');
  await item.hover();
  await item.locator('.shelf-plus').click();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps + 1);
});

test('[S1-004] Media always shows All, Images, Videos and Audio; AI and My Templates show All plus a chip per kind that has items; AI cards carry no AI bar', async ({
  page,
}) => {
  const chips = (host: string) =>
    page
      .locator(`${host} .shelf-tab`)
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset.tab),
      );
  await showCategory(page, 'Media');
  expect(await chips('#media-panel')).toEqual([
    'all',
    'image',
    'video',
    'audio',
  ]);
  await showCategory(page, 'AI');
  expect(await chips('#library-ai')).toEqual([]);
  await importPack(page, SHAPE);
  await importPack(page, MOVE);
  await expect(page.locator('#library-ai .shelf-tabs')).toBeVisible();
  expect(await chips('#library-ai')).toEqual(['all', 'shape', 'preset']);
  await expect(page.locator('#library-ai .ai-chip')).toHaveCount(0);
  // The preset card is an ordinary card with a drawn thumbnail.
  const preset = page.locator(
    '#library-ai .shelf-item[data-item-id="move-pack--preset-move"]',
  );
  await expect(preset.locator('.shelf-thumb')).not.toHaveAttribute(
    'data-thumb',
    'placeholder',
  );
  await showCategory(page, 'MyTemplates');
  expect(await chips('#library-mine')).toEqual([]);
});
