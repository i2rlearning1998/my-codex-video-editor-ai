import type { Page } from '@playwright/test';
import { test, expect, hook, artboard, rulerBox } from './fixtures';

// Default example: shape "example-badge" at 76,456 (224×48, #cbbced), text
// "example-headline"; composition 1280×720 at 30 fps, 10 s long.
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function toScreen(page: Page, x: number, y: number) {
  let board = boards.get(page);
  if (!board) boards.set(page, (board = await artboard(page)));
  return { x: board.x + x * board.scale, y: board.y + y * board.scale };
}
function find(project: any, id: string): any {
  const visit = (layers: any[]): any =>
    layers.reduce(
      (found: any, layer: any) =>
        found ?? (layer.id === id ? layer : visit(layer.children)),
      null,
    );
  return visit(project.compositions[0].layers);
}
const layer = async (page: Page, id: string) =>
  find((await hook(page)).project, id);
const frames = async (
  page: Page,
  id: string,
  key = 'position',
  kind = 'transform',
) =>
  (await layer(page, id))[kind === 'transform' ? 'transform' : 'properties'][
    key
  ].keyframes as { time: number; value: unknown; easing?: unknown }[];
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
const row = (page: Page, property: string) =>
  page.locator(`#animation-panel [data-property="${property}"]`);
const inspectorX = (page: Page) =>
  page.locator('#inspector-content input[aria-label="Position X"]');
/** Drags the canvas point by a composition delta with Ctrl (no snapping). */
async function drag(page: Page, from: [number, number], dx: number) {
  const start = await toScreen(page, ...from);
  const end = await toScreen(page, from[0] + dx, from[1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.keyboard.down('Control');
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Control');
}
/** Badge keyframes: x 76 at 0 s and x 276 at 2 s. */
async function animateBadge(page: Page) {
  await select(page, 'example-badge');
  await seek(page, 0);
  await row(page, 'position').locator('[data-action="stopwatch"]').click();
  await seek(page, 2);
  // ANI-006: an Inspector edit at the playhead adds the keyframe there.
  await inspectorX(page).fill('276');
  await inspectorX(page).press('Enter');
  expect(await frames(page, 'example-badge')).toEqual([
    { time: 0, value: [76, 456] },
    { time: 2, value: [276, 456] },
  ]);
}
const diamond = (page: Page, time: number) =>
  page.locator(
    `.timeline-keyframe[data-id="example-badge"][data-time="${time}"]`,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[ANI-001][ANI-006] stopwatches record keyframes; edits at the playhead add keyframes; stopwatch off keeps the shown value', async ({
  page,
}, testInfo) => {
  await animateBadge(page);
  expect((await hook(page)).history.labels).toEqual([
    'Start animating',
    'Set Position X',
  ]);
  // A canvas drag at 3 s adds a keyframe there and leaves the others unchanged.
  await seek(page, 3);
  await drag(page, [340, 464], 100);
  const dragged = await frames(page, 'example-badge');
  expect(dragged.map((frame) => frame.time)).toEqual([0, 2, 3]);
  expect(dragged[1]!.value).toEqual([276, 456]);
  expect((dragged[2]!.value as number[])[0]).toBeCloseTo(376, 0);
  expect((await hook(page)).history.labels.at(-1)).toBe('Move layer');
  await page.locator('#undo').click();
  await expect(
    row(page, 'position').locator('[data-action="stopwatch"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  // Half-way the canvas and the Inspector show the interpolated position.
  await seek(page, 1);
  await expect(inspectorX(page)).toHaveValue('176');
  await page.screenshot({ path: testInfo.outputPath('animated-badge.png') });
  // Opacity and color stopwatches also create keyframes.
  for (const property of ['opacity', 'fill'])
    await row(page, property).locator('[data-action="stopwatch"]').click();
  expect(await frames(page, 'example-badge', 'opacity')).toEqual([
    { time: 1, value: 1 },
  ]);
  expect(await frames(page, 'example-badge', 'fill', 'property')).toEqual([
    { time: 1, value: '#cbbced' },
  ]);
  // Text size on a text layer.
  await select(page, 'example-headline');
  await row(page, 'fontSize').locator('[data-action="stopwatch"]').click();
  expect(
    await frames(page, 'example-headline', 'fontSize', 'property'),
  ).toEqual([{ time: 1, value: 78 }]);
  // Stopwatch off at 1 s: no keyframes, the value shown there stays.
  await select(page, 'example-badge');
  await row(page, 'position').locator('[data-action="stopwatch"]').click();
  const badge = await layer(page, 'example-badge');
  expect(badge.transform.position.keyframes).toEqual([]);
  expect(badge.transform.position.animated).toBe(false);
  expect(badge.transform.position.value).toEqual([176, 456]);
});

test('[ANI-002][ANI-003] easing from the keyframe menu and the Inspector changes the in-between values on the canvas', async ({
  page,
}) => {
  await animateBadge(page);
  const xAt1 = async () => {
    await seek(page, 1);
    return Number(await inputValue(page));
  };
  const inputValue = (page: Page) => inspectorX(page).inputValue();
  expect(await xAt1()).toBe(176);
  const easing = async (value: string) => {
    await diamond(page, 0).click({ button: 'right' });
    await page.locator(`.timeline-menu [data-easing="${value}"]`).click();
  };
  await easing('ease-in');
  expect((await frames(page, 'example-badge'))[0]!.easing).toBe('ease-in');
  expect(await xAt1()).toBeLessThan(176);
  await easing('ease-out');
  expect(await xAt1()).toBeGreaterThan(176);
  await easing('hold');
  expect(await xAt1()).toBe(76);
  // The canvas agrees: with Hold the badge is still at x 76 at 1 s.
  const at = await toScreen(page, 290, 480);
  const painted = await page
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement, point) => {
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
      ];
    }, at);
  [0xcb, 0xbb, 0xed].forEach((channel, index) =>
    expect(Math.abs(painted[index]! - channel)).toBeLessThanOrEqual(3),
  );
  // A custom curve from the Inspector.
  await diamond(page, 0).click();
  await page.locator('#keyframe-easing').selectOption('custom');
  await page.locator('#keyframe-x1').fill('0.9');
  await page.locator('#keyframe-x1').press('Enter');
  await expect
    .poll(async () => (await frames(page, 'example-badge'))[0]!.easing)
    .toEqual({ type: 'cubic', x1: 0.9, y1: 0.1, x2: 0.25, y2: 1 });
  expect(await xAt1()).toBeLessThan(176);
});

