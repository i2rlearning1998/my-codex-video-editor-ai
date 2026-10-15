import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  mode2d,
  openInspector,
  openRight,
  seekKeep,
} from './fixtures';
import {
  FADE,
  FADE_ID,
  MOVE,
  MOVE_ID,
  badge,
  frames,
  importPack,
  panel,
  selectBadge,
} from './creator-helpers';

// Q2: Animate › Creator is one choice with None; the Controls say what is
// animated, remove an animation, never keep orphan controls; Delete removes
// only the selected keyframe.
const creatorCard = (page: Page, id: string) =>
  panel(page).locator(
    `.animate-card[data-creator="true"][data-preset="${id}"]`,
  );
const pressed = (page: Page) =>
  panel(page)
    .locator('.animate-card[data-creator="true"][aria-pressed="true"]')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.preset),
    );
const labels = async (page: Page) => (await hook(page)).history.labels;
async function openCreator(page: Page) {
  await openRight(page, 'Animate');
  await panel(page).locator('.animate-tabs [data-tab="creator"]').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[QT-004][QT-005][QT-006] Creator is one choice with None; Controls say what is animated; Remove animation removes it in one step', async ({
  page,
}) => {
  await importPack(page, MOVE);
  await importPack(page, FADE);
  await selectBadge(page);
  await openCreator(page);
  expect(await pressed(page)).toEqual(['none']);
  await creatorCard(page, MOVE_ID).click();
  await expect.poll(() => pressed(page)).toEqual([MOVE_ID]);
  // A second preset replaces the first (only one is highlighted).
  await creatorCard(page, FADE_ID).click();
  await expect.poll(() => pressed(page)).toEqual([FADE_ID]);
  expect((await badge(page)).layer.transform.position!.animated).toBe(false);
  expect((await frames(page, 'opacity')).length).toBe(2);
  // Controls: the line says what is animated.
  await openRight(page, 'Code');
  await expect(panel(page).locator('#controls-summary')).toHaveText(
    'Animating: Opacity - 0.0s to 1.0s',
  );
  // Add animation adds Move; the line lists both.
  await panel(page).locator('#controls-add').click();
  await panel(page)
    .locator(`.controls-add-item[data-preset="${MOVE_ID}"]`)
    .click();
  await expect(panel(page).locator('#controls-summary')).toHaveText(
    'Animating: Move - 0.0s to 1.0s, Opacity - 0.0s to 1.0s',
  );
  // Remove animation on Move: record, keyframes and controls go, one step.
  const steps = (await labels(page)).length;
  await panel(page)
    .locator(
      `.controls-preset[data-preset="${MOVE_ID}"] [data-action="controls-remove"]`,
    )
    .click();
  await expect.poll(async () => (await labels(page)).length).toBe(steps + 1);
  expect((await labels(page)).at(-1)).toBe('Remove animation');
  expect((await badge(page)).layer.transform.position!.animated).toBe(false);
  expect((await badge(page)).layer.transform.position!.keyframes).toEqual([]);
  await expect(
    panel(page).locator(`.controls-preset[data-preset="${MOVE_ID}"]`),
  ).toHaveCount(0);
  await expect(panel(page).locator('#controls-summary')).toHaveText(
    'Animating: Opacity - 0.0s to 1.0s',
  );
  // None in Animate › Creator removes the rest.
  await openCreator(page);
  await creatorCard(page, 'none').click();
  await expect.poll(() => pressed(page)).toEqual(['none']);
  expect((await badge(page)).layer.transform.opacity!.animated).toBe(false);
  await page.locator('#undo').click();
  await expect.poll(() => pressed(page)).toEqual([FADE_ID]);
});

test('[QT-007] keyframes deleted by hand leave no orphan controls', async ({
  page,
}) => {
  await importPack(page, MOVE);
  await selectBadge(page);
  await openCreator(page);
  await creatorCard(page, MOVE_ID).click();
  await expect.poll(() => pressed(page)).toEqual([MOVE_ID]);
  const { start } = await badge(page);
  // Switching to 2D Animation afterwards shows the preset's diamonds.
  await mode2d(page);
  const diamond = (time: number) =>
    page.locator(
      `.timeline-keyframe[data-id="example-badge"][data-time="${time}"]`,
    );
  // One keyframe deleted: Edited manually with Reset to controls.
  await diamond(start + 1).click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await frames(page)).length).toBe(1);
  await openRight(page, 'Code');
  const box = panel(page).locator(`.controls-preset[data-preset="${MOVE_ID}"]`);
  await expect(box).toHaveAttribute('data-edited', 'true');
  await expect(box.locator('[data-action="controls-reset"]')).toBeVisible();
  // The last one deleted: the preset's controls are gone, and so is the tab.
  await diamond(start).click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await frames(page)).length).toBe(0);
  await expect(box).toHaveCount(0);
  await expect(
    page.locator('#rail-right [data-section="Code"]:visible'),
  ).toHaveCount(0);
});

test('[QT-008] Delete removes only the selected keyframe, not one at a nearby time', async ({
  page,
}) => {
  await mode2d(page);
  await selectBadge(page);
  // Position keyframes at 1.0 s and 1.1 s (diamonds side by side).
  await seekKeep(page, 1);
  await openRight(page, 'Properties');
  await page
    .locator(
      '#animation-panel [data-property="position"] [data-action="stopwatch"]',
    )
    .click();
  await seekKeep(page, 1.1);
  await openInspector(page);
  const x = page.locator('#inspector-content input[aria-label="Position X"]');
  await x.fill('300');
  await x.press('Enter');
  await expect
    .poll(async () => (await frames(page)).map((frame) => frame.time))
    .toEqual([1, 1.1]);
  const diamond = (time: number) =>
    page.locator(
      `.timeline-keyframe[data-id="example-badge"][data-time="${time}"]`,
    );
  // Both selected, then a plain click on one: only it stays selected.
  await diamond(1).click({ position: { x: 2, y: 8 } });
  await diamond(1.1).click({ modifiers: ['Shift'] });
  await expect
    .poll(async () => (await hook(page)).session.selectedKeyframes.length)
    .toBe(2);
  await diamond(1.1).click();
  await expect
    .poll(async () => (await hook(page)).session.selectedKeyframes)
    .toEqual([{ layerId: 'example-badge', time: 1.1 }]);
  await page.keyboard.press('Delete');
  await expect
    .poll(async () => (await frames(page)).map((frame) => frame.time))
    .toEqual([1]);
});
