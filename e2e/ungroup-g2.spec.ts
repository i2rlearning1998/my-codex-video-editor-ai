import type { Page } from '@playwright/test';
import { test, expect, hook, toScreen } from './fixtures';

// G2.4: Ungroup removes one level (unchanged, D-074); this proves it for a
// nested group, the selection it leaves, and group picking on the canvas.
// Default example: "Card arrangement" (example-cards, rotated 12°) holds
// "Lavender paper" (example-back) and "Front card" (example-front, a group).
type Layers = Awaited<
  ReturnType<typeof hook>
>['project']['compositions'][number]['layers'];
function find(layers: Layers, id: string): Layers[number] | undefined {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    const found = find(layer.children, id);
    if (found) return found;
  }
}
const layers = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers;
const selectedIds = async (page: Page) =>
  (await hook(page)).session.selectedIds;
async function geometry(page: Page, id: string) {
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
  await expect.poll(() => selectedIds(page)).toEqual([id]);
  const read = async (field: string) =>
    Number(await page.locator(`#inspector-${field}`).inputValue());
  return {
    x: await read('x'),
    y: await read('y'),
    w: await read('w'),
    h: await read('h'),
  };
}
async function clickAt(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y);
  await page.mouse.click(point.x, point.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[LYR-012][CV-044] a nested group selected directly ungroups one level; its children become the selection and stay where they were', async ({
  page,
}) => {
  const children = find(await layers(page), 'example-front')!.children.map(
    (child) => child.id,
  );
  expect(children.length).toBeGreaterThan(1);
  const before = await geometry(page, children[0]!);
  // Select the nested group itself from the Scene list and ungroup it.
  await page.locator('#scene-list [data-layer-id="example-front"]').click();
  await expect.poll(() => selectedIds(page)).toEqual(['example-front']);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+Shift+g');
  expect((await hook(page)).history.labels.at(-1)).toBe('Ungroup');
  // One level only: the children now sit directly in "Card arrangement".
  const cards = find(await layers(page), 'example-cards')!;
  expect(find(await layers(page), 'example-front')).toBeUndefined();
  expect(cards.children.map((child) => child.id)).toEqual(
    expect.arrayContaining(children),
  );
  await expect
    .poll(async () => [...(await selectedIds(page))].sort())
    .toEqual([...children].sort());
  // Baking the group's transform keeps each child's drawn box.
  const after = await geometry(page, children[0]!);
  for (const key of ['x', 'y', 'w', 'h'] as const)
    expect(after[key]).toBeCloseTo(before[key], 0);
});

test('[CV-022][LYR-008] click selects the group, double-click enters it, Esc steps out; the Layers tab shows the nesting with a group icon', async ({
  page,
}) => {
  await clickAt(page, 950, 300);
  await expect.poll(() => selectedIds(page)).toEqual(['example-cards']);
  // One click on a group is one selected layer, never "2 selected".
  await expect(page.locator('#inspector-content .selected-name')).toHaveText(
    'Card arrangement',
  );
  const point = await toScreen(page, 950, 300);
  await page.mouse.dblclick(point.x, point.y);
  const entered = await selectedIds(page);
  expect(entered).toHaveLength(1);
  expect(
    find(await layers(page), 'example-cards')!.children.map((c) => c.id),
  ).toContain(entered[0]);
  await page.keyboard.press('Escape');
  await expect.poll(() => selectedIds(page)).toEqual(['example-cards']);
  await page.keyboard.press('Escape');
  await expect.poll(() => selectedIds(page)).toEqual([]);
  // Layers tab: the group has its group icon and its children sit under it.
  await clickAt(page, 950, 300);
  // A group has no context toolbar; its action cluster opens Position.
  await page.locator('#selection-actions [data-action="position"]').click();
  const panel = page.locator('[data-deep-panel="position"]');
  await panel.locator('[data-tab="layers"]').click();
  const group = panel.locator('[data-layer-id="example-cards"]');
  await expect(group.locator('[data-icon]')).toHaveAttribute(
    'data-icon',
    'open',
  );
  await expect(
    panel.locator('[data-layer-id="example-front"][data-depth="1"]'),
  ).toBeVisible();
  await expect(
    panel.locator('[data-layer-id="example-paper"][data-depth="2"]'),
  ).toBeVisible();
});

test('[CV-040][LYR-012] regression: after Ungroup, one click on a freed child selects only that child (no "2 selected")', async ({
  page,
}) => {
  await clickAt(page, 950, 300);
  await expect.poll(() => selectedIds(page)).toEqual(['example-cards']);
  await page.keyboard.press('Control+Shift+g');
  await expect
    .poll(async () => (await selectedIds(page)).length)
    .toBeGreaterThan(1);
  await clickAt(page, 950, 300);
  await expect.poll(() => selectedIds(page)).toHaveLength(1);
  await expect(
    page.locator('#inspector-content .selected-name'),
  ).not.toContainText('selected');
  // A drag on a member of a multi-selection still moves them all.
  await page.keyboard.press('Control+z');
  await clickAt(page, 950, 300);
  await expect.poll(() => selectedIds(page)).toEqual(['example-cards']);
  await page.keyboard.press('Control+Shift+g');
  const many = await selectedIds(page);
  expect(many.length).toBeGreaterThan(1);
  const a = await toScreen(page, 950, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 10, { steps: 5 });
  await page.mouse.up();
  expect(await selectedIds(page)).toEqual(many);
  expect((await hook(page)).history.labels.at(-1)).toBe('Move layer');
});