test('[ANI-004] keyframes move, copy, paste, duplicate and delete on the timeline and in the Inspector', async ({
  page,
}, testInfo) => {
  await animateBadge(page);
  // Select both diamonds and drag them half a second later.
  await diamond(page, 0).click();
  await diamond(page, 2).click({ modifiers: ['Control'] });
  await expect(diamond(page, 2)).toHaveAttribute('aria-pressed', 'true');
  const from = (await diamond(page, 2).boundingBox())!;
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + zoom / 2,
    from.y + from.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(
    (await frames(page, 'example-badge')).map((frame) => frame.time),
  ).toEqual([0.5, 2.5]);
  expect((await hook(page)).history.labels.at(-1)).toBe('Move keyframes');
  await page.screenshot({ path: testInfo.outputPath('keyframes.png') });
  // Copy both (Ctrl+C) and paste at 5 s (Ctrl+V); offsets are kept.
  await page.keyboard.press('Control+c');
  await seek(page, 5);
  await expect
    .poll(async () => (await hook(page)).session.selectedKeyframes.length)
    .toBe(2);
  await page.keyboard.press('Control+v');
  expect(
    (await frames(page, 'example-badge')).map((frame) => frame.time),
  ).toEqual([0.5, 2.5, 5, 7]);
  // Duplicate the pasted pair from the Inspector: one frame after them.
  await page
    .locator('#animation-panel [data-keyframe-action="duplicate"]')
    .click();
  const times = (await frames(page, 'example-badge')).map(
    (frame) => frame.time,
  );
  expect(times).toHaveLength(6);
  expect(times[4]).toBeCloseTo(7 + 1 / 30, 9);
  // Delete the selected (duplicated) pair with the Delete key.
  await page.keyboard.press('Delete');
  expect(
    (await frames(page, 'example-badge')).map((frame) => frame.time),
  ).toEqual([0.5, 2.5, 5, 7]);
  // Move one keyframe from the Inspector time field.
  await diamond(page, 7).click();
  await page.locator('#keyframe-time').fill('8');
  await page.locator('#keyframe-time').press('Enter');
  expect(
    (await frames(page, 'example-badge')).map((frame) => frame.time),
  ).toEqual([0.5, 2.5, 5, 8]);
  // Each edit is one undo step.
  await page.locator('#undo').click();
  expect(
    (await frames(page, 'example-badge')).map((frame) => frame.time),
  ).toEqual([0.5, 2.5, 5, 7]);
});

