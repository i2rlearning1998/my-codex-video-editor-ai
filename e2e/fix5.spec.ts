import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { test, expect, hook, showCategory, toScreen } from './fixtures';
import { importPack } from './creator-helpers';

// FIX5: the owner's bug round (C1 to C10), one focused test per bug.
const pack = (name: string) =>
  readFileSync(`examples/creator-packs/${name}.json`, 'utf8');

/** The share of a card's thumbnail pixels that are not flat (a pixel check). */
async function thumbIsDrawn(page: Page, slot: Locator) {
  const png = await slot.screenshot();
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let different = 0;
    for (let i = 4; i < data.length; i += 4)
      if (
        Math.abs(data[i]! - data[0]!) +
          Math.abs(data[i + 1]! - data[1]!) +
          Math.abs(data[i + 2]! - data[2]!) >
        24
      )
        different++;
    return different / (data.length / 4);
  }, png.toString('base64'));
}

test('[LIB-020] every AI and My Templates card has a drawn thumbnail (never blank), one kind each', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/');
  for (const name of [
    'shape',
    'background',
    'text',
    'template',
    'motion-b',
    'move-preset',
    'style-documentary',
    'theme-midnight',
  ])
    await importPack(page, pack(name));
  // My Templates: save the example badge as a sticker and as an animation.
  for (const kind of ['sticker', 'animation', 'text']) {
    await showCategory(page, 'Scene');
    await page.locator('#scene-list [data-layer-id="example-badge"]').click();
    const point = await toScreen(page, 80, 460);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    const menu = page.locator('#canvas-context-menu');
    await menu.locator('[data-action="save-to-mine"]').click();
    await menu.locator(`[data-action="save-to-mine-${kind}"]`).click();
  }
  for (const [category, host] of [
    ['AI', '#library-ai'],
    ['MyTemplates', '#library-mine'],
  ] as const) {
    await showCategory(page, category);
    const cards = page.locator(`${host} .shelf-item`);
    await expect.poll(() => cards.count()).toBeGreaterThan(1);
    const total = await cards.count();
    console.log(
      category,
      await cards.evaluateAll((l) =>
        l.map((e) => (e as HTMLElement).dataset.itemId),
      ),
    );
    for (let i = 0; i < total; i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      const slot = card.locator('.shelf-thumb');
      // Wait out the retry: a card settles on a picture or on its icon.
      await expect
        .poll(async () => thumbIsDrawn(page, slot), {
          message: `card ${await card.getAttribute('data-item-id')} stays blank`,
          timeout: 15_000,
        })
        .toBeGreaterThan(0.02);
    }
  }
  // The same item twice is listed once.
  const ids = await page
    .locator('#library-ai .shelf-item')
    .evaluateAll((items) => items.map((item) => item.textContent?.trim()));
  expect(new Set(ids).size).toBe(ids.length);
});
