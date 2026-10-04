import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, toScreen } from './fixtures';
import { choose, reveal } from './controls';

// J5: bundled fonts with real weights, the Bold state from the resolved
// weight, and exact vertical alignment in a tall text box.
type Point = [number, number];
interface Debug {
  view: [number, number, number, number, number, number];
  corners?: Point[];
}
const debug = (page: Page): Promise<Debug> =>
  page.evaluate(() =>
    (
      window as unknown as { __AIVE__: { getCanvas(): Debug } }
    ).__AIVE__.getCanvas(),
  );
const layer = async (page: Page, id: string): Promise<any> => {
  const state = await hook(page);
  return (
    state.project.compositions.find(
      (item) => item.id === state.session.compositionId,
    )!.layers as any[]
  ).find((item) => item.id === id);
};
const control = (page: Page, id: string) =>
  page.locator(`#context-toolbar [data-control="${id}"]`);
async function select(page: Page, x: number, y: number) {
  const at = await toScreen(page, x, y);
  await page.mouse.click(at.x, at.y);
}
/** Ink inside the selected box: its total contrast and its first and last rows. */
async function ink(page: Page) {
  const box = (await debug(page)).corners!;
  return page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement, box) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / rect.width;
      // Inset past the white corner and side handles (12 CSS px discs).
      const x0 = Math.round((box[0]![0] + 10) * ratio),
        y0 = Math.round(box[0]![1] * ratio) + 1;
      const x1 = Math.round((box[2]![0] - 10) * ratio),
        y1 = Math.round(box[2]![1] * ratio) - 1;
      const { data, width } = canvas
        .getContext('2d')!
        .getImageData(x0, y0, x1 - x0, y1 - y0);
      const background = data[0]! + data[1]! + data[2]!;
      let darkness = 0,
        first = -1,
        last = -1;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]!,
          g = data[i + 1]!,
          b = data[i + 2]!;
        // Ink differs from the background (the box's top-left pixel, above
        // the first line's glyphs); the accent selection outline is skipped.
        const value = Math.abs((r + g + b - background) / 3);
        if (value > 60 && Math.max(r, g, b) - Math.min(r, g, b) < 60) {
          darkness += value;
          const row = Math.floor(i / 4 / width);
          if (first < 0) first = row;
          last = row;
        }
      }
      return { darkness, first: first / ratio, last: last / ratio };
    }, box);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TXT-040] bundled fonts have real weights: the weight list offers what the font has, and Regular, Medium, Semibold and Bold look different', async ({
  page,
}) => {
  // The example subtitle (76,570 680 × 70).
  await select(page, 200, 600);
  await control(page, 'font').click();
  await page.locator('.font-option[data-font="Inter"]').click();
  expect(
    (await layer(page, 'example-subtitle')).properties.fontFamily.value,
  ).toBe('Inter');
  // Inter offers all nine weights.
  await (await reveal(page, 'toolbar-weight')).click();
  await expect(page.locator('.select-popover [role="option"]')).toHaveText([
    'Thin',
    'Extra light',
    'Light',
    'Regular',
    'Medium',
    'Semibold',
    'Bold',
    'Extra bold',
    'Black',
  ]);
  await page.keyboard.press('Escape');
  const darkness: number[] = [];
  for (const weight of ['400', '500', '600', '700']) {
    await choose(page, 'toolbar-weight', weight);
    await expect
      .poll(() =>
        page.evaluate(
          (weight) => document.fonts.check(`${weight} 20px Inter`),
          weight,
        ),
      )
      .toBe(true);
    // Let the redraw after the font arrives settle on a stable value.
    let previous = -1;
    await expect
      .poll(async () => {
        const value = (await ink(page)).darkness;
        const stable = value === previous;
        previous = value;
        return stable;
      })
      .toBe(true);
    darkness.push(previous);
  }
  // Each heavier weight puts more ink on the canvas, and Bold clearly more
  // than Regular (measured: about 1.18, 1.13, 1.02 and 1.37 in total).
  for (let i = 1; i < darkness.length; i++)
    expect(darkness[i]! / darkness[i - 1]!).toBeGreaterThan(1.01);
  expect(darkness[3]! / darkness[0]!).toBeGreaterThan(1.2);
  // A system font offers only what it has: Regular and Bold. (The Font
  // panel is still open beside the canvas.)
  await page.locator('.font-option[data-font="Georgia"]').click();
  await (await reveal(page, 'toolbar-weight')).click();
  await expect(page.locator('.select-popover [role="option"]')).toHaveText([
    'Regular',
    'Bold',
  ]);
  await page.keyboard.press('Escape');
  // Devanagari draws in the Devanagari-capable font with its weights.
  expect(
    await page.evaluate(async () => {
      await document.fonts.load('700 20px "Noto Sans Devanagari"', 'नमस्ते');
      return document.fonts.check('700 20px "Noto Sans Devanagari"', 'नमस्ते');
    }),
  ).toBe(true);
});

test('[TXT-041] the Bold button shows the resolved weight: a heading that is already bold shows Bold on, in the toolbar and the right panel', async ({
  page,
}) => {
  await showCategory(page, 'Text');
  await page.locator('.library-card[data-item-id="text-1"]').first().click();
  const id = (await hook(page)).session.selectedIds[0]!;
  expect((await layer(page, id)).properties.fontWeight.value).toBe(700);
  await expect(control(page, 'bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator('#right-section [data-action="right-bold"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  // Off, then on again.
  await control(page, 'bold').click();
  expect((await layer(page, id)).properties.fontWeight.value).toBe(400);
  await expect(control(page, 'bold')).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.locator('#right-section [data-action="right-bold"]'),
  ).toHaveAttribute('aria-pressed', 'false');
});

test('[TXT-015] Top, Middle and Bottom place the lines exactly in a box taller than its text', async ({
  page,
}) => {
  // The headline box (76,165 730 × 230) is taller than its two lines.
  await select(page, 300, 250);
  const headline = await layer(page, 'example-headline');
  const size = headline.properties.fontSize.value as number;
  const lines = (headline.properties.text.value as string).split('\n').length;
  const room = headline.properties.height.value - lines * size * 1.2;
  expect(room).toBeGreaterThan(20);
  const [scale] = (await debug(page)).view;
  const top = await ink(page);
  await control(page, 'spacing').click();
  // The ink moves by exactly half the spare room, then all of it (±1.5 px),
  // once the canvas has redrawn.
  await page.locator('.toolbar-popover [data-anchor="middle"]').click();
  await expect
    .poll(async () =>
      Math.abs((await ink(page)).first - top.first - (room / 2) * scale),
    )
    .toBeLessThan(1.5);
  await page.locator('.toolbar-popover [data-anchor="bottom"]').click();
  await expect
    .poll(async () => {
      const bottom = await ink(page);
      return Math.max(
        Math.abs(bottom.first - top.first - room * scale),
        Math.abs(bottom.last - top.last - room * scale),
      );
    })
    .toBeLessThan(1.5);
});
