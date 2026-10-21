import { readFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import {
  test,
  expect,
  hook,
  openRight,
  seekKeep,
  showCategory,
} from './fixtures';

// X3 (CODE-TIERS-SPEC section 5): Animation settings of a code layer, and
// the clip tools on it in the preview and the export.
const panel = (page: Page) => page.locator('#right-section');
interface CodeDebug {
  state: string;
  stored: number;
  total: number;
  quality: string;
}
const codeDebug = async (page: Page) =>
  (
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: { getMedia(): { code: CodeDebug[] } };
          }
        ).__AIVE__.getMedia().code,
    )
  ) // (The bake may not be listed for a frame after Add: not started yet.)
  [0] ?? ({ state: 'pending' } as unknown as CodeDebug);
const baked = (page: Page) =>
  expect
    .poll(async () => (await codeDebug(page)).state, { timeout: 30_000 })
    .toBe('done');
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
/** A pixel of the exported frame (Export frame: the export's own drawing). */
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
      const data = context.getImageData(x, y, 1, 1).data;
      return [data[0]!, data[1]!, data[2]!];
    },
    { png64: readFileSync(file).toString('base64'), x, y },
  );
}
const PINK = [255, 51, 102];
const isPink = (rgb: number[]) =>
  rgb.every((value, index) => Math.abs(value - PINK[index]!) <= 2);
const grey = (rgb: number[]) =>
  Math.max(...rgb) - Math.min(...rgb) <= 3 && rgb[0]! > 20;

