import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  showSceneStrip,
  settled,
  openRight,
} from './fixtures';

// FINAL2 U7: masks, layer blend modes and chroma key in the right panel,
// with mask handles and a colour eyedropper on the canvas.
test.use({ viewport: { width: 1920, height: 1080 } });
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const panel = (page: Page) => page.locator('#right-section');
const labels = async (page: Page) => (await hook(page)).history.labels;
async function layerOf(page: Page, id: string) {
  const state = await hook(page);
  const scene = state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
  return scene.layers.find((layer) => layer.id === id)!;
}
/** The canvas pixel under a screen point, once the drawing is stable. */
async function pixel(page: Page, at: { x: number; y: number }) {
  let last = '';
  let value: number[] = [];
  await expect
    .poll(async () => {
      value = await page
        .locator('#composition-canvas')
        .evaluate((canvas: HTMLCanvasElement, point) => {
          const rect = canvas.getBoundingClientRect();
          const ratio = canvas.width / rect.width;
          return [
            ...canvas
              .getContext('2d')!
              .getImageData(
                Math.round((point.x - rect.left) * ratio),
                Math.round((point.y - rect.top) * ratio),
                1,
                1,
              )
              .data.slice(0, 3),
          ];
        }, at);
      const same = JSON.stringify(value) === last;
      last = JSON.stringify(value);
      return same;
    })
    .toBe(true);
  return value;
}
const near = (a: number[], b: number[], tolerance: number) =>
  a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);
async function exportedPixel(
  page: Page,
  testInfo: TestInfo,
  x: number,
  y: number,
) {
  await page.locator('#export').click();
  const saving = page.waitForEvent('download');
  await page.locator('.modal-dialog #export-png').click();
  const file = testInfo.outputPath(`frame-${Date.now()}.png`);
  await (await saving).saveAs(file);
  await page.locator('.modal-dialog .modal-close').click();
  return page.evaluate(
    async ({ png64, x, y }) => {
      const bytes = Uint8Array.from(atob(png64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
    },
    { png64: readFileSync(file).toString('base64'), x, y },
  );
}
/** A blank scene with one picture, selected. */
async function onePicture(page: Page) {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles([path.join(MEDIA, JPG)]);
  await expect(page.locator('#media-import')).toBeHidden();
  const item = page.locator(`.media-item:has(.media-card[data-name="${JPG}"])`);
  await item.locator('.media-card').click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  const id = (await hook(page)).session.selectedIds[0]!;
  await page
    .locator(`.timeline-clip[data-action="clip"][data-id="${id}"]`)
    .first()
    .click();
  await settled(page);
  return id;
}
/** A layer-local point on screen (the picture is unrotated). */
async function localToScreen(page: Page, id: string, x: number, y: number) {
  const layer = await layerOf(page, id);
  const [px, py] = layer.transform.position.value as [number, number];
  const [sx, sy] = layer.transform.scale.value as [number, number];
  // The canvas's own view matrix (read-only test hook), not the artboard
  // found by scanning pixels, which is only whole-pixel exact: a handle
  // dragged to a point lands there at any canvas size.
  const [cx, cy] = [px + x * sx, py + y * sy];
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  const view = await page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getCanvas(): { view: number[] } };
        }
      ).__AIVE__.getCanvas().view,
  );
  const [a, b, c, d, e, f] = view as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return { x: box.x + a * cx + c * cy + e, y: box.y + b * cx + d * cy + f };
}

