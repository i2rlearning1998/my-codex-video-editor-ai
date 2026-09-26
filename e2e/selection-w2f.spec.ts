import type { Page } from '@playwright/test';
import { test, expect, hook, artboard, rulerBox } from './fixtures';

// W2-F1: multi-selection box and action cluster, capability-based menus,
// Ungroup, layer order and the media-card drop regression.
// Default example: badge 76,456 224x48 (#cbbced); badge text 93,472 above it
// (dark #403752); subtitle 76,570 680x70; group example-cards (rotated 12°,
// opacity 0.92) holds example-back and the group example-front.
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function toScreen(page: Page, x: number, y: number) {
  let board = boards.get(page);
  if (!board) boards.set(page, (board = await artboard(page)));
  return { x: board.x + x * board.scale, y: board.y + y * board.scale };
}
/** Pixels within `tolerance` of `rgb` inside a composition rectangle. */
async function countColor(
  page: Page,
  rect: [number, number, number, number],
  rgb: [number, number, number],
  tolerance = 40,
) {
  const a = await toScreen(page, rect[0], rect[1]);
  const b = await toScreen(page, rect[2], rect[3]);
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, { a, b, rgb, tolerance }) => {
      const box = canvas.getBoundingClientRect();
      const ratio = canvas.width / box.width;
      const x = Math.round((a.x - box.x) * ratio),
        y = Math.round((a.y - box.y) * ratio);
      const { data } = canvas
        .getContext('2d')!
        .getImageData(
          x,
          y,
          Math.max(1, Math.round((b.x - a.x) * ratio)),
          Math.max(1, Math.round((b.y - a.y) * ratio)),
        );
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          Math.abs(data[i]! - rgb[0]) +
            Math.abs(data[i + 1]! - rgb[1]) +
            Math.abs(data[i + 2]! - rgb[2]) <
          tolerance
        )
          count++;
      return count;
    },
    { a, b, rgb, tolerance },
  );
}
const DASH: [number, number, number] = [0x8b, 0x6c, 0xff];
const selectedIds = async (page: Page) =>
  (await hook(page)).session.selectedIds;
