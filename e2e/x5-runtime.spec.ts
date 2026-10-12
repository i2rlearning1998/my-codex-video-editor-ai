import { readFileSync, writeFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import {
  test,
  expect,
  hook,
  menuAction,
  openRight,
  seekKeep,
  showCategory,
} from './fixtures';

// X5 (CODE-TIERS-SPEC sections 4 and 6): the real sandboxed Tier C runtime
// (Codex's src/freecode) in the editor: the ten reference samples end to end.
// Hostile and heavy sources and templates across a reload: x5-security.
const SAMPLES = [
  'particles',
  'three-scene',
  'pixi-field',
  'lottie-mark',
  'aurora',
  'shader',
  'typography',
  'svg-infographic',
  'chart',
  'parallax',
] as const;
const WEBGL = new Set(['three-scene', 'pixi-field', 'shader']);
const sample = (id: string) =>
  readFileSync(`src/freecode/samples/${id}.txt`, 'utf8');
const dialog = (page: Page) => page.locator('.code-import-dialog');
const panel = (page: Page) => page.locator('#right-section');

interface CodeDebug {
  layerId: string;
  state: string;
  stored: number;
  total: number;
  error: string | null;
}
const codeDebug = async (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getMedia(): { code: CodeDebug[] } };
        }
      ).__AIVE__.getMedia().code,
  );
const baked = (page: Page, timeout = 240_000) =>
  expect
    .poll(async () => (await codeDebug(page))[0]?.state, { timeout })
    .toBe('done');

