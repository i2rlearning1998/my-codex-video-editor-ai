import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  showGraphics,
  toScreen,
} from './fixtures';

// R1: Group and Ungroup from the canvas menu, the timeline menu and the
// shortcut; a regroup keeps the original group's name; a toast says what
// happened.
interface Layer {
  id: string;
  name: string;
  type: string;
  children: Layer[];
}
const layers = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!.layers as unknown as Layer[];
};
const selectedIds = async (page: Page) =>
  (await hook(page)).session.selectedIds;
const toast = (page: Page, text: string) =>
  page.locator('.toast:not(.toast-leaving)', { hasText: text });
const timelineMenu = (page: Page) =>
  page.locator('#timeline-foundation .timeline-menu');
async function clipMenu(page: Page, layerId: string) {
  const clip = page.locator(
    `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layerId}"]`,
  );
  await expect(async () => {
    await clip.click({ button: 'right', position: { x: 20, y: 10 } });
    await expect(timelineMenu(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
}
/** Inserts a two-part text group and names it "Neon night title". */
async function neonTitle(page: Page) {
  await showCategory(page, 'Text');
  await page.locator('.library-card[data-item-id="text-11"]').first().click();
  const id = (await selectedIds(page))[0]!;
  await showCategory(page, 'Scene');
  await page
    .locator(`#scene-list .outliner-row[data-layer-id="${id}"] .outliner-name`)
    .dblclick();
  const input = page.locator('#scene-list .outliner-rename');
  await input.fill('Neon night title');
  await input.press('Enter');
  await expect
    .poll(async () => (await layers(page)).find((l) => l.id === id)?.name)
    .toBe('Neon night title');
  const group = (await layers(page)).find((l) => l.id === id)!;
  expect(group.type).toBe('group');
  expect(group.children.length).toBe(2);
  return { id, children: group.children.map((child) => child.id) };
}
async function selectOnly(page: Page, id: string) {
  await page
    .locator(`#scene-list .outliner-row[data-layer-id="${id}"]`)
    .click();
  await expect.poll(() => selectedIds(page)).toEqual([id]);
}
async function selectBoth(page: Page, ids: string[]) {
  await selectOnly(page, ids[0]!);
  await page.keyboard.down('Shift');
  await page
    .locator(`#scene-list .outliner-row[data-layer-id="${ids[1]}"]`)
    .click();
  await page.keyboard.up('Shift');
  await expect
    .poll(async () => [...(await selectedIds(page))].sort())
    .toEqual([...ids].sort());
}
const groupNamed = async (page: Page, name: string) =>
  (await layers(page)).filter(
    (layer) => layer.type === 'group' && layer.name === name,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[RA-001][RA-002][RA-003] "Neon night title" ungroups from the canvas menu, the timeline menu and the shortcut; regrouping keeps its name; each step shows one toast', async ({
  page,
}) => {
  const { id, children } = await neonTitle(page);

  // 1. Canvas menu > Ungroup.
  await selectOnly(page, id);
  const point = await toScreen(page, 640, 360);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const canvasMenu = page.locator('#canvas-context-menu');
  await expect(canvasMenu).toBeVisible();
  await canvasMenu.locator('[data-action="ungroup"]').click();
  await expect(toast(page, 'Ungrouped into 2 layers')).toHaveCount(1);
  expect((await layers(page)).some((layer) => layer.id === id)).toBe(false);
  // Regroup (Ctrl+G) keeps the name.
  await selectBoth(page, children);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+g');
  await expect(toast(page, 'Grouped 2 layers')).toHaveCount(1);
  await expect
    .poll(async () => (await groupNamed(page, 'Neon night title')).length)
    .toBe(1);
  expect(await groupNamed(page, 'Group')).toHaveLength(0);

  // 2. Timeline menu > Ungroup, then timeline menu > Group.
  let group = (await groupNamed(page, 'Neon night title'))[0]!;
  await clipMenu(page, group.id);
  const ungroup = timelineMenu(page).locator('[data-command="ungroup"]');
  await expect(ungroup).toBeEnabled();
  await ungroup.click();
  await expect
    .poll(async () => (await groupNamed(page, 'Neon night title')).length)
    .toBe(0);
  await selectBoth(page, children);
  await clipMenu(page, children[0]!);
  await timelineMenu(page).locator('[data-command="group"]').click();
  await expect
    .poll(async () => (await groupNamed(page, 'Neon night title')).length)
    .toBe(1);

  // 3. Shortcut Ctrl+Shift+G, then regroup.
  group = (await groupNamed(page, 'Neon night title'))[0]!;
  await selectOnly(page, group.id);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+Shift+G');
  await expect
    .poll(async () => (await hook(page)).history.labels.at(-1))
    .toBe('Ungroup');
  await selectBoth(page, children);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+g');
  await expect
    .poll(async () => (await groupNamed(page, 'Neon night title')).length)
    .toBe(1);
  // The group's clip carries the name too.
  group = (await groupNamed(page, 'Neon night title'))[0]!;
  const state = await hook(page);
  const clip = state.project.compositions
    .find((item) => item.id === state.session.compositionId)!
    .tracks.flatMap((track) => track.clips)
    .find((item) => item.layerId === group.id)!;
  expect(clip.name).toBe('Neon night title');
});

test('[RA-002][RA-003] layers that never were one group are named after the first child; a refused Ungroup shows one toast with the reason', async ({
  page,
}) => {
  await showCategory(page, 'Text');
  await page.locator('.library-card[data-item-id="text-1"]').first().click();
  const first = (await selectedIds(page))[0]!;
  await page.locator('.library-card[data-item-id="text-2"]').first().click();
  const second = (await selectedIds(page))[0]!;
  await showCategory(page, 'Scene');
  await selectBoth(page, [first, second]);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+g');
  await expect(toast(page, 'Grouped 2 layers')).toHaveCount(1);
  const names = (await layers(page))
    .filter((layer) => layer.type === 'group')
    .map((layer) => layer.name);
  expect(names).not.toContain('Group');
  // A background group: the timeline's Ungroup says why, once.
  await showGraphics(page);
  await page
    .locator('.library-card[data-item-id="bg-layered-1"]')
    .first()
    .click();
  const background = (await selectedIds(page))[0]!;
  const steps = (await hook(page)).history.labels.length;
  for (let i = 0; i < 2; i++) {
    await clipMenu(page, background);
    await timelineMenu(page).locator('[data-command="ungroup"]').click();
  }
  await expect(toast(page, 'Background is one block')).toHaveCount(1);
  expect((await hook(page)).history.labels.length).toBe(steps);
});
