import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';
import { pickColor } from './controls';

// G3: marquee with a live highlight, pan and zoom, objects outside the
// artboard, and the scene bar. Default example (1280x720): badge 76,456
// 224x48; subtitle 76,570 680x70; headline 76,165 730x230.
type Matrix = [number, number, number, number, number, number];
async function view(page: Page): Promise<Matrix> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getCanvas(): { view: Matrix } };
        }
      ).__AIVE__.getCanvas().view,
  );
}
/** Composition point to page coordinates, through the live view. */
async function screen(page: Page, x: number, y: number) {
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  const [a, b, c, d, e, f] = await view(page);
  return { x: box.x + a * x + c * y + e, y: box.y + b * x + d * y + f };
}
/** Page coordinates back to a composition point. */
async function composition(page: Page, point: { x: number; y: number }) {
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  const [a, , , d, e, f] = await view(page);
  return { x: (point.x - box.x - e) / a, y: (point.y - box.y - f) / d };
}
/** Pixels of one colour in a composition-space rectangle. */
async function countColor(
  page: Page,
  rect: [number, number, number, number],
  rgb: [number, number, number],
) {
  const a = await screen(page, rect[0], rect[1]);
  const b = await screen(page, rect[2], rect[3]);
  return page.locator('#composition-canvas').evaluate(
    (canvas: HTMLCanvasElement, { a, b, rgb }) => {
      const box = canvas.getBoundingClientRect();
      const ratio = canvas.width / box.width;
      const { data } = canvas
        .getContext('2d')!
        .getImageData(
          Math.round((a.x - box.x) * ratio),
          Math.round((a.y - box.y) * ratio),
          Math.max(1, Math.round((b.x - a.x) * ratio)),
          Math.max(1, Math.round((b.y - a.y) * ratio)),
        );
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          Math.abs(data[i]! - rgb[0]) +
            Math.abs(data[i + 1]! - rgb[1]) +
            Math.abs(data[i + 2]! - rgb[2]) <
          40
        )
          count++;
      return count;
    },
    { a, b, rgb },
  );
}
const OUTLINE: [number, number, number] = [0xb7, 0xa2, 0xff];
const selectedIds = async (page: Page) =>
  (await hook(page)).session.selectedIds;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[CV-003][CV-046] a marquee from empty space outlines the layers it will select while it grows, then selects them', async ({
  page,
}) => {
  // Start left of the artboard (empty stage) and sweep over the badge and
  // the start of the subtitle.
  const start = await screen(page, -25, 440);
  const end = await screen(page, 330, 620);
  const badgeTop: [number, number, number, number] = [80, 450, 290, 460];
  expect(await countColor(page, badgeTop, OUTLINE)).toBe(0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  // Live: outlined before anything is selected.
  await expect
    .poll(() => countColor(page, badgeTop, OUTLINE))
    .toBeGreaterThan(20);
  expect(await selectedIds(page)).toEqual([]);
  await page.mouse.up();
  await expect
    .poll(() => selectedIds(page))
    .toEqual(expect.arrayContaining(['example-badge', 'example-subtitle']));
});