test('[F2-040][F2-043] masks: add a rectangle, drag its handle on the canvas, and the PNG frame matches the preview', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const id = await onePicture(page);
  const layer = await layerOf(page, id);
  const [px, py] = layer.transform.position.value as [number, number];
  const [sx] = layer.transform.scale.value as [number, number];
  // A point inside the picture but outside the default mask (20 %..80 %).
  const outsideLocal: [number, number] = [120, 120];
  const outside = await localToScreen(page, id, ...outsideLocal);
  const plain = await pixel(page, outside);
  await openRight(page, 'Effects');
  const masks = panel(page).locator('[data-accordion="layer-masks"]');
  await expect(masks).toBeVisible();
  await masks.locator('[data-action="mask-add-rect"]').click();
  expect((await labels(page)).at(-1)).toBe('Add mask');
  const stored = (await layerOf(page, id)).masks!;
  expect(stored).toHaveLength(1);
  expect(stored[0]!.type).toBe('rect');
  const cut = await pixel(page, outside);
  expect(near(cut, plain, 6)).toBe(false);
  // Drag the top-left handle out past the sample point: one step on release.
  const [hx, hy] = stored[0]!.geometry[0]!;
  const handle = await localToScreen(page, id, hx, hy);
  await page.mouse.move(handle.x, handle.y);
  await expect(page.locator('#composition-canvas')).toHaveCSS(
    'cursor',
    'pointer',
  );
  await page.mouse.down();
  await page.mouse.move(handle.x - 60, handle.y - 60, { steps: 6 });
  const target = await localToScreen(page, id, 40, 40);
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  expect((await labels(page)).at(-1)).toBe('Edit mask');
  const moved = (await layerOf(page, id)).masks![0]!.geometry[0]!;
  expect(moved[0]).toBeCloseTo(40, 0);
  expect(moved[1]).toBeCloseTo(40, 0);
  expect(near(await pixel(page, outside), plain, 6)).toBe(true);
  // Feather and invert are one step each.
  await masks.locator('[data-action="mask-invert"]').click();
  expect((await labels(page)).at(-1)).toBe('Invert mask');
  const inverted = await pixel(page, outside);
  expect(near(inverted, plain, 6)).toBe(false);
  // Export parity: the PNG frame at that composition pixel matches.
  const cx = Math.round(px + outsideLocal[0] * sx),
    cy = Math.round(py + outsideLocal[1] * sx);
  const exported = await exportedPixel(page, testInfo, cx, cy);
  expect(near(exported, inverted, 8)).toBe(true);
  // Undo reverts the last mask edit.
  await page.keyboard.press('Control+z');
  expect((await layerOf(page, id)).masks![0]!.invert).toBeFalsy();
});

test('[F2-041] blend: one grouped blend control sets the layer blend mode', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const id = await onePicture(page);
  const at = await localToScreen(page, id, 600, 400);
  const plain = await pixel(page, at);
  await openRight(page, 'Adjust');
  await expect(panel(page).locator('#right-blend-mode')).toHaveCount(1);
  await panel(page).locator('#right-blend-mode').click();
  await expect(
    page.locator('.select-group', { hasText: 'Comparison' }),
  ).toBeVisible();
  await page.getByRole('option', { name: 'Difference' }).click();
  expect((await labels(page)).at(-1)).toBe('Blend mode');
  expect((await layerOf(page, id)).blendMode).toBe('difference');
  expect(near(await pixel(page, at), plain, 6)).toBe(false);
  // Reset colors puts it back to Normal.
  await panel(page).locator('[data-action="right-adjust-reset"]').click();
  expect((await layerOf(page, id)).blendMode).toBe('normal');
  expect(near(await pixel(page, at), plain, 3)).toBe(true);
});

test('[F2-042] chroma key: eyedropper on the canvas removes the picked colour; CPU notice when the GPU path is off', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    (
      window as unknown as { __AIVE_E2E_CHROMA_GPU__: string }
    ).__AIVE_E2E_CHROMA_GPU__ = 'off';
  });
  const id = await onePicture(page);
  const at = await localToScreen(page, id, 600, 400);
  const plain = await pixel(page, at);
  await openRight(page, 'Effects');
  const chroma = panel(page).locator('[data-accordion="layer-chroma"]');
  await expect(chroma).toBeVisible();
  // Failure state: no GPU path, a plain notice (it still works).
  await expect(chroma.locator('.right-warning')).toContainText('processor');
  await chroma.locator('[data-action="chroma-enable"]').click();
  expect((await layerOf(page, id)).chromaKey?.color).toBe('#00ff00');
  await chroma.locator('[data-action="chroma-eyedropper"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  await page.mouse.move(at.x, at.y);
  await expect(page.locator('#composition-canvas')).toHaveCSS(
    'cursor',
    'crosshair',
  );
  await page.mouse.click(at.x, at.y);
  expect((await labels(page)).at(-1)).toBe('Pick key colour');
  const picked = (await layerOf(page, id)).chromaKey!.color;
  const rgb = [1, 3, 5].map((i) => parseInt(picked.slice(i, i + 2), 16));
  expect(near(rgb, plain, 3)).toBe(true);
  expect(near(await pixel(page, at), plain, 10)).toBe(false);
  // Similarity is a shared number field (one step); Fast preview toggles.
  const similarity = chroma.locator('#chroma-similarity');
  await similarity.fill('30');
  await similarity.press('Enter');
  expect((await layerOf(page, id)).chromaKey!.similarity).toBeCloseTo(0.3);
  await chroma.locator('[data-quality="fast"]').click();
  await expect(chroma.locator('[data-quality="fast"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // Removing the key brings the picture back.
  await chroma.locator('[data-action="chroma-enable"]').click();
  expect((await layerOf(page, id)).chromaKey).toBeUndefined();
  expect(near(await pixel(page, at), plain, 3)).toBe(true);
});