async function openPulse(page: Page, open: (name: string) => Promise<void>) {
  await open('code-layer.json');
  await baked(page);
  await page.locator('.timeline-clip[data-code="true"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['code-layer']);
}

test.describe('X3 code animation settings', () => {
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

  test('[CODE-006] Tier B: a param change re-renders as one undo step; Draft and Full quality', async ({
    page,
    openFixtureProject,
  }) => {
    await openPulse(page, openFixtureProject);
    await openRight(page, 'Code');
    await expect(panel(page).locator('.code-tier')).toHaveText(
      'Tier B · Block',
    );
    // At 0 s the pulse's radius is 90 px: 200 px right of the centre is
    // background.
    expect(isPink(await pixelAt(page, 1160, 540))).toBe(false);
    const before = (await hook(page)).project.compositions[0]!.layers[0]!.code!
      .bakeKey;
    const radius = panel(page).locator('#code-setting-radius');
    await radius.fill('300');
    await radius.press('Enter');
    await expect
      .poll(async () => (await hook(page)).history.labels.at(-1))
      .toBe('Animation settings');
    const after = (await hook(page)).project.compositions[0]!.layers[0]!.code!;
    expect(after.params).toEqual({ color: '#ff3366', radius: 300 });
    expect(after.bakeKey).not.toBe(before);
    await baked(page);
    await expect
      .poll(async () => isPink(await pixelAt(page, 1160, 540)))
      .toBe(true);
    await page.keyboard.press('Control+z');
    await expect
      .poll(
        async () =>
          (await hook(page)).project.compositions[0]!.layers[0]!.code!.bakeKey,
      )
      .toBe(before);
    // Draft renders at half size; Full again uses the stored frames.
    await openRight(page, 'Code');
    await panel(page).locator('[data-quality="draft"]').click();
    await expect
      .poll(async () => (await codeDebug(page)).quality)
      .toBe('draft');
    await baked(page);
    await expect
      .poll(async () => isPink(await pixelAt(page, 960, 540)))
      .toBe(true);
    await panel(page).locator('[data-quality="full"]').click();
    await expect.poll(async () => (await codeDebug(page)).quality).toBe('full');
    await baked(page);
  });

  test('[CODE-006] Tier C: a param change waits for Apply, then re-bakes in one step', async ({
    page,
  }) => {
    await showCategory(page, 'Media');
    await showCategory(page, 'AI');
    await page.locator('#ai-import').click();
    await page
      .locator('.code-import-dialog #ai-import-source')
      .fill(readFileSync('tests/fixtures/code/orbit-free.js', 'utf8'));
    await expect(
      page.locator('.code-import-dialog #ai-import-add'),
    ).toBeEnabled();
    await page.locator('.code-import-dialog #ai-import-add').click();
    await baked(page);
    await openRight(page, 'Code');
    await expect(panel(page).locator('.code-notice')).toHaveText(/Full mode/);
    const apply = panel(page).locator('#code-apply');
    await expect(apply).toBeDisabled();
    const steps = (await hook(page)).history.labels.length;
    const count = panel(page).locator('#code-setting-count');
    await count.fill('3');
    await count.press('Enter');
    await expect(apply).toBeEnabled();
    expect((await hook(page)).history.labels.length).toBe(steps);
    await apply.click();
    await expect
      .poll(async () => (await hook(page)).history.labels.at(-1))
      .toBe('Animation settings');
    expect((await hook(page)).history.labels.length).toBe(steps + 1);
    const code = (await hook(page)).project.compositions[0]!.layers.find(
      (l) => l.code,
    )!.code!;
    expect(code.params).toEqual({ color: '#22cc88', count: 3 });
    await baked(page);
    await expect(panel(page).locator('#code-apply')).toBeDisabled();
  });

  test('[CODE-007] Fade, Speed and Reverse change the code layer in the preview and the export', async ({
    page,
    openFixtureProject,
  }, testInfo) => {
    await openPulse(page, openFixtureProject);
    expect(isPink(await pixelAt(page, 960, 540))).toBe(true);
    // Fade in over 1 s: at 0 s the layer is invisible.
    await openRight(page, 'Fade');
    const fade = panel(page).locator('#right-fade-in');
    await fade.fill('1');
    await fade.press('Enter');
    await expect
      .poll(async () => isPink(await pixelAt(page, 960, 540)))
      .toBe(false);
    expect(isPink(await exportedPixel(page, testInfo, 960, 540))).toBe(false);
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => isPink(await pixelAt(page, 960, 540)))
      .toBe(true);
    // Reverse: at 0 s the last frame shows (radius 180 px).
    await page.locator('.timeline-clip[data-code="true"]').click();
    await openRight(page, 'Speed');
    await panel(page).locator('[data-action="right-reverse"]').click();
    await expect
      .poll(async () => isPink(await pixelAt(page, 1110, 540)))
      .toBe(true);
    expect(isPink(await exportedPixel(page, testInfo, 1110, 540))).toBe(true);
    // Speed 2x: the clip lasts 1 s.
    await panel(page).locator('[data-speed="2"]').click();
    await expect
      .poll(
        async () =>
          (await hook(page)).project.compositions[0]!.tracks.flatMap(
            (track) => track.clips,
          ).find((clip) => clip.layerId === 'code-layer')!.duration,
      )
      .toBeCloseTo(1, 6);
  });

  test('[CODE-007] Filters, Effects and Adjust colors change the code layer in the preview and the export', async ({
    page,
    openFixtureProject,
  }, testInfo) => {
    await openPulse(page, openFixtureProject);
    await openRight(page, 'Filters');
    await panel(page).locator('.fx-tile[data-tile="black-white-1"]').click();
    await expect
      .poll(async () => grey(await pixelAt(page, 960, 540)))
      .toBe(true);
    expect(grey(await exportedPixel(page, testInfo, 960, 540))).toBe(true);
    await panel(page).locator('.fx-tile[data-tile="none"]').click();
    await expect
      .poll(async () => isPink(await pixelAt(page, 960, 540)))
      .toBe(true);
    // An effect: Vaporwave adds noise and a tint over the pulse, in both
    // drawings.
    await openRight(page, 'Effects');
    const exportedBefore = await exportedPixel(page, testInfo, 960, 540);
    await panel(page).locator('.fx-tile[data-tile="effect.vaporwave"]').click();
    await expect
      .poll(async () => JSON.stringify(await pixelAt(page, 960, 540)))
      .not.toBe(JSON.stringify(PINK));
    const exportedAfter = await exportedPixel(page, testInfo, 960, 540);
    expect(JSON.stringify(exportedAfter)).not.toBe(
      JSON.stringify(exportedBefore),
    );
    await page.keyboard.press('Control+z');
    // Adjust colors: exposure -100 darkens.
    await openRight(page, 'Adjust');
    const exposure = panel(page).locator('#right-adjust-exposure');
    await exposure.fill('-100');
    await exposure.dispatchEvent('change');
    const sum = (rgb: number[]) => rgb.reduce((a, b) => a + b, 0);
    await expect
      .poll(async () => sum(await pixelAt(page, 960, 540)))
      .toBeLessThan(sum(PINK) - 60);
    expect(sum(await exportedPixel(page, testInfo, 960, 540))).toBeLessThan(
      sum(PINK) - 60,
    );
  });

  test('[CODE-007] a transition across a cut of a code clip shows in the preview and the export', async ({
    page,
    openFixtureProject,
  }, testInfo) => {
    await openPulse(page, openFixtureProject);
    await seekKeep(page, 1);
    await page.locator('[data-action="split"]').click();
    const clips = (await hook(page)).project.compositions[0]!.tracks.flatMap(
      (track) => track.clips,
    ).sort((a, b) => a.startTime - b.startTime);
    expect(clips).toHaveLength(2);
    const second = clips[1]!;
    await page
      .locator(`#timeline-foundation .transition-add[data-id="${second.id}"]`)
      .click();
    // Fade through black is darkest at the cut.
    await seekKeep(page, 1);
    const sum = (rgb: number[]) => rgb.reduce((a, b) => a + b, 0);
    await expect
      .poll(async () => sum(await pixelAt(page, 960, 540)))
      .toBeLessThan(30);
    expect(sum(await exportedPixel(page, testInfo, 960, 540))).toBeLessThan(30);
  });
});
