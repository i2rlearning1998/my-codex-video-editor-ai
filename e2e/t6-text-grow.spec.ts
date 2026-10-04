import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';

// T6: a text box grows while it is typed in, one line per Enter; a
// fixed-width box wraps as it is typed; nothing moves when editing ends; a
// fixed-height box (Auto height off) keeps its height, clips the rest and
// marks the overflow.
const editor = (page: Page) => page.locator('.text-editor');
/** The drawn selection box's height on screen (canvas pixels). */
const drawnHeight = async (page: Page) => {
  const corners = await page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getCanvas: () => { corners: number[][] | null } };
        }
      ).__AIVE__.getCanvas().corners,
  );
  if (!corners) return 0;
  const ys = corners.map((point) => point[1]!);
  return Math.max(...ys) - Math.min(...ys);
};
const layer = async (page: Page) => {
  const state = await hook(page);
  const scene = state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
  return scene.layers.find((item) => item.id === state.session.selectedIds[0])!;
};
const property = (item: { properties: Record<string, unknown> }, key: string) =>
  (item.properties[key] as { value: unknown } | undefined)?.value;

async function addTextBox(page: Page) {
  await showCategory(page, 'Text');
  await page.locator('#add-text-box').click();
  await expect(editor(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TXT-042] typing five lines grows the box on every Enter, live, and nothing jumps when editing ends', async ({
  page,
}, testInfo) => {
  await addTextBox(page);
  await page.keyboard.type('Line 1');
  const heights = [await drawnHeight(page)];
  for (let line = 2; line <= 5; line++) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(`Line ${line}`);
    // The drawn box grows with the typed line, before anything is stored.
    await expect
      .poll(() => drawnHeight(page))
      .toBeGreaterThan(heights.at(-1)! + 5);
    heights.push(await drawnHeight(page));
    // The editor and the drawn box agree (screen pixels).
    const box = (await editor(page).boundingBox())!;
    expect(Math.abs(box.height - heights.at(-1)!)).toBeLessThan(3);
  }
  // Nothing is stored while typing.
  expect((await hook(page)).history.labels.at(-1)).not.toBe('Edit text');
  await page.screenshot({ path: testInfo.outputPath('five-lines.png') });
  const live = heights.at(-1)!;
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  expect((await hook(page)).history.labels.at(-1)).toBe('Edit text');
  // No jump: the stored box draws exactly as it did while typing.
  expect(Math.abs((await drawnHeight(page)) - live)).toBeLessThan(1);
  expect(String(property(await layer(page), 'text')).split('\n')).toHaveLength(
    5,
  );
});

test('[TXT-043] a fixed-width box wraps as it is typed and keeps its width', async ({
  page,
}) => {
  await addTextBox(page);
  const width = (await editor(page).boundingBox())!.width;
  const before = await drawnHeight(page);
  // One long line: it wraps inside the box, so the box gets taller, not
  // wider.
  await page.keyboard.type(
    'A long sentence that keeps going until it has to wrap onto more lines',
  );
  await expect.poll(() => drawnHeight(page)).toBeGreaterThan(before + 5);
  expect(
    Math.abs((await editor(page).boundingBox())!.width - width),
  ).toBeLessThan(1);
  const live = await drawnHeight(page);
  await page.keyboard.press('Escape');
  expect(Math.abs((await drawnHeight(page)) - live)).toBeLessThan(1);
});

test('[TXT-044] with Auto height off the box keeps its height, clips the text past it and shows an overflow mark', async ({
  page,
}) => {
  await addTextBox(page);
  await page.keyboard.type('One line');
  await page.keyboard.press('Escape');
  const stored = property(await layer(page), 'height') as number;
  // Auto height off (Spacing popover), one undo step.
  await page.locator('[data-control="spacing"]').first().click();
  const toggle = page.locator('[data-action="auto-height"]').first();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  expect((await hook(page)).history.labels.at(-1)).toBe('Fixed height');
  expect(property(await layer(page), 'textFixedHeight')).toBe(true);
  expect((await hook(page)).session.selectedIds).toHaveLength(1);
  // Type three more lines: the box keeps its height.
  const before = await drawnHeight(page);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toHaveClass(/fixed-height/);
  await page.keyboard.press('End');
  await page.keyboard.press('Control+End');
  for (const line of ['Two', 'Three', 'Four']) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
  expect(Math.abs((await drawnHeight(page)) - before)).toBeLessThan(1);
  await page.keyboard.press('Escape');
  expect(property(await layer(page), 'height')).toBe(stored);
  expect(String(property(await layer(page), 'text')).split('\n')).toHaveLength(
    4,
  );
  // The editor marks the overflow; export never draws it.
  const overflow = await page.evaluate(() => {
    const api = (
      window as unknown as {
        __AIVE__: { getCanvas: () => { textOverflow?: string[] } };
      }
    ).__AIVE__.getCanvas();
    return api.textOverflow ?? [];
  });
  expect(overflow).toContain((await layer(page)).id);
  // Auto height on again: the box grows to its four lines in one step.
  await page.locator('[data-control="spacing"]').first().click();
  await page.locator('[data-action="auto-height"]').first().click();
  expect((await hook(page)).history.labels.at(-1)).toBe('Auto height');
  expect(property(await layer(page), 'height') as number).toBeGreaterThan(
    stored,
  );
});
