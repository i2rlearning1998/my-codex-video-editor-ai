import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, toScreen } from './fixtures';
import {
  MOVE,
  MOVE_ID,
  applyAiPreset,
  importPack,
  selectBadge,
} from './creator-helpers';

// R5: My Templates, a left-rail category on the shared library panel. Save
// from the canvas and timeline menus by kind, tabs from what is saved, Add to
// scene like a library item, kept across a reload, never an undo step.
// Default example: "example-badge" at 76,456 (224×48).
const mine = (page: Page) => page.locator('#library-mine');
const toast = (page: Page, text: string) =>
  page.locator('.toast:not(.toast-leaving)', { hasText: text });
const tabs = (page: Page) =>
  mine(page)
    .locator('.shelf-tab')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.tab),
    );
interface Layer {
  id: string;
  name: string;
  transform: Record<string, { keyframes: unknown[] }>;
  children: Layer[];
}
const layers = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (c) => c.id === state.session.compositionId,
  )!.layers as unknown as Layer[];
};
const canvasMenu = (page: Page) => page.locator('#canvas-context-menu');
async function rightClickBadge(page: Page) {
  const point = await toScreen(page, 80, 460);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(canvasMenu(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[RA-014][RA-015][RA-016] Save to My Templates › Animation keeps the keyframes; the toast opens My Templates; tabs come from saved kinds; Add to scene places a copy; nothing is an undo step', async ({
  page,
}) => {
  // Templates has no My Templates section any more.
  await showCategory(page, 'Templates');
  await expect(
    page.locator('#library-templates [data-section="my"]'),
  ).toHaveCount(0);
  // An animated badge (an AI preset writes position keyframes).
  await importPack(page, MOVE);
  await selectBadge(page);
  await applyAiPreset(page, MOVE_ID);
  const frames = async () =>
    (await layers(page)).find((l) => l.id === 'example-badge')!.transform
      .position!.keyframes.length;
  await expect.poll(frames).toBeGreaterThan(0);
  const keyframes = await frames();
  const steps = (await hook(page)).history.labels.length;
  await rightClickBadge(page);
  await canvasMenu(page).locator('[data-action="save-to-mine"]').click();
  await canvasMenu(page)
    .locator('[data-action="save-to-mine-animation"]')
    .click();
  const saved = toast(page, 'Saved to My Templates › Animation');
  await expect(saved).toHaveCount(1);
  expect((await hook(page)).history.labels.length).toBe(steps);
  await saved.getByRole('button', { name: 'Open' }).click();
  await expect(
    page.locator('#rail-left [data-category="MyTemplates"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await tabs(page)).toEqual(['all', 'animation']);
  await expect(mine(page)).toHaveAttribute('data-tab', 'animation');
  // Undo never removes it.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  await expect(mine(page).locator('.shelf-item')).toHaveCount(1);
  await page.keyboard.press('Control+y');
  // "+" adds a copy, keyframes and all, in one step.
  const ids = new Set((await layers(page)).map((layer) => layer.id));
  const before = ids.size;
  const item = mine(page).locator('.shelf-item').first();
  await item.hover();
  await item.locator('.shelf-plus').click();
  await expect.poll(async () => (await layers(page)).length).toBe(before + 1);
  const copy = (await layers(page)).find((layer) => !ids.has(layer.id))!;
  expect(copy.transform.position!.keyframes.length).toBe(keyframes);
  expect((await hook(page)).history.labels.at(-1)).toBe(
    'Add from My Templates',
  );
  // Renaming the saved item never renames the placed copy.
  await item.locator('.shelf-card').click({ button: 'right' });
  await page.locator('#mine-menu [data-action="mine-rename"]').click();
  await page.locator('[data-role="prompt-input"]').fill('Sliding badge');
  await page.keyboard.press('Enter');
  await expect(item).toContainText('Sliding badge');
  expect((await layers(page)).find((l) => l.id === copy.id)!.name).toBe(
    copy.name,
  );
  // A reload keeps it (My library, not the project).
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'MyTemplates');
  await expect(mine(page).locator('.shelf-item')).toContainText(
    'Sliding badge',
  );
  // Deleting the last Animation removes its tab.
  await mine(page).locator('.shelf-card').first().click({ button: 'right' });
  await page.locator('#mine-menu [data-action="mine-delete"]').click();
  await expect.poll(() => tabs(page)).toEqual([]);
});

test('[RA-015][RA-016] several layers save as one Group item; nothing selected saves the scene; the timeline menu saves by kind', async ({
  page,
}) => {
  // Two layers from the Scene list, saved from the timeline menu.
  await showCategory(page, 'Scene');
  const rows = page.locator('#scene-list .outliner-row[data-row-kind="layer"]');
  await rows.nth(0).click();
  await page.keyboard.down('Shift');
  await rows.nth(1).click();
  await page.keyboard.up('Shift');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(2);
  const id = (await hook(page)).session.selectedIds[0]!;
  const timelineMenu = page.locator('#timeline-foundation .timeline-menu');
  await expect(async () => {
    await page
      .locator(`#timeline-foundation .timeline-clip[data-id="${id}"]`)
      .click({ button: 'right', position: { x: 20, y: 10 } });
    await expect(timelineMenu).toBeVisible({ timeout: 1000 });
  }).toPass();
  // S1 (D-266): several layers save as Group (or the Scene).
  await timelineMenu.locator('[data-action="save-mine"]').click();
  await timelineMenu
    .locator(
      '.timeline-submenu [data-action="save-mine-kind"][data-kind="group"]',
    )
    .click();
  await expect(toast(page, 'Saved to My Templates › Group')).toHaveCount(1);
  // Nothing selected: the empty canvas saves the scene.
  await page.keyboard.press('Escape');
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Escape');
  const corner = await toScreen(page, 1270, 10);
  await page.mouse.click(corner.x, corner.y, { button: 'right' });
  await expect(canvasMenu(page)).toBeVisible();
  await canvasMenu(page).locator('[data-action="save-scene-to-mine"]').click();
  await expect(toast(page, 'Saved to My Templates › Scene')).toHaveCount(1);
  await showCategory(page, 'MyTemplates');
  expect(await tabs(page)).toEqual(['all', 'group', 'scene']);
  // A single layer from the timeline menu: Save to My Templates › Shape.
  await selectBadge(page);
  await expect(async () => {
    await page
      .locator('#timeline-foundation .timeline-clip[data-id="example-badge"]')
      .click({ button: 'right', position: { x: 20, y: 10 } });
    await expect(timelineMenu).toBeVisible({ timeout: 1000 });
  }).toPass();
  await timelineMenu.locator('[data-action="save-mine"]').click();
  await page
    .locator(
      '.timeline-submenu [data-action="save-mine-kind"][data-kind="shape"]',
    )
    .click();
  await expect(toast(page, 'Saved to My Templates › Shape')).toHaveCount(1);
  await showCategory(page, 'MyTemplates');
  expect(await tabs(page)).toEqual(['all', 'shape', 'group', 'scene']);
});
