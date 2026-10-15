import { readFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// X1 (CODE-TIERS-SPEC section 5): a code layer plays from a frame cache;
// the preview and the export read the same baked frames.
interface CodeDebug {
  layerId: string;
  cacheKey: string;
  quality: string;
  state: string;
  stored: number;
  total: number;
  error: string | null;
}
const codeDebug = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getMedia(): { code: CodeDebug[] } };
        }
      ).__AIVE__.getMedia().code,
  );
/** The canvas pixel at a composition point (through the live view). */
async function pixelAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ x, y }) => {
      const [a, b, c, d, e, f] = (
        window as unknown as {
          __AIVE__: { getCanvas(): { view: number[] } };
        }
      ).__AIVE__.getCanvas().view as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#composition-canvas',
      )!;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      const data = canvas
        .getContext('2d')!
        .getImageData(
          Math.round((a * x + c * y + e) * ratio),
          Math.round((b * x + d * y + f) * ratio),
          1,
          1,
        ).data;
      return [data[0]!, data[1]!, data[2]!];
    },
    { x, y },
  );
}
const dialog = (page: Page) => page.locator('.modal-dialog');
async function runExport(page: Page, testInfo: TestInfo) {
  const downloading = page.waitForEvent('download', { timeout: 120_000 });
  await dialog(page).locator('#export-start-button').click();
  const download = await downloading;
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  return readFileSync(file);
}

test.describe('X1 code layer pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __AIVE_E2E_FREECODE__?: string }).__AIVE_E2E_FREECODE__ =
        'fake';
    });
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
  });

  test('[CODE-001][CODE-002] a Tier B code layer bakes, plays from the cache and sits in a visual lane', async ({
    page,
    openFixtureProject,
  }) => {
    await openFixtureProject('code-layer.json');
    const clip = page.locator('.timeline-clip[data-code="true"]');
    await expect(clip).toHaveCount(1);
    await expect(clip).toHaveAttribute('data-kind', 'video');
    await expect
      .poll(async () => (await codeDebug(page))[0], { timeout: 30_000 })
      .toMatchObject({ state: 'done', stored: 60, total: 60, error: null });
    await expect(clip.locator('.clip-bake')).toBeHidden();
    // The pulse is drawn at the centre (pink), the corner stays transparent
    // over the scene background.
    await expect.poll(() => pixelAt(page, 960, 540)).toEqual([255, 51, 102]);
    const background = await pixelAt(page, 20, 20);
    expect(background).not.toEqual([255, 51, 102]);
    // The layer is a full-canvas picture-less video layer with code.
    const layer = (await hook(page)).project.compositions[0]!.layers[0]!;
    expect(layer.type).toBe('video');
    expect(layer.assetId).toBeNull();
    expect(layer.code?.tier).toBe('B');
  });

  test('[CODE-002] a heavy bake shows Rendering n % with Cancel; the baked part plays and Resume finishes it', async ({
    page,
    openFixtureProject,
  }) => {
    await openFixtureProject('code-layer-free.json');
    const bar = page.locator('.timeline-clip[data-code="true"] .clip-bake');
    await expect(bar).toBeVisible();
    await expect(bar.locator('.clip-bake-label')).toHaveText(/Rendering \d+ %/);
    await expect
      .poll(async () => (await codeDebug(page))[0]!.stored)
      .toBeGreaterThan(5);
    await bar.locator('.clip-bake-action').click();
    await expect(bar).toHaveAttribute('data-state', 'cancelled');
    await expect(bar.locator('.clip-bake-label')).toHaveText(
      /Rendering paused at \d+ %/,
    );
    const paused = (await codeDebug(page))[0]!;
    expect(paused.state).toBe('cancelled');
    expect(paused.stored).toBeLessThan(paused.total);
    // The baked part draws: at 0.1 s (frame 3) the bar's left end is blue.
    await page.locator('.player-timecode').click();
    await page.keyboard.type('0.1');
    await page.keyboard.press('Enter');
    await expect.poll(() => pixelAt(page, 4, 540)).toEqual([51, 102, 255]);
    await bar.locator('.clip-bake-action').click();
    await expect
      .poll(async () => (await codeDebug(page))[0], { timeout: 30_000 })
      .toMatchObject({ state: 'done', stored: 90, total: 90 });
    await expect(bar).toBeHidden();
  });

  test('[CODE-003][EXP-007] the export draws the same baked frames as the preview', async ({
    page,
    openFixtureProject,
  }, testInfo) => {
    await openFixtureProject('code-layer.json');
    await expect
      .poll(async () => (await codeDebug(page))[0]?.state, { timeout: 30_000 })
      .toBe('done');
    // The playhead at 1 s (frame 30): Export frame is the preview's PNG.
    await page.locator('.player-timecode').click();
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await hook(page)).session.time).toBe(1);
    await page.locator('#export').click();
    await expect(dialog(page).locator('#export-form')).toBeVisible();
    await expect(dialog(page).locator('#export-format')).not.toHaveText(
      /Checking/,
    );
    const saving = page.waitForEvent('download');
    await dialog(page).locator('#export-png').click();
    const pngFile = testInfo.outputPath('frame.png');
    await (await saving).saveAs(pngFile);
    const png = readFileSync(pngFile);
    const video = await runExport(page, testInfo);
    const result = await page.evaluate(
      async ({ video64, png64 }) => {
        const decode = (base64: string) =>
          Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const draw = (source: CanvasImageSource, w: number, h: number) => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const context = canvas.getContext('2d')!;
          context.drawImage(source, 0, 0, w, h);
          return context.getImageData(0, 0, w, h).data;
        };
        const element = document.createElement('video');
        element.muted = true;
        element.preload = 'auto';
        element.src = URL.createObjectURL(
          new Blob([decode(video64)], { type: 'video/webm' }),
        );
        await new Promise((resolve) => (element.onloadeddata = resolve));
        await new Promise((resolve) => {
          element.onseeked = resolve;
          element.currentTime = 30.5 / 30;
        });
        const exported = draw(element, 1280, 720);
        const image = await createImageBitmap(
          new Blob([decode(png64)], { type: 'image/png' }),
        );
        const preview = draw(image, 1280, 720);
        element.removeAttribute('src');
        element.load();
        let total = 0;
        for (let i = 0; i < exported.length; i += 4)
          for (let c = 0; c < 3; c++)
            total += Math.abs(exported[i + c]! - preview[i + c]!);
        const centre = (640 + 360 * 1280) * 4;
        return {
          mean: total / ((exported.length / 4) * 3),
          centre: [
            exported[centre]!,
            exported[centre + 1]!,
            exported[centre + 2]!,
          ],
          previewCentre: [
            preview[centre]!,
            preview[centre + 1]!,
            preview[centre + 2]!,
          ],
        };
      },
      { video64: video.toString('base64'), png64: png.toString('base64') },
    );
    expect(result.previewCentre).toEqual([255, 51, 102]);
    // Lossy video against the PNG: a small mean difference, the pulse's
    // colour within the codec's error.
    expect(result.mean).toBeLessThan(4);
    result.centre.forEach((value, index) =>
      expect(Math.abs(value - result.previewCentre[index]!)).toBeLessThan(24),
    );
  });
});