test('[CV-018][CV-047] Space-drag, the middle button, the hand tool and the wheel pan the view; Space alone still plays; Fit resets', async ({
  page,
}) => {
  const initial = await view(page);
  // H1.4 (CV-050): an artboard that fits never pans, so zoom in first.
  for (let i = 0; i < 3; i++)
    await page.locator('[data-canvas-zoom="in"]').click();
  const zoomed = await view(page);
  const middle = await screen(page, 640, 360);
  await page.mouse.move(middle.x, middle.y);
  // Space + drag pans and does not play or select.
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(middle.x + 100, middle.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  let now = await view(page);
  expect(now[4] - zoomed[4]).toBeCloseTo(100, 0);
  expect(now[5] - zoomed[5]).toBeCloseTo(50, 0);
  expect((await hook(page)).session.playing).toBe(false);
  expect(await selectedIds(page)).toEqual([]);
  // Space pressed without a drag still plays and pauses.
  await page.keyboard.press('Space');
  await expect.poll(async () => (await hook(page)).session.playing).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await hook(page)).session.playing).toBe(false);
  // The middle button pans.
  let from = await view(page);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(middle.x - 40, middle.y + 30, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  now = await view(page);
  expect(now[4] - from[4]).toBeCloseTo(-40, 0);
  expect(now[5] - from[5]).toBeCloseTo(30, 0);
  // The hand tool: a plain drag pans instead of moving a layer.
  const layers = JSON.stringify((await hook(page)).project);
  await page.locator('[data-canvas-tool="hand"]').click();
  await expect(page.locator('[data-canvas-tool="hand"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  from = await view(page);
  const headline = await screen(page, 300, 250);
  await page.mouse.move(headline.x, headline.y);
  await page.mouse.down();
  await page.mouse.move(headline.x + 60, headline.y, { steps: 4 });
  await page.mouse.up();
  now = await view(page);
  expect(now[4] - from[4]).toBeCloseTo(60, 0);
  expect(JSON.stringify((await hook(page)).project)).toBe(layers);
  // H turns the hand tool off again.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('h');
  await expect(page.locator('[data-canvas-tool="hand"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // The wheel (a trackpad scroll) pans; Shift scrolls sideways.
  from = await view(page);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.wheel(0, 80);
  await expect
    .poll(async () => (await view(page))[5])
    .toBeCloseTo(from[5] - 80, 0);
  from = await view(page);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 70);
  await page.keyboard.up('Shift');
  await expect
    .poll(async () => (await view(page))[4])
    .toBeCloseTo(from[4] - 70, 0);
  // Fit returns to the starting view, pan included.
  await page.locator('[data-canvas-zoom="fit"]').click();
  expect(await view(page)).toEqual(initial);
});

test('[CV-016][CV-017] Ctrl+wheel zooms toward the pointer; buttons, the % field, 100%, Fill and the shortcuts zoom around the center', async ({
  page,
}) => {
  const initial = await view(page);
  const pointer = await screen(page, 300, 200);
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect
    .poll(async () => (await view(page))[0])
    .toBeGreaterThan(initial[0] * 1.5);
  // The composition point under the pointer did not move.
  // (Within one screen pixel: the pointer sits on whole pixels.)
  const under = await composition(page, pointer);
  const pixel = 1 / (await view(page))[0];
  expect(Math.abs(under.x - 300)).toBeLessThanOrEqual(pixel);
  expect(Math.abs(under.y - 200)).toBeLessThanOrEqual(pixel);
  // The zoom-in button keeps the view's center fixed.
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const before = await composition(page, center);
  const scale = (await view(page))[0];
  await page.locator('[data-canvas-zoom="in"]').click();
  expect((await view(page))[0]).toBeCloseTo(scale * 1.25, 5);
  const after = await composition(page, center);
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.y).toBeCloseTo(before.y, 1);
  // The % field: 100 means one composition pixel per screen pixel.
  const field = page.locator('#canvas-zoom-percent');
  await field.fill('100');
  await field.press('Enter');
  await expect.poll(async () => (await view(page))[0]).toBeCloseTo(1, 5);
  await expect(field).toHaveValue('100');
  // Ctrl+0 fits (and resets the pan); 100% and Ctrl+= zoom in again.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+0');
  expect(await view(page)).toEqual(initial);
  await page.locator('[data-canvas-zoom="actual"]').click();
  expect((await view(page))[0]).toBeCloseTo(1, 5);
  await page.keyboard.press('Control+0');
  await page.keyboard.press('Control+=');
  expect((await view(page))[0]).toBeCloseTo(initial[0] * 1.25, 5);
  // Fill (from the palette): the composition covers the whole view.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Zoom to fill');
  await page.keyboard.press('Enter');
  const [a, , , , e, f] = await view(page);
  expect(e).toBeLessThanOrEqual(0.5);
  expect(f).toBeLessThanOrEqual(0.5);
  expect(e + 1280 * a).toBeGreaterThanOrEqual(box.width - 0.5);
  expect(f + 720 * a).toBeGreaterThanOrEqual(box.height - 0.5);
});

test('[CV-047] a layer moved outside the artboard shows faintly and stays selectable', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  const x = page.locator('#inspector-x');
  await x.fill('-240');
  await x.press('Enter');
  // Zoom out so the space left of the artboard is visible.
  await page.locator('[data-canvas-zoom="out"]').click();
  await page.locator('[data-canvas-zoom="out"]').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect.poll(() => selectedIds(page)).toEqual([]);
  // The badge is drawn at 30% outside the artboard: its area differs from
  // an empty spot outside the artboard.
  const differing = async (rect: [number, number, number, number]) => {
    const a = await screen(page, rect[0], rect[1]);
    const b = await screen(page, rect[2], rect[3]);
    const empty = await screen(page, -130, 380);
    return page.locator('#composition-canvas').evaluate(
      (canvas: HTMLCanvasElement, { a, b, empty }) => {
        const box = canvas.getBoundingClientRect();
        const ratio = canvas.width / box.width;
        const context = canvas.getContext('2d')!;
        const reference = context.getImageData(
          Math.round((empty.x - box.x) * ratio),
          Math.round((empty.y - box.y) * ratio),
          1,
          1,
        ).data;
        const { data } = context.getImageData(
          Math.round((a.x - box.x) * ratio),
          Math.round((a.y - box.y) * ratio),
          Math.max(1, Math.round((b.x - a.x) * ratio)),
          Math.max(1, Math.round((b.y - a.y) * ratio)),
        );
        let count = 0;
        for (let i = 0; i < data.length; i += 4)
          if (
            Math.abs(data[i]! - reference[0]!) +
              Math.abs(data[i + 1]! - reference[1]!) +
              Math.abs(data[i + 2]! - reference[2]!) +
              Math.abs(data[i + 3]! - reference[3]!) >
            12
          )
            count++;
        return count;
      },
      { a, b, empty },
    );
  };
  await expect
    .poll(() => differing([-230, 465, -30, 495]))
    .toBeGreaterThan(100);
  // Far from any layer, nothing is drawn outside the artboard.
  expect(await differing([-230, 300, -30, 330])).toBe(0);
  const point = await screen(page, -130, 480);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => selectedIds(page)).toEqual(['example-badge']);
});

