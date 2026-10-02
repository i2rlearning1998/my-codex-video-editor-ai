import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';

// H6: signatures in the Draw panel: typed, drawn or uploaded, and kept in
// this browser when asked.
const topLayers = async (page: Page): Promise<any[]> => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!.layers as any[];
};
const labels = async (page: Page) => (await hook(page)).history.labels;
async function openSignature(page: Page, tab: 'type' | 'draw' | 'upload') {
  await showCategory(page, 'Draw');
  await page.locator('#signature-open').click();
  await page.locator(`[data-signature-tab="${tab}"]`).click();
  await expect(page.locator(`[data-signature-tab="${tab}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[SHP-024] a typed signature is added in a script style, saved in this browser, and added again with one click', async ({
  page,
}) => {
  await openSignature(page, 'type');
  await expect(page.locator('#signature-add')).toBeDisabled();
  await page.locator('#signature-text').fill('Asha Rao');
  await page.locator('.signature-fonts [data-font="Times New Roman"]').click();
  await expect(
    page.locator('.signature-fonts [data-font="Times New Roman"]'),
  ).toHaveText('Asha Rao');
  await page.locator('#signature-add').click();
  expect((await labels(page)).at(-1)).toBe('Add signature');
  const signature = (await topLayers(page)).at(-1)!;
  expect(signature.type).toBe('text');
  expect(signature.properties.text.value).toBe('Asha Rao');
  expect(signature.properties.fontFamily.value).toBe('Times New Roman');
  expect(signature.properties.fontStyle.value).toBe('italic');
  expect((await hook(page)).session.selectedIds).toEqual([signature.id]);
  // Saved: it survives a reload and adds again in one click.
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'Draw');
  const count = (await topLayers(page)).length;
  await page.locator('#signature-use-saved').click();
  expect((await topLayers(page)).length).toBe(count + 1);
  expect((await topLayers(page)).at(-1)!.properties.text.value).toBe(
    'Asha Rao',
  );
  await page.locator('#signature-forget').click();
  await expect(page.locator('#signature-use-saved')).toHaveCount(0);
});

test('[SHP-024] a drawn signature becomes one pen drawing; an uploaded one an image', async ({
  page,
}) => {
  await openSignature(page, 'draw');
  const pad = page.locator('#signature-pad');
  const box = (await pad.boundingBox())!;
  for (const [y0, y1] of [
    [0.3, 0.7],
    [0.7, 0.3],
  ] as const) {
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * y0);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * y1, {
      steps: 6,
    });
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * y0, {
      steps: 6,
    });
    await page.mouse.up();
  }
  await expect(pad.locator('polyline')).toHaveCount(2);
  await page.locator('#signature-save').uncheck();
  await page.locator('#signature-add').click();
  const drawing = (await topLayers(page)).at(-1)!;
  expect(drawing.type).toBe('shape');
  expect(drawing.properties.brush.value).toBe('pen');
  // Two sub-strokes in one layer.
  expect(drawing.properties.path.value.split(';')).toHaveLength(2);
  // Not saved this time.
  await expect(page.locator('#signature-use-saved')).toHaveCount(0);
  // Upload.
  await openSignature(page, 'upload');
  await page
    .locator('#signature-file')
    .setInputFiles(
      path.resolve('tests/fixtures/media/image_alpha_logo_512.png'),
    );
  await expect
    .poll(async () => (await topLayers(page)).at(-1)!.type)
    .toBe('image');
  const image = (await topLayers(page)).at(-1)!;
  expect(image.name).toBe('Signature');
  expect((await labels(page)).at(-1)).toBe('Add signature');
});