async function clickAt(page: Page, x: number, y: number, shift = false) {
  const point = await toScreen(page, x, y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  if (shift) await page.keyboard.up('Shift');
}
async function rightClickAt(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.locator('#canvas-context-menu')).toBeVisible();
}
const menu = (page: Page) => page.locator('#canvas-context-menu');
const cluster = (page: Page) => page.locator('#selection-actions');
const layers = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers;
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

  test('[CV-040] a multi-selection shows one dashed box, each outline and an action cluster; Group and Ungroup from the cluster', async ({
    page,
  }, testInfo) => {
    // Right edge of the union box (x = 756), between the two objects.
    const edge: [number, number, number, number] = [750, 515, 762, 560];
    expect(await countColor(page, edge, DASH)).toBe(0);
    await clickAt(page, 85, 462);
    await clickAt(page, 400, 600, true);
    await expect
      .poll(() => selectedIds(page))
      .toEqual(['example-badge', 'example-subtitle']);
    await expect.poll(() => countColor(page, edge, DASH)).toBeGreaterThan(5);
    // The cluster sits above the box and offers Group, Duplicate, Delete, More.
    await expect(cluster(page)).toBeVisible();
    await expect(
      cluster(page).locator('[data-action="group"]'),
    ).toHaveAttribute('aria-label', 'Group (Ctrl+G)');
    const buttons = await cluster(page)
      .locator('button')
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset.action),
      );
    expect(buttons).toEqual(['group', 'duplicate', 'delete', 'more']);
    const box = (await cluster(page).boundingBox())!;
    const top = await toScreen(page, 76, 456);
    expect(box.y + box.height).toBeLessThan(top.y);
    await page.screenshot({ path: testInfo.outputPath('multi-select.png') });
    // Group from the cluster: one undo step, and the group is selected.
    await cluster(page).locator('[data-action="group"]').click();
    expect((await hook(page)).history.labels.at(-1)).toBe('Group');
    const group = (await selectedIds(page))[0]!;
    expect(
      (await layers(page))
        .find((layer) => layer.id === group)!
        .children.map((child) => child.id),
    ).toEqual(['example-badge', 'example-subtitle']);
    // A single group has no outer dashed box; the cluster now offers Ungroup.
    await expect.poll(() => countColor(page, edge, DASH)).toBe(0);
    await cluster(page).locator('[data-action="ungroup"]').click();
    expect((await hook(page)).history.labels.at(-1)).toBe('Ungroup');
    await expect
      .poll(() => selectedIds(page))
      .toEqual(['example-badge', 'example-subtitle']);
    // Both are top-level again, each with its own clip.
    const project = (await hook(page)).project;
    const clipped = project.compositions[0]!.tracks.flatMap((track) =>
      track.clips.map((clip) => clip.layerId),
    );
    expect(clipped).toEqual(
      expect.arrayContaining(['example-badge', 'example-subtitle']),
    );
    expect(clipped).not.toContain(group);
    // More opens the full right-click menu.
    await cluster(page).locator('[data-action="more"]').click();
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).locator('[data-action="group"]')).toBeVisible();
    await page.keyboard.press('Escape');
    // The cluster hides with no selection.
    await page.keyboard.press('Escape');
    await expect(cluster(page)).toBeHidden();
  });

  test('[LYR-012] Ungroup a moved and rotated group keeps every child where it was, from the menu and Ctrl+Shift+G', async ({
    page,
  }) => {
    const paper: [number, number, number, number] = [880, 250, 1000, 420];
    const lavender: [number, number, number] = [0xb4, 0xa2, 0xd5];
    const lime: [number, number, number] = [0xd9, 0xe3, 0x8e];
    const before = [
      await countColor(page, paper, lavender, 30),
      await countColor(page, paper, lime, 30),
    ];
    expect(before[0]! + before[1]!).toBeGreaterThan(500);
    await page.locator('#scene-list [data-layer-id="example-cards"]').click();
    await rightClickAt(page, 950, 300);
    await menu(page).locator('[data-action="ungroup"]').click();
    expect((await hook(page)).history.labels.at(-1)).toBe('Ungroup');
    const top = (await layers(page)).map((layer) => layer.id);
    expect(top).toEqual(
      expect.arrayContaining(['example-back', 'example-front']),
    );
    expect(top).not.toContain('example-cards');
    // Rotation 12° and opacity 0.92 moved into the children.
    const back = (await layers(page)).find(
      (layer) => layer.id === 'example-back',
    )!;
    expect(back.transform.rotation.value).toBeCloseTo(12, 6);
    expect(back.transform.opacity.value).toBeCloseTo(0.92, 6);
    await expect(cluster(page)).toBeVisible();
    // The canvas looks the same: same colors in the same place (with nothing
    // selected, so no outline covers the paper).
    await page.keyboard.press('Escape');
    await expect.poll(() => selectedIds(page)).toEqual([]);
    await expect
      .poll(async () => [
        await countColor(page, paper, lavender, 30),
        await countColor(page, paper, lime, 30),
      ])
      .toEqual(before);
    // Undo restores the group; Ctrl+Shift+G ungroups it again.
    await page.locator('#undo').click();
    expect((await layers(page)).map((layer) => layer.id)).toContain(
      'example-cards',
    );
    await page.locator('#scene-list [data-layer-id="example-cards"]').click();
    await page.keyboard.press('Control+Shift+G');
    expect((await hook(page)).history.labels.at(-1)).toBe('Ungroup');
    // A stretched group with a rotated child cannot keep its shape: the
    // menu shows Ungroup disabled with the reason.
    await page.locator('#undo').click();
    await page.locator('#scene-list [data-layer-id="example-cards"]').click();
    await page.locator('[data-subtab="Transform"]').click();
    const scaleX = page.locator(
      '#inspector-content input[aria-label="Scale X"]',
    );
    await scaleX.fill('1.5');
    await scaleX.press('Enter');
    await rightClickAt(page, 950, 300);
    const ungroup = menu(page).locator('[data-action="ungroup"]');
    await expect(ungroup).toBeDisabled();
    await expect(ungroup).toHaveAttribute('title', /stretched and rotated/);
  });

  test('[CV-026] Layer order from the Layer submenu and Ctrl+[ / Ctrl+] moves a layer behind or in front', async ({
    page,
  }) => {
    const label: [number, number, number, number] = [95, 474, 290, 500];
    const dark: [number, number, number] = [0x40, 0x37, 0x52];
    const visible = await countColor(page, label, dark, 60);
    expect(visible).toBeGreaterThan(100);
    await page
      .locator('#scene-list [data-layer-id="example-badge-text"]')
      .click();
    await rightClickAt(page, 200, 490);
    await menu(page).locator('[data-action="arrange"]').click();
    await menu(page).locator('[data-action="arrange-back"]').click();
    expect((await hook(page)).history.labels.at(-1)).toBe('Send to back');
    expect((await layers(page))[0]!.id).toBe('example-badge-text');
    // Behind the opaque badge the text is hidden.
    await expect
      .poll(() => countColor(page, label, dark, 60))
      .toBeLessThan(visible / 10);
    // Ctrl+] steps it forward one layer at a time: kicker, headline, badge.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+]');
    const order = (await layers(page)).map((layer) => layer.id);
    expect(order.indexOf('example-badge-text')).toBe(
      order.indexOf('example-badge') + 1,
    );
    await expect
      .poll(() => countColor(page, label, dark, 60))
      .toBeGreaterThan(visible * 0.9);
    await page.keyboard.press('Control+[');
    expect((await hook(page)).history.labels.at(-1)).toBe('Send backward');
  });
});

