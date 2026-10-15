import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  mode2d,
  openRight,
  seekKeep,
  showCategory,
} from './fixtures';
import { SPIN, SPIN_ID, importPack, panel } from './creator-helpers';

// Q3: readable keyframe diamonds; an Anchor (pivot) per layer; Spin turns
// about it (the centre by default).
const corners = async (page: Page) =>
  (await page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getCanvas(): { corners: number[][] | null } };
        }
      ).__AIVE__.getCanvas().corners,
  ))!;
const centre = (points: number[][]) => [
  points.reduce((sum, point) => sum + point[0]!, 0) / points.length,
  points.reduce((sum, point) => sum + point[1]!, 0) / points.length,
];
const close = (a: number[], b: number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) < 0.5;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[QT-010][QT-011][QT-009] Spin turns a rectangle about its anchor (the centre by default); the Anchor grid moves the pivot; diamonds are readable', async ({
  page,
}) => {
  await importPack(page, SPIN);
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="rectangle"]').click();
  const id = (await hook(page)).session.selectedIds[0]!;
  const clipStart = (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((clip) => clip.layerId === id)!.startTime;
  // The Anchor grid: centre by default.
  await openRight(page, 'Properties');
  const grid = panel(page).locator('#right-anchor');
  await expect(grid.locator('[aria-checked="true"]')).toHaveAttribute(
    'data-pivot',
    'center',
  );
  await seekKeep(page, clipStart);
  const rest = centre(await corners(page));
  // Spin from Animate › Creator: 90 degrees over 1 s about the centre.
  await openRight(page, 'Animate');
  await panel(page).locator('.animate-tabs [data-tab="creator"]').click();
  await panel(page)
    .locator(`.animate-card[data-creator="true"][data-preset="${SPIN_ID}"]`)
    .click();
  await expect
    .poll(async () => {
      const layer = (await hook(page)).project.compositions[0]!.layers.find(
        (item) => item.id === id,
      )!;
      return layer.transform.rotation.keyframes.length;
    })
    .toBe(2);
  for (const time of [0.5, 1]) {
    await seekKeep(page, clipStart + time);
    await expect
      .poll(async () => close(centre(await corners(page)), rest))
      .toBe(true);
  }
  // At 1 s the box is turned 90 degrees (its first edge points down).
  const turned = await corners(page);
  expect(Math.abs(turned[1]![0]! - turned[0]![0]!)).toBeLessThan(0.5);
  // Anchor top-left: the top-left corner stays put instead.
  await seekKeep(page, clipStart);
  const topLeft = (await corners(page))[0]!;
  await openRight(page, 'Properties');
  await grid.locator('[data-pivot="top-left"]').click();
  await expect(grid.locator('[aria-checked="true"]')).toHaveAttribute(
    'data-pivot',
    'top-left',
  );
  expect((await hook(page)).history.labels.at(-1)).toBe('Set anchor');
  await seekKeep(page, clipStart + 1);
  await expect
    .poll(async () => close((await corners(page))[0]!, topLeft))
    .toBe(true);
  // QT-009: the diamonds are at least 10 px, light up on hover and fill
  // with the accent when selected.
  await mode2d(page);
  const diamond = page.locator(
    `.timeline-keyframe[data-id="${id}"][data-time="${clipStart + 1}"]`,
  );
  const box = (await diamond.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(10);
  expect(box.height).toBeGreaterThanOrEqual(10);
  const color = () =>
    diamond.evaluate((element) => getComputedStyle(element).color);
  const idle = await color();
  await diamond.hover();
  await expect.poll(color).not.toBe(idle);
  await diamond.click();
  await expect(diamond).toHaveClass(/selected/);
  await page.mouse.move(0, 0);
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-accent')
      .trim(),
  );
  const rgb = (hex: string) =>
    `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  await expect.poll(color).toBe(rgb(accent));
});