/** A blank 1080p project at 24 fps (only the code layer is measured). */
async function newProject(page: Page) {
  await menuAction(page, '#new-project');
  const form = page.getByRole('dialog', { name: 'New project' });
  await form.getByLabel('Aspect ratio', { exact: true }).selectOption('16:9');
  await form.getByLabel('Resolution', { exact: true }).selectOption('1080p');
  await form.getByLabel('Frame rate', { exact: true }).selectOption('24');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.layers.length)
    .toBe(0);
}
async function importCode(page: Page, source: string) {
  await showCategory(page, 'Media');
  await page.locator('#import-menu').click();
  await page.locator('#import-code').click();
  await dialog(page).locator('#code-source').fill(source);
}
async function addCode(page: Page, source: string, save = false) {
  await importCode(page, source);
  await expect(dialog(page).locator('#code-tier')).toHaveText(
    'Tier C · Full mode',
    { timeout: 60_000 },
  );
  await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
    'data-ready',
    'true',
    { timeout: 60_000 },
  );
  if (!save) await dialog(page).locator('#code-save-template').uncheck();
  await dialog(page).locator('#code-add').click();
  await expect(dialog(page)).toBeHidden();
}
/** The artboard as drawn (composition pixels at 100 %), as RGBA. */
async function previewRegion(page: Page) {
  return page.evaluate(() => {
    const [a, , , d, e, f] = (
      window as unknown as { __AIVE__: { getCanvas(): { view: number[] } } }
    ).__AIVE__.getCanvas().view as number[];
    const canvas = document.querySelector<HTMLCanvasElement>(
      '#composition-canvas',
    )!;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    const scale = a! * ratio;
    const x0 = Math.max(0, Math.ceil(-e! / a!)),
      y0 = Math.max(0, Math.ceil(-f! / d!));
    const x1 = Math.min(1920, Math.floor((canvas.width / ratio - e!) / a!)),
      y1 = Math.min(1080, Math.floor((canvas.height / ratio - f!) / d!));
    const data = canvas
      .getContext('2d')!
      .getImageData(
        Math.round(e! * ratio + x0 * scale),
        Math.round(f! * ratio + y0 * scale),
        x1 - x0,
        y1 - y0,
      ).data;
    // The pixels stay in the page (for compare); a hash comes back.
    (window as unknown as { __x5Region: Uint8ClampedArray }).__x5Region = data;
    let hash = 0;
    for (let i = 0; i < data.length; i += 97)
      hash = (Math.imul(hash, 31) + data[i]!) | 0;
    return { x0, y0, w: x1 - x0, h: y1 - y0, scale, hash };
  });
}
async function exportFrame(page: Page, testInfo: TestInfo) {
  await page.locator('#export').click();
  await expect(page.locator('.modal-dialog #export-format')).not.toHaveText(
    /Checking/,
  );
  const saving = page.waitForEvent('download', { timeout: 240_000 });
  await page.locator('.modal-dialog #export-png').click();
  const file = testInfo.outputPath(`frame-${Date.now()}.png`);
  await (await saving).saveAs(file);
  return readFileSync(file);
}
/** Max and mean channel difference of the preview region and a PNG frame. */
async function compare(
  page: Page,
  png: Buffer,
  region: Awaited<ReturnType<typeof previewRegion>>,
) {
  return page.evaluate(
    async ({ png64, region }) => {
      const bytes = Uint8Array.from(atob(png64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const preview = (window as unknown as { __x5Region: Uint8ClampedArray })
        .__x5Region;
      const frame = context.getImageData(
        region.x0,
        region.y0,
        region.w,
        region.h,
      ).data;
      let max = 0,
        total = 0,
        over = 0;
      const box = [Infinity, Infinity, -1, -1];
      for (let i = 0; i < frame.length; i += 4)
        for (let c = 0; c < 3; c++) {
          const delta = Math.abs(frame[i + c]! - preview[i + c]!);
          total += delta;
          if (delta > max) max = delta;
          if (delta > 1) {
            over++;
            const x = (i / 4) % region.w,
              y = Math.floor(i / 4 / region.w);
            box[0] = Math.min(box[0]!, x);
            box[1] = Math.min(box[1]!, y);
            box[2] = Math.max(box[2]!, x);
            box[3] = Math.max(box[3]!, y);
          }
        }
      return { max, mean: total / ((frame.length / 4) * 3), over, box };
    },
    { png64: png.toString('base64'), region },
  );
}

test.describe('X5 real Tier C runtime', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
  });

  for (const id of SAMPLES)
    test(`[CODE-011] ${id}: import, bake, play, scrub, a param change, Fade and an effect, export matches the preview`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(600_000);
      await newProject(page);
      await addCode(page, sample(id));
      await baked(page);
      const before = (await codeDebug(page))[0]!;
      expect(before.stored).toBe(before.total);
      expect(before.total).toBe(Math.ceil(4 * 24));
      // Play, then pause.
      await page.locator('[data-action="play"]').click();
      await expect
        .poll(async () => (await hook(page)).session.time)
        .toBeGreaterThan(0.3);
      await page.locator('[data-action="play"]').click();
      // Scrub: two times draw two different frames.
      await seekKeep(page, 0.5);
      const early = await previewRegion(page);
      await seekKeep(page, 3);
      const late = await previewRegion(page);
      expect(early.hash).not.toBe(late.hash);
      // A param change (Apply re-bakes, one step).
      await page.locator('.timeline-clip[data-code="true"]').click();
      await openRight(page, 'Code');
      const speed = panel(page).locator('#code-setting-speed');
      await speed.fill('1.5');
      await speed.press('Enter');
      await panel(page).locator('#code-apply').click();
      await expect
        .poll(async () => (await hook(page)).history.labels.at(-1))
        .toBe('Animation settings');
      await baked(page);
      // Fade in over 1 s and an effect.
      await openRight(page, 'Fade');
      const fade = panel(page).locator('#right-fade-in');
      await fade.fill('1');
      await fade.press('Enter');
      await openRight(page, 'Effects');
      await panel(page)
        .locator('.fx-tile[data-tile="effect.color-shift"]')
        .click();
      // Preview at 100 % against the exported frame (PNG, the export's own
      // drawing of the same baked frames) at 2 s.
      await seekKeep(page, 2);
      // No selection box or hover outline over the measured picture.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect
        .poll(async () => (await hook(page)).session.selectedIds.length)
        .toBe(0);
      await page.locator('#canvas-zoom-percent').fill('100');
      await page.locator('#canvas-zoom-percent').press('Enter');
      // At 100 % one composition pixel is one canvas pixel; a pan by the
      // fraction puts the artboard on whole pixels, so nothing is resampled.
      const view = () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __AIVE__: { getCanvas(): { view: number[] } };
              }
            ).__AIVE__.getCanvas().view,
        );
      const [, , , , e0, f0] = await view();
      const box = (await page.locator('#composition-canvas').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(e0! - Math.floor(e0!), f0! - Math.floor(f0!));
      await page.mouse.move(2, 2);
      await expect
        .poll(async () => {
          const [a, , , , e, f] = await view();
          return [a, e! % 1, f! % 1].map((v) =>
            Math.abs(Math.round(v! * 1000) / 1000),
          );
        })
        .toEqual([1, 0, 0]);
      const region = await previewRegion(page);
      expect(region.w * region.h).toBeGreaterThan(100_000);
      const png = await exportFrame(page, testInfo);
      const still = await compare(page, png, region);
      // The video export of a short range (lossy codec): frame at 2 s.
      const more = page.locator('.modal-dialog #export-more');
      if ((await more.getAttribute('open')) === null)
        await more.locator('summary').click();
      for (const [field, value] of [
        ['#export-start', '1.5'],
        ['#export-end', '2.5'],
      ] as const) {
        await page.locator(`.modal-dialog ${field}`).fill(value);
        await page.locator(`.modal-dialog ${field}`).press('Enter');
      }
      const downloading = page.waitForEvent('download', { timeout: 300_000 });
      await page.locator('.modal-dialog #export-start-button').click();
      const download = await downloading;
      const file = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(file);
      const fps = (await hook(page)).project.compositions[0]!.fps;
      const video = await page.evaluate(
        async ({ video64, png64, fps }) => {
          const decode = (base64: string) =>
            Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const element = document.createElement('video');
          element.muted = true;
          element.preload = 'auto';
          element.src = URL.createObjectURL(new Blob([decode(video64)]));
          await new Promise((resolve) => (element.onloadeddata = resolve));
          const started = performance.now();
          while (
            !(
              element.buffered.length &&
              element.buffered.end(element.buffered.length - 1) >=
                element.duration - 0.05
            ) &&
            performance.now() - started < 10_000
          )
            await new Promise((resolve) => setTimeout(resolve, 20));
          await new Promise((resolve) => {
            element.onseeked = resolve;
            // 2 s is half a second into the range (the middle of its frame).
            element.currentTime = (Math.round(0.5 * fps) + 0.5) / fps;
          });
          const draw = (source: CanvasImageSource) => {
            const canvas = new OffscreenCanvas(480, 270);
            const context = canvas.getContext('2d')!;
            context.drawImage(source, 0, 0, 480, 270);
            return context.getImageData(0, 0, 480, 270).data;
          };
          const exported = draw(element);
          const still = draw(
            await createImageBitmap(new Blob([decode(png64)])),
          );
          element.removeAttribute('src');
          element.load();
          let total = 0;
          for (let i = 0; i < exported.length; i += 4)
            for (let c = 0; c < 3; c++)
              total += Math.abs(exported[i + c]! - still[i + c]!);
          return { mean: total / ((exported.length / 4) * 3) };
        },
        {
          video64: readFileSync(file).toString('base64'),
          png64: png.toString('base64'),
          fps,
        },
      );
      const measured = {
        id,
        webgl: WEBGL.has(id),
        frames: before.total,
        previewVsExportFrame: still,
        videoVsExportFrameMean: video.mean,
      };
      console.log(`X5-MEASURE ${JSON.stringify(measured)}`);
      writeFileSync(
        testInfo.outputPath('measure.json'),
        JSON.stringify(measured),
      );
      // Spec section 6: within 1/255 (2/255 for WebGL) per channel.
      expect(still.max).toBeLessThanOrEqual(WEBGL.has(id) ? 2 : 1);
      // A lossy codec: a small mean difference.
      expect(video.mean).toBeLessThan(8);
    });
});