test.describe('media and timeline fixture', () => {
  test.beforeEach(async ({ page, openFixtureProject }) => {
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
    await openFixtureProject('nle-example.json');
  });

  test('[CV-040][VID-015] clip-only actions appear only when every selected item is a video or audio clip', async ({
    page,
  }) => {
    const clipOnly = ['speed', 'reverse', 'freeze', 'detach-audio'];
    const actions = async () =>
      menu(page)
        .locator('button')
        .evaluateAll((items) =>
          items.map((item) => (item as HTMLElement).dataset.action),
        );
    // Image layer-c (1..4 s) alone: no speed, reverse, freeze or detach.
    await seek(page, 3.5);
    await rightClickAt(page, 500, 500);
    expect(await actions()).not.toEqual(expect.arrayContaining(['speed']));
    for (const action of clipOnly)
      expect(await actions()).not.toContain(action);
    expect(await actions()).toContain('toggle-enabled');
    await page.keyboard.press('Escape');
    // Video layer-b (3..5 s) alone: all four are offered.
    await rightClickAt(page, 800, 200);
    for (const action of clipOnly) expect(await actions()).toContain(action);
    await page.keyboard.press('Escape');
    // Video plus image: the intersection has none of them.
    await clickAt(page, 800, 200);
    await clickAt(page, 500, 500, true);
    await expect.poll(() => selectedIds(page)).toEqual(['layer-b', 'layer-c']);
    await rightClickAt(page, 500, 500);
    for (const action of clipOnly)
      expect(await actions()).not.toContain(action);
    expect(await actions()).toContain('group');
    await page.keyboard.press('Escape');
    // The timeline menu follows the same rule for the image clip.
    await page
      .locator('.timeline-clip[data-clip-id="clip-c"]')
      .click({ button: 'right', position: { x: 20, y: 10 } });
    await expect(page.locator('.timeline-menu')).toBeVisible();
    await expect(
      page.locator('.timeline-menu [data-action="speed"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('.timeline-menu [data-action="reverse"]'),
    ).toHaveCount(0);
  });
});