test('[ANI-005] previous and next keyframe jump the playhead; the diamond is filled exactly on a keyframe', async ({
  page,
}) => {
  await animateBadge(page);
  await seek(page, 1);
  const marker = row(page, 'position').locator(
    '[data-action="property-keyframe"]',
  );
  await expect(marker).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#animation-panel [data-action="keyframe-next"]').click();
  await expect.poll(async () => (await hook(page)).session.time).toBe(2);
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await page
    .locator('#animation-panel [data-action="keyframe-previous"]')
    .click();
  await expect.poll(async () => (await hook(page)).session.time).toBe(0);
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  // The , and . keys do the same from anywhere outside a text field.
  await page.locator('canvas').focus();
  await page.keyboard.press('.');
  await expect.poll(async () => (await hook(page)).session.time).toBe(2);
  await page.keyboard.press(',');
  await expect.poll(async () => (await hook(page)).session.time).toBe(0);
  // The diamond button adds and removes a keyframe at the playhead.
  await seek(page, 1);
  await marker.click();
  expect(
    (await frames(page, 'example-badge')).map((frame) => frame.time),
  ).toEqual([0, 1, 2]);
  await marker.click();
  expect(
    (await frames(page, 'example-badge')).map((frame) => frame.time),
  ).toEqual([0, 2]);
});

test('[ANI-009] children follow an animated group and inherit its opacity', async ({
  page,
}) => {
  // "example-cards" is a group; its children are the two paper cards.
  await select(page, 'example-cards');
  await seek(page, 0);
  for (const property of ['position', 'opacity'])
    await row(page, property).locator('[data-action="stopwatch"]').click();
  await seek(page, 2);
  await page
    .locator('#inspector-content input[aria-label="Position X"]')
    .fill('725');
  await page
    .locator('#inspector-content input[aria-label="Position X"]')
    .press('Enter');
  await page
    .locator('#inspector-content input[aria-label="Opacity"]')
    .fill('0');
  await page
    .locator('#inspector-content input[aria-label="Opacity"]')
    .press('Enter');
  const group = await layer(page, 'example-cards');
  expect(
    group.transform.position.keyframes.map((frame: any) => frame.value[0]),
  ).toEqual([825, 725]);
  expect(
    group.transform.opacity.keyframes.map((frame: any) => frame.value),
  ).toEqual([0.92, 0]);
  // At 1 s the child card is half-way and half transparent: its pixel blends
  // with the background, and at 2 s it is gone.
  const pixelAt = async (x: number, y: number) => {
    const at = await toScreen(page, x, y);
    return page
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement, point) => {
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
  };
  await seek(page, 0);
  const full = await pixelAt(900, 350);
  await seek(page, 2);
  const background = await pixelAt(900, 350);
  expect(background).not.toEqual(full);
  await seek(page, 1);
  // The lime card (moved 50 left, 50% opaque) still covers x 900.
  const half = await pixelAt(900, 350);
  for (const channel of [0, 1, 2])
    expect(
      Math.abs(half[channel]! - (full[channel]! + background[channel]!) / 2),
    ).toBeLessThan(20);
});