test('[CV-048][PRJ-006] with nothing selected the toolbar is the scene bar: background, scene length and a disabled Animate', async ({
  page,
  openFixtureProject,
}) => {
  // nle-example: clips 0-2 s, 3-5 s (video, source 1-3 s of 6 s) and 1-4 s.
  await openFixtureProject('nle-example.json');
  const bar = page.locator('#context-toolbar');
  await expect(bar).toHaveAttribute('data-kind', 'scene');
  await expect(bar).toContainText('Main composition');
  // Animate is not built for scenes yet and says which wave builds it.
  await expect(bar.locator('[data-control="scene-animate"]')).toHaveAttribute(
    'title',
    'Not built yet: planned for Wave 8 (ANI-020)',
  );
  // Background: one undo step, applied to the project (every scene).
  await pickColor(page, 'toolbar-background', '#223344');
  let project = (await hook(page)).project;
  expect(project.settings.backgroundColor).toBe('#223344');
  expect((await hook(page)).history.labels.at(-1)).toBe('Set background');
  // Scene length: a longer scene extends the clips that end with it.
  const length = page.locator('#toolbar-scene-length');
  const duration = project.compositions[0]!.duration;
  await expect(length).toHaveValue(String(Math.round(duration * 100) / 100));
  await length.fill(String(duration + 3));
  await length.press('Enter');
  expect((await hook(page)).history.labels.at(-1)).toBe('Set scene length');
  project = (await hook(page)).project;
  expect(project.compositions[0]!.duration).toBeCloseTo(duration + 3, 5);
  await expect(length).toHaveValue(
    String(Math.round((duration + 3) * 100) / 100),
  );
  // Shorter than a layer's start (clip B at 3 s) is refused with a message.
  await length.fill('2');
  await length.press('Enter');
  await expect(page.locator('.toast-error')).toContainText('starts at');
  expect((await hook(page)).project.compositions[0]!.duration).toBeCloseTo(
    duration + 3,
    5,
  );
  // Undo restores the previous length.
  await page.keyboard.press('Control+z');
  expect((await hook(page)).project.compositions[0]!.duration).toBeCloseTo(
    duration,
    5,
  );
});
