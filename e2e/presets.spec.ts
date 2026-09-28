import type { Page } from '@playwright/test';
import { test, expect, hook, artboard, rulerBox } from './fixtures';

// Default example: shape "example-badge" at 76,456 (224×48, #cbbced) over the
// artboard (#f0eee7); text "example-headline" (fill #272b29, size 78). Clips run
// 0..10 s. nle-example: image layer-c 300..700 × 400..625 (#4ad990, 1..4 s).
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function toScreen(page: Page, x: number, y: number) {
  let board = boards.get(page);
  if (!board) boards.set(page, (board = await artboard(page)));
  return { x: board.x + x * board.scale, y: board.y + y * board.scale };
}
async function pixel(page: Page, x: number, y: number) {
  const at = await toScreen(page, x, y);
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement, point) => {
    const box = canvas.getBoundingClientRect();
    const ratio = canvas.width / box.width;
    return [
      ...canvas
        .getContext('2d')!
        .getImageData(
          Math.round((point.x - box.x) * ratio),
          Math.round((point.y - box.y) * ratio),
          1,
          1,
        ).data,
    ].slice(0, 3);
  }, at);
}
/** Dark (text) pixels inside a composition rectangle. */
async function darkPixels(page: Page, rect: [number, number, number, number]) {
  const a = await toScreen(page, rect[0], rect[1]);
  const b = await toScreen(page, rect[2], rect[3]);
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, { a, b }) => {
      const box = canvas.getBoundingClientRect();
      const ratio = canvas.width / box.width;
      const x = Math.round((a.x - box.x) * ratio),
        y = Math.round((a.y - box.y) * ratio);
      const { data } = canvas
        .getContext('2d')!
        .getImageData(
          x,
          y,
          Math.round((b.x - a.x) * ratio),
          Math.round((b.y - a.y) * ratio),
        );
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i]! + data[i + 1]! + data[i + 2]! < 300) count++;
      return count;
    },
    { a, b },
  );
}
const near = (actual: number[], expected: number[], tolerance = 6) =>
  actual.every(
    (value, index) => Math.abs(value - expected[index]!) <= tolerance,
  );
const LAVENDER = [0xcb, 0xbb, 0xed];
const PAPER = [0xf0, 0xee, 0xe7];
async function seek(page: Page, seconds: number) {
  const box = await rulerBox(page);
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.click(box.x + seconds * zoom, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
async function select(page: Page, id: string) {
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([id]);
}
const panel = (page: Page) => page.locator('#animate-panel');
async function openAnimate(page: Page) {
  await page.locator('#context-toolbar [data-control="animate"]').click();
  await expect(panel(page)).toBeVisible();
}
async function choose(page: Page, tab: string, preset: string) {
  await panel(page).locator(`[data-tab="${tab}"]`).click();
  await panel(page).locator(`[data-preset="${preset}"]`).click();
  await expect(
    panel(page).locator(`[data-preset="${preset}"]`),
  ).toHaveAttribute('aria-pressed', 'true');
}
async function setNumber(page: Page, id: string, value: string) {
  await panel(page).locator(`#${id}`).fill(value);
  await panel(page).locator(`#${id}`).press('Enter');
}
const animationOf = async (page: Page, layerId: string) =>
  (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((clip) => clip.layerId === layerId)!.metadata.animation;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[ANI-007] one click fades a layer in; duration is adjustable; undo removes it', async ({
  page,
}, testInfo) => {
  await select(page, 'example-badge');
  await openAnimate(page);
  await page.screenshot({ path: testInfo.outputPath('animate-panel.png') });
  await choose(page, 'in', 'fade');
  await setNumber(page, 'animate-duration', '1');
  expect(await animationOf(page, 'example-badge')).toEqual({
    in: { preset: 'fade', duration: 1 },
  });
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  // The badge is half-transparent early in the fade and solid after it.
  await seek(page, 0.25);
  const early = await pixel(page, 200, 462);
  expect(near(early, LAVENDER)).toBe(false);
  expect(near(early, PAPER)).toBe(false);
  await seek(page, 1.5);
  expect(near(await pixel(page, 200, 462), LAVENDER)).toBe(true);
  // A longer fade is less visible at the same time.
  await seek(page, 0.25);
  await openAnimate(page);
  await setNumber(page, 'animate-duration', '3');
  await page.keyboard.press('Escape');
  const slower = await pixel(page, 200, 462);
  expect(slower[2]! - PAPER[2]!).toBeLessThan(early[2]! - PAPER[2]!);
  // The clip shows an animation badge; each change was one undo step.
  await expect(
    page.locator('.timeline-clip [data-badge="animation"]'),
  ).toHaveCount(1);
  expect((await hook(page)).history.labels).toEqual([
    'Set animation',
    'Set animation',
    'Set animation',
  ]);
  for (let i = 0; i < 3; i++) await page.locator('#undo').click();
  expect(await animationOf(page, 'example-badge')).toBeUndefined();
  expect(near(await pixel(page, 200, 462), LAVENDER)).toBe(true);
});

