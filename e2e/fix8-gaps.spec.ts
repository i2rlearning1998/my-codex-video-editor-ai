import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  settled,
  seekKeep,
} from './fixtures';

// FIX8: the editor gaps found in the ledger audit: tool shortcuts (KEY-015),
// safe-area overlays (CV-015) and hover scrub on video thumbnails (MED-012).
const MEDIA = 'tests/fixtures/media';
// A 64 × 64 GIF of three 100 ms frames: red, green, blue.
const RGB_GIF =
  'R0lGODlhQABAAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAQABAAAAIaQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh1KtKjRo0iTKl3KtKnTp1CjSp1KtarVq1izagUQEAAh+QQBCgABACwAAAAAQABAAIEA/wAAAAAAAAAAAAAIaQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh1KtKjRo0iTKl3KtKnTp1CjSp1KtarVq1izagUQEAAh+QQBCgABACwAAAAAQABAAIEAAP8AAAAAAAAAAAAIaQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh1KtKjRo0iTKl3KtKnTp1CjSp1KtarVq1izagUQEAA7';
const WEBM = 'video_testsrc_720p_2s_vp9_opus.webm';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

const layers = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers;

test('[KEY-015] V, T, R and E: select tool, add a text box, a rectangle and an ellipse', async ({
  page,
}) => {
  await page.locator('#composition-canvas').click({ position: { x: 5, y: 5 } });
  const before = (await layers(page)).length;
  await page.keyboard.press('r');
  let now = await layers(page);
  expect(now).toHaveLength(before + 1);
  const rect = now.at(-1)!;
  expect(rect.type).toBe('shape');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([rect.id]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  now = await layers(page);
  expect(now).toHaveLength(before + 2);
  expect(JSON.stringify(now.at(-1)!.properties)).toContain('ellipse');
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  now = await layers(page);
  expect(now).toHaveLength(before + 3);
  expect(now.at(-1)!.type).toBe('text');
  // V leaves a drawing brush.
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  expect((await hook(page)).session.drawBrush).toBeNull();
  // Typing in a field never triggers a tool.
  await page.locator('#project-name').click();
  await page.locator('#project-name-input').fill('r e t v');
  expect(await layers(page)).toHaveLength(before + 3);
});

test('[CV-015] the safe-area button cycles Off, margins and (tall scenes) social zones; the picture changes only while it is on', async ({
  page,
}) => {
  const button = page.locator('#safe-areas');
  const pixels = () =>
    page
      .locator('#composition-canvas')
      .evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 0;
        for (let i = 0; i < data.length; i += 97)
          hash = (hash * 31 + data[i]!) | 0;
        return hash;
      });
  await settled(page);
  const off = await pixels();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  const margins = await pixels();
  expect(margins).not.toBe(off);
  // A landscape scene has no social zones: the next click turns it off.
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await settled(page);
  expect(await pixels()).toBe(off);
  // Make the scene 9:16: Off -> margins -> social -> Off.
  await page.locator('#composition-canvas').click({ position: { x: 5, y: 5 } });
  await page.locator('[data-control="canvas-size"]').click();
  await page
    .locator('.toolbar-popover .canvas-size-preset[data-preset="vertical"]')
    .click();
  await settled(page);
  await button.click();
  await button.click();
  await expect(button).toHaveAttribute(
    'aria-label',
    /where a short-video app covers/,
  );
  await settled(page);
  await page.screenshot({ path: 'reports/fix8-safe-social.png' });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('[MED-012] moving across a video card scrubs its filmstrip: the left edge shows the first frame, the right edge the last', async ({
  page,
}) => {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(path.resolve(MEDIA, WEBM));
  const card = page.locator(`#media-panel .media-card[data-name="${WEBM}"]`);
  await expect(card).toHaveAttribute('data-thumbnail', 'ready');
  const thumb = card.locator('.media-thumb');
  const box = (await thumb.boundingBox())!;
  const y = box.y + box.height / 2;
  // The first move asks for the filmstrip; it shows once it is made.
  await page.mouse.move(box.x + 4, y);
  await expect
    .poll(
      async () => {
        await page.mouse.move(box.x + 5, y);
        return thumb.evaluate(
          (element) =>
            element.querySelector('.media-scrub')?.getAttribute('data-frame') ??
            null,
        );
      },
      { timeout: 20_000 },
    )
    .toBe('0');
  await page.mouse.move(box.x + box.width - 4, y);
  await expect(thumb.locator('.media-scrub')).toHaveAttribute(
    'data-frame',
    '11',
  );
  await page.screenshot({ path: 'reports/fix8-hover-scrub.png' });
  // Leaving the card puts the thumbnail back.
  await page.mouse.move(2, 2);
  await expect(thumb.locator('.media-scrub')).toHaveCount(0);
});

test('[VID-008] an animated GIF plays as a clip: a different picture at different times, and it repeats', async ({
  page,
}) => {
  await showCategory(page, 'Media');
  await page.locator('#import-media-input').setInputFiles({
    name: 'rgb.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from(RGB_GIF, 'base64'),
  });
  const card = page.locator('.media-card[data-name="rgb.gif"]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  const asset = (await hook(page)).project.assets.find(
    (item) => item.name === 'rgb.gif',
  )!;
  expect((asset.metadata as { gifLoop?: number }).gifLoop).toBeCloseTo(0.3, 2);
  await card.click();
  const centre = () =>
    page
      .locator('#composition-canvas')
      .evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas
          .getContext('2d')!
          .getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
        return [data[0]!, data[1]!, data[2]!] as [number, number, number];
      });
  const dominant = async () => {
    const [r, g, b] = (await centre()) as [number, number, number];
    return r > 150 && g < 100 && b < 100
      ? 'red'
      : g > 150 && r < 100 && b < 100
        ? 'green'
        : b > 150 && r < 100 && g < 100
          ? 'blue'
          : 'other';
  };
  const start = (await hook(page)).session.time;
  for (const [offset, colour] of [
    [0.02, 'red'],
    [0.15, 'green'],
    [0.25, 'blue'],
    [0.32, 'red'],
  ] as const) {
    await seekKeep(page, start + offset);
    await expect.poll(dominant, { timeout: 10_000 }).toBe(colour);
  }
});
