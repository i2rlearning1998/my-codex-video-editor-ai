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
  settled,
} from './fixtures';

// T-ALL P6: the FX library wired into the right panel and the transition
// panel. Filters, effects and colour adjustments change the drawn picture,
// one undo step each, are saved with the project and draw the same in the
// preview, the PNG frame and the exported video (one render path).
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const PNG = 'image_gradient_1920x1080.png';

const tab = (page: Page, name: string) =>
  page.locator(`#rail-right [data-section="${name}"]`);
const panel = (page: Page) => page.locator('#right-section');
const labels = async (page: Page) => (await hook(page)).history.labels;
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const clipOf = async (page: Page, layerId: string) =>
  (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.layerId === layerId)!;
const fxOf = async (page: Page, layerId: string) =>
  (
    (await clipOf(page, layerId)).metadata as {
      fx?: {
        stack: { id: string; params: Record<string, unknown> }[];
        blendMode?: string;
      };
    }
  ).fx;
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
const grey = (rgb: number[]) => Math.max(...rgb) - Math.min(...rgb) <= 6;

/** A blank scene with two pictures touching at 5 s on one lane. */
async function twoPictures(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __loadVideo: unknown }).__loadVideo = async (
      data: Uint8Array,
      type: string,
    ) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      video.src = URL.createObjectURL(new Blob([data], { type }));
      await new Promise((resolve) => (video.onloadeddata = resolve));
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const check = () => {
          const buffered = video.buffered;
          if (
            (buffered.length &&
              buffered.end(buffered.length - 1) >= video.duration - 0.05) ||
            performance.now() - started > 10_000
          )
            resolve();
          else setTimeout(check, 20);
        };
        check();
      });
      return video;
    };
  });
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
  await (
    await chooser
  ).setFiles([JPG, PNG].map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
  const first = await addToScene(page, JPG);
  await seek(page, 5);
  const second = await addToScene(page, PNG);
  return { first, second };
}

test('[FX-004][FX-015][CLR-001][MSK-001] filters, effects and colour adjustments change the picture, one step each, and are saved', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { first } = await twoPictures(page);
  await seek(page, 2);
  await page
    .locator(`.timeline-clip[data-action="clip"][data-id="${first}"]`)
    .first()
    .click();
  await settled(page);
  const at = await toScreen(page, 520, 360);
  const plain = await pixel(page, at);
  expect(grey(plain)).toBe(false);
  // Filters: Black and white makes the picture grey; Original is pressed first.
  await tab(page, 'Filters').click();
  // (V4: tiles, spec 5; Black & white 1 is the library's Black and white.)
  await expect(
    panel(page).locator('.fx-tile[data-tile="none"]'),
  ).toHaveAttribute('aria-selected', 'true');
  await panel(page).locator('.fx-tile[data-tile="black-white-1"]').click();
  expect((await labels(page)).at(-1)).toBe('Apply filter');
  expect((await fxOf(page, first))!.stack.map((item) => item.id)).toEqual([
    'filter.black-white',
  ]);
  expect(grey(await pixel(page, at))).toBe(true);
  // Intensity 0 is the original picture.
  const intensity = panel(page).locator('#right-filter-intensity');
  await intensity.fill('0');
  await intensity.dispatchEvent('change');
  expect((await labels(page)).at(-1)).toBe('Filter intensity');
  expect(near(await pixel(page, at), plain, 2)).toBe(true);
  await page.keyboard.press('Control+z');
  expect(grey(await pixel(page, at))).toBe(true);
  // Undo removes the filter; Redo brings it back.
  await page.keyboard.press('Control+z');
  expect(near(await pixel(page, at), plain, 2)).toBe(true);
  expect(await fxOf(page, first)).toBeUndefined();
  await page.keyboard.press('Control+Shift+z');
  expect(grey(await pixel(page, at))).toBe(true);
  // (V2: the sample sits inside the picture's yellow stripe, not on the
  // stripe edge at the centre; saturated colours cannot brighten, so this
  // checks that exposure -100 darkens.)
  // Adjust colors: exposure -100 darkens; a blend mode is stored; Reset
  // removes both and keeps the filter.
  await panel(page).locator('.fx-tile[data-tile="none"]').click();
  await tab(page, 'Adjust').click();
  // (V4: a plain slider, spec 5; it commits on release.)
  const exposure = panel(page).locator('#right-adjust-exposure');
  await exposure.fill('-100');
  await exposure.dispatchEvent('change');
  expect((await labels(page)).at(-1)).toBe('Adjust colors');
  const dark = await pixel(page, at);
  expect(dark.reduce((a, b) => a + b, 0)).toBeLessThan(
    plain.reduce((a, b) => a + b, 0) - 30,
  );
  await panel(page).locator('#right-blend-mode').click();
  await page.getByRole('option', { name: 'Multiply' }).click();
  expect((await fxOf(page, first))!.blendMode).toBe('blend.multiply');
  await panel(page).locator('[data-action="right-adjust-reset"]').click();
  expect((await labels(page)).at(-1)).toBe('Reset colors');
  expect(await fxOf(page, first)).toBeUndefined();
  expect(near(await pixel(page, at), plain, 2)).toBe(true);
  // Effects: Pixelation is added (one step) and changes the picture.
  await tab(page, 'Effects').click();
  await panel(page).locator('.fx-tile[data-tile="effect.pixelation"]').click();
  expect((await labels(page)).at(-1)).toBe('Add effect');
  await expect(
    panel(page).locator('.fx-tile[data-tile="effect.pixelation"]'),
  ).toHaveAttribute('aria-selected', 'true');
  // Saved with the project: a reload keeps the stack.
  await expect
    .poll(async () => (await fxOf(page, first))?.stack[0]?.id)
    .toBe('effect.pixelation');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some(
          (key) =>
            !key.endsWith(':backup') &&
            !key.endsWith(':recovery') &&
            (localStorage.getItem(key) ?? '').includes('effect.pixelation'),
        ),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await expect
    .poll(async () => {
      const state = await hook(page);
      return state.project.compositions
        .flatMap((composition) => composition.tracks)
        .flatMap((track) => track.clips)
        .find((clip) => clip.layerId === first)?.metadata.fx;
    })
    .toMatchObject({ version: 1, stack: [{ id: 'effect.pixelation' }] });
});

