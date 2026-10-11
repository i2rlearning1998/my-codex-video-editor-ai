import path from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { expect, artboard } from './fixtures';

// V4/V5: the FX sweeps' shared measurements: the artboard and the exported
// PNG frame scaled to 64 x 36 RGB, their difference and spread, and a
// contact sheet of a panel's tiles.
const SHEETS = process.env.FX_SHEET_DIR;
const panel = (page: Page) =>
  page
    .locator('#right-section, #library-transitions')
    .filter({ has: page.locator('.fx-tile') })
    .first();
const tiles = (page: Page) => panel(page).locator('.fx-tile');

/** The artboard drawn on the canvas, scaled to 64 x 36 RGB, once stable.
 *  (The artboard is found once, on the plain picture: an effect may cover
 *  all of it.) */
let board: Awaited<ReturnType<typeof artboard>> | null = null;
export async function preview(page: Page, fresh = false) {
  if (fresh || !board) board = await artboard(page);
  const size = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __AIVE__: {
          getProject(): {
            compositions: { id: string; width: number; height: number }[];
          };
          getSession(): { compositionId: string };
        };
      }
    ).__AIVE__;
    const scene = state
      .getProject()
      .compositions.find(
        (item) => item.id === state.getSession().compositionId,
      )!;
    return { width: scene.width, height: scene.height };
  });
  let last = '';
  let value: number[] = [];
  await expect
    .poll(async () => {
      value = await page.locator('#composition-canvas').evaluate(
        (canvas: HTMLCanvasElement, { at: board, size }) => {
          const rect = canvas.getBoundingClientRect();
          const ratio = canvas.width / rect.width;
          const small = new OffscreenCanvas(64, 36);
          const context = small.getContext('2d')!;
          context.drawImage(
            canvas,
            (board.x - rect.left) * ratio,
            (board.y - rect.top) * ratio,
            size.width * board.scale * ratio,
            size.height * board.scale * ratio,
            0,
            0,
            64,
            36,
          );
          const data = context.getImageData(0, 0, 64, 36).data;
          return [...data].filter((_, index) => index % 4 !== 3);
        },
        { at: board!, size },
      );
      const same = JSON.stringify(value) === last;
      last = JSON.stringify(value);
      return same;
    })
    .toBe(true);
  return value;
}
/** The current frame as exported (PNG), scaled to 64 x 36 RGB. */
export async function exported(page: Page, testInfo: TestInfo) {
  await page.locator('#export').click();
  const saving = page.waitForEvent('download');
  await page.locator('.modal-dialog #export-png').click();
  const file = testInfo.outputPath(`frame-${Date.now()}.png`);
  await (await saving).saveAs(file);
  await page.locator('.modal-dialog .modal-close').click();
  return page.evaluate(async (png64) => {
    const bytes = Uint8Array.from(atob(png64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const small = new OffscreenCanvas(64, 36);
    const context = small.getContext('2d')!;
    context.drawImage(bitmap, 0, 0, 64, 36);
    const data = context.getImageData(0, 0, 64, 36).data;
    return [...data].filter((_, index) => index % 4 !== 3);
  }, readFileSync(file).toString('base64'));
}
export const meanDiff = (a: number[], b: number[]) =>
  a.reduce((sum, value, index) => sum + Math.abs(value - b[index]!), 0) /
  a.length;
/** Not blank: the picture still has structure (not one flat colour). */
export const spread = (a: number[]) => {
  const mean = a.reduce((sum, value) => sum + value, 0) / a.length;
  return Math.sqrt(
    a.reduce((sum, value) => sum + (value - mean) ** 2, 0) / a.length,
  );
};

/** Every tile's thumbnail with its label, as one PNG (for review). */
export async function contactSheet(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  const count = await tiles(page).count();
  for (let i = 0; i < count; i++)
    await tiles(page).nth(i).scrollIntoViewIfNeeded();
  await expect
    .poll(() => panel(page).locator('.fx-tile-loading').count(), {
      timeout: 30_000,
    })
    .toBe(0);
  const url = await panel(page).evaluate((host) => {
    const items = [...host.querySelectorAll<HTMLElement>('.fx-tile')];
    const columns = 8,
      width = 160,
      height = 90,
      label = 22;
    const canvas = document.createElement('canvas');
    canvas.width = columns * width;
    canvas.height = Math.ceil(items.length / columns) * (height + label);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#111';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '13px sans-serif';
    items.forEach((item, index) => {
      const x = (index % columns) * width,
        y = Math.floor(index / columns) * (height + label);
      const image = item.querySelector('img');
      if (image?.complete && image.naturalWidth)
        context.drawImage(image, x, y, width, height);
      context.fillStyle = '#eee';
      context.fillText(
        item.querySelector('.fx-tile-label')!.textContent!,
        x + 4,
        y + height + 16,
      );
    });
    return canvas.toDataURL('image/png');
  });
  const bytes = Buffer.from(url.split(',')[1]!, 'base64');
  writeFileSync(testInfo.outputPath(`${name}.png`), bytes);
  if (SHEETS) {
    mkdirSync(SHEETS, { recursive: true });
    writeFileSync(path.join(SHEETS, `${name}.png`), bytes);
  }
}