test('[ANI-007] slide out, pulse loop and typewriter, and presets follow a trimmed clip', async ({
  page,
}) => {
  await select(page, 'example-badge');
  await openAnimate(page);
  await choose(page, 'out', 'slide');
  await page.locator('#animate-direction').selectOption('up');
  // Near the end the badge has left its resting place moving up.
  await seek(page, 9.9);
  expect(near(await pixel(page, 200, 495), PAPER, 10)).toBe(true);
  await seek(page, 5);
  expect(near(await pixel(page, 200, 495), LAVENDER)).toBe(true);
  // The Out preset follows the clip end when the clip is trimmed to 5 s.
  await page.locator('[data-subtab="Timing"]').click();
  const duration = page.locator(
    '#inspector-content input[aria-label="Duration"]',
  );
  await duration.fill('5');
  await duration.press('Enter');
  await seek(page, 4.95);
  expect(near(await pixel(page, 200, 495), PAPER, 10)).toBe(true);
  // Pulse loop: the size changes over time (an edge pixel comes and goes).
  await openAnimate(page);
  await choose(page, 'out', 'none');
  await choose(page, 'loop', 'pulse');
  await setNumber(page, 'animate-period', '1');
  await page.keyboard.press('Escape');
  // Deselect so the selection outline does not cover the sampled edge.
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([]);
  await seek(page, 2.25);
  const big = await pixel(page, 78, 458);
  await seek(page, 2.75);
  const small = await pixel(page, 78, 458);
  expect(near(big, LAVENDER)).toBe(true);
  expect(near(small, PAPER, 10)).toBe(true);
  // Typewriter on the headline: half-way, the second line is not drawn yet.
  await select(page, 'example-headline');
  await openAnimate(page);
  await choose(page, 'in', 'typewriter');
  await setNumber(page, 'animate-duration', '2');
  await page.keyboard.press('Escape');
  await seek(page, 2.5);
  const full = await darkPixels(page, [300, 270, 700, 350]);
  await seek(page, 0.6);
  expect(await darkPixels(page, [300, 270, 700, 350])).toBeLessThan(full / 4);
  expect(full).toBeGreaterThan(200);
});

test('[ANI-008] Ken Burns slowly zooms and pans an image clip', async ({
  page,
  openFixtureProject,
}, testInfo) => {
  await openFixtureProject('nle-example.json');
  // Pan & zoom is offered for images only.
  await select(page, 'layer-a');
  await openAnimate(page);
  await expect(panel(page).locator('[data-tab="kenBurns"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await select(page, 'layer-c');
  await openAnimate(page);
  await choose(page, 'kenBurns', 'ken-burns-in');
  await page.keyboard.press('Escape');
  const GREEN = [0x4a, 0xd9, 0x90];
  // Just left of the resting box: covered at the end (zoomed 1.15×), not at the start.
  await seek(page, 1.05);
  expect(near(await pixel(page, 285, 512), GREEN, 12)).toBe(false);
  await seek(page, 3.95);
  expect(near(await pixel(page, 285, 512), GREEN, 12)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ken-burns.png') });
  expect(await animationOf(page, 'layer-c')).toEqual({
    kenBurns: { zoom: 'in' },
  });
});

test('[ANI-010] the easing library previews named curves and applies one to the selected keyframes', async ({
  page,
}, testInfo) => {
  await select(page, 'example-badge');
  await seek(page, 0);
  await page
    .locator(
      '#animation-panel [data-property="position"] [data-action="stopwatch"]',
    )
    .click();
  await seek(page, 2);
  const x = page.locator('#inspector-content input[aria-label="Position X"]');
  await x.fill('276');
  await x.press('Enter');
  await page
    .locator('.timeline-keyframe[data-id="example-badge"][data-time="0"]')
    .click();
  const library = page.locator('#animation-panel .easing-library');
  await expect(library.locator('.easing-preset')).toHaveCount(7);
  await expect(library.locator('.easing-curve')).toHaveCount(7);
  const overshoot = library.locator('[data-easing-preset="overshoot"]');
  await overshoot.hover();
  await page.screenshot({ path: testInfo.outputPath('easing-library.png') });
  await overshoot.click();
  const frames = (await hook(page)).project.compositions[0]!.layers.find(
    (layer) => layer.id === 'example-badge',
  )!.transform.position.keyframes;
  expect(frames[0]!.easing).toEqual({
    type: 'cubic',
    x1: 0.34,
    y1: 1.56,
    x2: 0.64,
    y2: 1,
  });
  await expect(
    page.locator('#animation-panel [data-easing-preset="overshoot"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  // Half-way the overshoot curve is well past the linear 176.
  await seek(page, 1);
  expect(Number(await x.inputValue())).toBeGreaterThan(230);
});
