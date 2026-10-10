import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  toScreen,
  showSceneStrip,
  seekKeep,
} from './fixtures';

// J12: transitions. Two pictures touch on one lane; a + at the cut opens the
// Transition panel; a cross fade mixes them across the cut, the same in the
// preview and in an exported frame.
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const PNG = 'image_gradient_1920x1080.png';

const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const labels = async (page: Page) => (await hook(page)).history.labels;
async function seek(page: Page, seconds: number) {
  await seekKeep(page, seconds);
}
async function addToScene(page: Page, name: string) {
  const item = page.locator(
    `.media-item:has(.media-card[data-name="${name}"])`,
  );
  await item.locator('.media-card').click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  return (await hook(page)).session.selectedIds[0]!;
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
const near = (a: number[], b: number[], tolerance: number) =>
  a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);

test('[TR-011] a + where two clips touch opens the Transition panel; a cross fade mixes them across the cut, in the preview and the export', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  // A blank scene with two pictures, 0..5 s and 5..10 s, on one lane.
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles([JPG, PNG].map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
  const first = await addToScene(page, JPG);
  await seek(page, 5);
  const second = await addToScene(page, PNG);
  expect(second).not.toBe(first);
  const lanes = (await scene(page)).tracks.filter(
    (track) => track.clips.length,
  );
  expect(lanes).toHaveLength(1);
  const [a, b] = [...lanes[0]!.clips].sort((x, y) => x.startTime - y.startTime);
  expect([a!.startTime + a!.duration, b!.startTime]).toEqual([5, 5]);
  // The + at the cut.
  const row = page.locator(
    `#timeline-foundation .timeline-nle-row[data-track-id="${lanes[0]!.id}"]`,
  );
  await row.hover();
  const add = row.locator('.transition-add');
  await expect(add).toHaveAttribute('aria-label', 'Add transition');
  await add.click();
  const panel = page.locator('[data-deep-panel="transition"]');
  await expect(panel).toBeVisible();
  // T-ALL P6 (D-189): the FX library fills the planned ones and a More
  // group, so every entry is live.
  await expect(panel.locator('.transition-group')).toHaveCount(7);
  await expect(panel.locator('[aria-disabled="true"]')).toHaveCount(0);
  // Search narrows the grid.
  await panel.locator('.transition-search').fill('slide');
  await expect(panel.locator('.transition-option')).toHaveCount(2);
  await panel.locator('.transition-search').fill('');
  // Cross fade: one step; a chip marks the cut.
  await panel.locator('[data-transition="crossfade"]').click();
  expect((await labels(page)).at(-1)).toBe('Add transition');
  await expect(row.locator('.transition-chip')).toHaveAttribute(
    'aria-label',
    'Cross fade, 1 s',
  );
  await expect(panel.locator('[data-transition="crossfade"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Duration: clamped to what the clips allow (5 s here), with a message.
  const duration = panel.locator('#transition-duration');
  await duration.fill('9');
  await duration.press('Enter');
  await expect(page.locator('.toast').last()).toContainText(
    'nearest allowed value',
  );
  const transitionOf = async () =>
    (await scene(page)).tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === b!.id)!.transitionMetadata.in as {
      type: string;
      duration: number;
    };
  expect(await transitionOf()).toEqual({ type: 'crossfade', duration: 5 });
  await panel.locator('#transition-duration').fill('1');
  await panel.locator('#transition-duration').press('Enter');
  expect((await labels(page)).at(-1)).toBe('Transition duration');
  expect(await transitionOf()).toEqual({ type: 'crossfade', duration: 1 });
  // The picture: only A before the window, only B after, half and half at
  // the cut.
  await page.keyboard.press('Escape');
  await seek(page, 4);
  // Found while the artboard's background shows beside the first picture;
  // at the cut the second picture covers it all.
  const at = await toScreen(page, 640, 360);
  const onlyA = await pixel(page, at);
  await seek(page, 6);
  const onlyB = await pixel(page, at);
  expect(near(onlyA, onlyB, 20)).toBe(false);
  await seek(page, 5);
  const mixed = await pixel(page, at);
  const half = onlyA.map((value, index) => (value + onlyB[index]!) / 2);
  expect(near(mixed, half, 12)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cross-fade.png') });
  // The exported frames mix the same way: only A, only B and half and half
  // at the cut. (Each is compared with its own frames: the preview canvas is
  // smaller than the export and this point lies on detail in the test
  // picture, so a single pixel differs between the two sizes.)
  const exportedMix = await exportedPixel(page, testInfo, 640, 360);
  await seek(page, 4);
  const exportedA = await exportedPixel(page, testInfo, 640, 360);
  await seek(page, 6);
  const exportedB = await exportedPixel(page, testInfo, 640, 360);
  expect(near(exportedA, exportedB, 20)).toBe(false);
  expect(
    near(
      exportedMix,
      exportedA.map((value, index) => (value + exportedB[index]!) / 2),
      12,
    ),
  ).toBe(true);
  // Remove: one step; the + is back.
  await row.locator('.transition-chip').click();
  await page
    .locator('[data-deep-panel="transition"] [data-action="transition-remove"]')
    .click();
  expect((await labels(page)).at(-1)).toBe('Remove transition');
  await expect(row.locator('.transition-chip')).toHaveCount(0);
  await expect(row.locator('.transition-add')).toHaveCount(1);
});