test('[FX-010][TR-004][TR-012] a filter and an FX pixel transition draw the same in the preview and the export', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const { first, second } = await twoPictures(page);
  // A filter on the first picture.
  await seek(page, 2);
  await page
    .locator(`.timeline-clip[data-action="clip"][data-id="${first}"]`)
    .first()
    .click();
  await tab(page, 'Filters').click();
  await panel(page).locator('.fx-tile[data-tile="black-white-1"]').click();
  await settled(page);
  const at = await toScreen(page, 520, 360);
  const preview = await pixel(page, at);
  expect(grey(preview)).toBe(true);
  const png = await exportedPixel(page, testInfo, 520, 360);
  expect(grey(png)).toBe(true);
  // The exported video frame (the export worker) is grey too.
  await page.locator('#export').click();
  const more = page.locator('.modal-dialog #export-more');
  if ((await more.getAttribute('open')) === null)
    await more.locator('summary').click();
  await page.locator('.modal-dialog #export-start').fill('1');
  await page.locator('.modal-dialog #export-start').press('Tab');
  await page.locator('.modal-dialog #export-end').fill('2');
  await page.locator('.modal-dialog #export-end').press('Tab');
  const downloading = page.waitForEvent('download', { timeout: 120_000 });
  await page.locator('.modal-dialog #export-start-button').click();
  const download = await downloading;
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const mime = file.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
  const video = await page.evaluate(
    async ({ data64, mime }) => {
      const data = Uint8Array.from(atob(data64), (c) => c.charCodeAt(0));
      const element = await (
        window as unknown as {
          __loadVideo(
            data: Uint8Array,
            type: string,
          ): Promise<HTMLVideoElement>;
        }
      ).__loadVideo(data, mime);
      await new Promise((resolve) => {
        element.onseeked = resolve;
        element.currentTime = 0.5;
      });
      const canvas = new OffscreenCanvas(
        element.videoWidth,
        element.videoHeight,
      );
      const context = canvas.getContext('2d')!;
      context.drawImage(element, 0, 0);
      const x = Math.round((520 / 1280) * element.videoWidth);
      const y = Math.round((360 / 720) * element.videoHeight);
      return [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
    },
    { data64: readFileSync(file).toString('base64'), mime },
  );
  expect(Math.max(...video) - Math.min(...video)).toBeLessThanOrEqual(12);
  // A pixel transition (Burn: black at its middle) across the cut.
  const lane = (await scene(page)).tracks.find((track) =>
    track.clips.some((clip) => clip.layerId === second),
  )!;
  const row = page.locator(
    `#timeline-foundation .timeline-nle-row[data-track-id="${lane.id}"]`,
  );
  await row.hover();
  await row.locator('.transition-add').click();
  const transitions = page.locator('[data-deep-panel="transition"]');
  await transitions.locator('[data-transition="fx-burn"]').click();
  expect((await labels(page)).at(-1)).toBe('Add transition');
  await page.keyboard.press('Escape');
  await seek(page, 6);
  const onlyB = await pixel(page, at);
  await seek(page, 5);
  const middle = await pixel(page, at);
  expect(middle.reduce((a, b) => a + b, 0)).toBeLessThan(
    Math.min(
      onlyB.reduce((a, b) => a + b, 0),
      preview.reduce((a, b) => a + b, 0),
    ) - 60,
  );
  const exported = await exportedPixel(page, testInfo, 520, 360);
  expect(near(exported, middle, 24)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('burn.png') });
});
