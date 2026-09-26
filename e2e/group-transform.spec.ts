import type { Page } from '@playwright/test';
import { test, expect, hook, artboard, rulerBox } from './fixtures';

// W2-F2: resizing and rotating a multi-selection from its shared box
// (CV-041, interaction contract revision 6) and the corner-scaling fix (CV-007).
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function toScreen(page: Page, x: number, y: number) {
  let board = boards.get(page);
  if (!board) boards.set(page, (board = await artboard(page)));
  return { x: board.x + x * board.scale, y: board.y + y * board.scale };
}
const layer = async (page: Page, id: string) => {
  const find = (
    layers: Awaited<
      ReturnType<typeof hook>
    >['project']['compositions'][number]['layers'],
  ): (typeof layers)[number] | undefined => {
    for (const item of layers) {
      if (item.id === id) return item;
      const found = find(item.children);
      if (found) return found;
    }
  };
  return find((await hook(page)).project.compositions[0]!.layers)!;
};
async function clickAt(page: Page, x: number, y: number, shift = false) {
  const point = await toScreen(page, x, y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  if (shift) await page.keyboard.up('Shift');
}
/** Drags from composition point `from` to `to`, with an optional held key. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  key?: string,
) {
  await page.mouse.move(from.x, from.y);
  if (key) await page.keyboard.down(key);
  await page.mouse.down();
  await page.mouse.move(
    from.x + (to.x - from.x) / 2,
    from.y + (to.y - from.y) / 2,
    { steps: 4 },
  );
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  if (key) await page.keyboard.up(key);
}
async function seek(page: Page, seconds: number) {
  const box = await rulerBox(page);
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.click(box.x + seconds * zoom, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}

test.describe('default example', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
  });

  test('[CV-041] the multi-selection box resizes from a corner and rotates about its center, each as one undo step', async ({
    page,
  }, testInfo) => {
    // Badge 76,456 224x48 and subtitle 76,570 680x70: frame 76..756 x 456..640.
    await clickAt(page, 85, 462);
    await clickAt(page, 400, 600, true);
    await expect
      .poll(async () => (await hook(page)).session.selectedIds)
      .toEqual(['example-badge', 'example-subtitle']);
    // Bottom-right corner along the diagonal to 1.1x, from the top-left corner.
    await drag(
      page,
      await toScreen(page, 756, 640),
      await toScreen(page, 76 + 1.1 * 680, 456 + 1.1 * 184),
    );
    expect((await hook(page)).history.labels.at(-1)).toBe('Resize layers');
    const badge = await layer(page, 'example-badge');
    const subtitle = await layer(page, 'example-subtitle');
    expect(badge.transform.scale.value[0]).toBeCloseTo(1.1, 2);
    expect(badge.transform.scale.value[1]).toBeCloseTo(1.1, 2);
    expect(badge.transform.position.value[0]).toBeCloseTo(76, 1);
    expect(subtitle.transform.scale.value[0]).toBeCloseTo(1.1, 2);
    expect(subtitle.transform.position.value[1]).toBeCloseTo(
      456 + 1.1 * (570 - 456),
      0,
    );
    await page.locator('#undo').click();
    expect((await layer(page, 'example-badge')).transform.scale.value).toEqual([
      1, 1,
    ]);
    // Rotate handle: 34 CSS px above the top edge's middle; drag it a quarter
    // turn clockwise around the frame center (416, 548).
    const top = await toScreen(page, 416, 456);
    const center = await toScreen(page, 416, 548);
    const handle = { x: top.x, y: top.y - 34 };
    const radius = center.y - handle.y;
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(center.x + radius * 0.7, center.y - radius * 0.7, {
      steps: 4,
    });
    await page.mouse.move(center.x + radius, center.y, { steps: 4 });
    await page.screenshot({ path: testInfo.outputPath('rotating.png') });
    await page.mouse.up();
    expect((await hook(page)).history.labels.at(-1)).toBe('Rotate layers');
    const rotated = await layer(page, 'example-badge');
    expect(rotated.transform.rotation.value).toBeCloseTo(90, 0);
    // The badge's top-left (76, 456) turns 90° clockwise about (416, 548).
    expect(rotated.transform.position.value[0]).toBeCloseTo(416 + 92, -1);
    expect(rotated.transform.position.value[1]).toBeCloseTo(548 - 340, -1);
    expect(
      (await layer(page, 'example-subtitle')).transform.rotation.value,
    ).toBeCloseTo(90, 0);
    // A selection with text has no edge handles: stretching would distort it.
    await page.locator('#undo').click();
    const right = await toScreen(page, 756, 548);
    await page.mouse.move(right.x, right.y);
    await expect(page.locator('canvas')).not.toHaveCSS('cursor', 'ew-resize');
  });

  test('[CV-007] a corner drag on a wide layer follows the pointer instead of running ahead of it', async ({
    page,
  }) => {
    await clickAt(page, 85, 462);
    await expect
      .poll(async () => (await hook(page)).session.selectedIds)
      .toEqual(['example-badge']);
    // 45° drag of the badge's bottom-right corner by 40 units, without snapping.
    await drag(
      page,
      await toScreen(page, 300, 504),
      await toScreen(page, 340, 544),
      'Control',
    );
    // The old rule took the larger relative change (height: 1.83x). The corner
    // now lands on the pointer's projection onto the diagonal.
    const expected = (264 * 224 + 88 * 48) / (224 * 224 + 48 * 48);
    const [sx, sy] = (await layer(page, 'example-badge')).transform.scale
      .value as number[];
    expect(sx).toBeCloseTo(expected, 2);
    expect(sy).toBeCloseTo(expected, 2);
    expect(sx).toBeLessThan(1.25);
  });
});

test.describe('media fixture', () => {
  test.beforeEach(async ({ page, openFixtureProject }) => {
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
    await openFixtureProject('nle-example.json');
  });

  test('[CV-041] edge handles stretch a straight multi-selection along one axis; Alt resizes from the center', async ({
    page,
  }) => {
    // At 1.5 s: layer-a 100,100 and layer-c 300,400 (both 400x225).
    await seek(page, 1.5);
    await clickAt(page, 200, 150);
    await clickAt(page, 500, 500, true);
    await expect
      .poll(async () => (await hook(page)).session.selectedIds)
      .toEqual(['layer-a', 'layer-c']);
    // Frame 100..700 x 100..625: drag the right edge 100 units right.
    await drag(
      page,
      await toScreen(page, 700, 362.5),
      await toScreen(page, 800, 362.5),
    );
    expect((await hook(page)).history.labels.at(-1)).toBe('Resize layers');
    const a = await layer(page, 'layer-a');
    const c = await layer(page, 'layer-c');
    expect(a.transform.scale.value[0]).toBeCloseTo(7 / 6, 2);
    expect(a.transform.scale.value[1]).toBe(1);
    expect(c.transform.position.value[0]).toBeCloseTo(100 + (7 / 6) * 200, 0);
    await page.locator('#undo').click();
    // Alt on a corner keeps the frame center (400, 362.5) fixed.
    await drag(
      page,
      await toScreen(page, 700, 625),
      await toScreen(page, 400 + 1.2 * 300, 362.5 + 1.2 * 262.5),
      'Alt',
    );
    const scaled = await layer(page, 'layer-a');
    expect(scaled.transform.scale.value[0]).toBeCloseTo(1.2, 2);
    expect(scaled.transform.position.value[0]).toBeCloseTo(
      400 + 1.2 * (100 - 400),
      0,
    );
  });
});
