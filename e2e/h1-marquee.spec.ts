import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// H1.1: the drag-select box. Root cause of the owner's report: the marquee
// element was created and sized, but `.canvas-marquee` had no styles at all,
// so the rectangle was an invisible, unpositioned div. These tests fail on
// that code because they assert the rectangle is actually painted where the
// pointer is.
type Matrix = [number, number, number, number, number, number];
async function screen(page: Page, x: number, y: number) {
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  const [a, b, c, d, e, f] = await page.evaluate(
    () =>
      (
        window as unknown as { __AIVE__: { getCanvas(): { view: Matrix } } }
      ).__AIVE__.getCanvas().view,
  );
  return { x: box.x + a * x + c * y + e, y: box.y + b * x + d * y + f };
}
const selectedIds = async (page: Page) =>
  (await hook(page)).session.selectedIds;

/** Drags from `from` to `to` (page px) and checks the painted rectangle mid-drag. */
async function sweep(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  shift = false,
) {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  const box = page.locator('.canvas-marquee');
  await expect(box).toBeVisible();
  const style = await box.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      position: computed.position,
      border: computed.borderTopWidth,
      borderStyle: computed.borderTopStyle,
      background: computed.backgroundColor,
      pointer: computed.pointerEvents,
    };
  });
  expect(style.position).toBe('fixed');
  expect(style.border).toBe('1px');
  expect(style.borderStyle).toBe('solid');
  expect(style.pointer).toBe('none');
  // Translucent: an rgba colour with 0 < alpha < 1.
  const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(style.background)?.[1]);
  expect(alpha).toBeGreaterThan(0);
  expect(alpha).toBeLessThan(1);
  const rect = (await box.boundingBox())!;
  expect(rect.x).toBeCloseTo(Math.min(from.x, to.x), -0.3);
  expect(rect.y).toBeCloseTo(Math.min(from.y, to.y), -0.3);
  expect(rect.width).toBeCloseTo(Math.abs(to.x - from.x), -0.3);
  expect(rect.height).toBeCloseTo(Math.abs(to.y - from.y), -0.3);
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await expect(box).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[CV-003][CV-046] the drag-select box is painted from empty artboard space with nothing selected, and selects what it touches', async ({
  page,
}) => {
  await sweep(
    page,
    await screen(page, 1150, 560),
    await screen(page, 1000, 690),
  );
  await expect.poll(() => selectedIds(page)).toEqual(['example-edition']);
});

test('[CV-003][CV-046] the drag-select box is painted from the stage outside the artboard while something is already selected', async ({
  page,
}) => {
  const headline = await screen(page, 300, 250);
  await page.mouse.click(headline.x, headline.y);
  await expect.poll(() => selectedIds(page)).toEqual(['example-headline']);
  await sweep(page, await screen(page, -25, 440), await screen(page, 330, 520));
  await expect
    .poll(() => selectedIds(page))
    .toEqual(expect.arrayContaining(['example-badge', 'example-badge-text']));
  expect(await selectedIds(page)).not.toContain('example-headline');
});

test('[CV-003][CV-046] Shift adds to the selection and a group counts as one', async ({
  page,
}) => {
  const headline = await screen(page, 300, 250);
  await page.mouse.click(headline.x, headline.y);
  // Over the cards group's lower part: the group is selected, not its children.
  await sweep(
    page,
    await screen(page, 1270, 480),
    await screen(page, 900, 440),
    true,
  );
  await expect
    .poll(() => selectedIds(page))
    .toEqual(['example-headline', 'example-cards']);
});

test('[CV-003][CV-046] the drag-select box works at 100% zoom', async ({
  page,
}) => {
  await page.locator('[data-canvas-zoom="actual"]').click();
  await sweep(page, await screen(page, 700, 470), await screen(page, 560, 600));
  await expect.poll(() => selectedIds(page)).toEqual(['example-subtitle']);
});

for (const scale of [1.25, 1.5]) {
  test.describe(`device pixel ratio ${scale}`, () => {
    test.use({ deviceScaleFactor: scale });
    test(`[CV-003][CV-046] the drag-select box is painted and selects at device pixel ratio ${scale}`, async ({
      page,
    }) => {
      await sweep(
        page,
        await screen(page, -25, 440),
        await screen(page, 330, 520),
      );
      await expect
        .poll(() => selectedIds(page))
        .toEqual(
          expect.arrayContaining(['example-badge', 'example-badge-text']),
        );
    });
  });
}
