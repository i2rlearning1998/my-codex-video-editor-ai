import type { Page } from '@playwright/test';
import { test, expect, hook, openRightPanel } from './fixtures';

// I4: the right panel per object.
const tab = (page: Page, name: string) =>
  page.locator(`#rail-right [data-section="${name}"]`);
const panel = (page: Page) => page.locator('#right-section');
const labels = async (page: Page) => (await hook(page)).history.labels;
/** A layer anywhere in the first scene (groups included). */
const layerOf = async (page: Page, id: string): Promise<any> => {
  const find = (layers: any[]): any =>
    layers.reduce(
      (found, layer) =>
        found ?? (layer.id === id ? layer : find(layer.children)),
      null,
    );
  return find((await hook(page)).project.compositions[0]!.layers as any[]);
};
async function select(page: Page, id: string) {
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([id]);
  // V7 (spec 10.1): a selection never opens the panel; its rail does.
  await openRightPanel(page);
}
const accordions = (page: Page) =>
  panel(page)
    .locator('.right-accordion-head')
    .evaluateAll((items) => items.map((item) => item.textContent?.trim()));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[LAY-041] nothing selected: no Canvas panel; the canvas bar holds size, background and frame rate (U5)', async ({
  page,
}) => {
  // T-ALL (D-183): nothing selected shows no right panel at all.
  await expect(page.locator('.inspector')).toBeHidden();
  // V7 (spec 10.1): the rail stays, holding a disabled Auto Caption.
  await expect(page.locator('#rail-right button:not([hidden])')).toHaveCount(1);
  // The stage around the artboard shows the canvas bar (CV-057).
  const stage = (await page.locator('#canvas-stage').boundingBox())!;
  await page.mouse.click(stage.x + 6, stage.y + stage.height - 60);
  const bar = page.locator('#context-toolbar');
  await expect(bar).toHaveAttribute('data-mode', 'canvas');
  for (const control of ['canvas-size', 'canvas-background', 'canvas-fps'])
    await expect(bar.locator(`[data-control="${control}"]`)).toBeVisible();
  // Size: a preset applies to the open scene (J1), one step.
  await bar.locator('[data-control="canvas-size"]').click();
  await page
    .locator('.toolbar-popover .canvas-size-preset[data-preset="square"]')
    .click();
  const scene = (await hook(page)).project.compositions[0]!;
  expect([scene.width, scene.height]).toEqual([1080, 1080]);
  expect((await labels(page)).at(-1)).toBe('Canvas size');
});

test('[LAY-042] a shape: Color, Outline (weight, dash, caps, joins), Corners and Combine; Adjust colors has Transparency, the rest planned', async ({
  page,
}) => {
  await select(page, 'example-paper');
  await expect(tab(page, 'Properties')).toHaveAttribute('aria-label', 'Shape');
  expect(await accordions(page)).toEqual([
    'Color',
    'Outline',
    'Corners',
    'Boolean',
  ]);
  // Outline weight, one step.
  const width = panel(page).locator('#right-width');
  await width.fill('6');
  await width.press('Enter');
  expect(
    (await layerOf(page, 'example-paper')).properties.strokeWidth.value,
  ).toBe(6);
  // Combine needs two shapes: disabled with the reason.
  await expect(
    panel(page).locator('[data-action="right-combine-union"]'),
  ).toHaveAttribute('aria-disabled', 'true');
  // Transform and Timing follow, folded.
  await expect(page.locator('#inspector-position-x')).toBeHidden();
  // Adjust colors.
  await tab(page, 'Adjust').click();
  const opacity = panel(page).locator('#right-opacity');
  await opacity.fill('50');
  await opacity.press('Enter');
  expect(
    (await layerOf(page, 'example-paper')).transform.opacity.value,
  ).toBeCloseTo(0.5);
  for (const id of ['exposure', 'contrast', 'saturation', 'temperature'])
    await expect(panel(page).locator(`#right-adjust-${id}`)).toBeDisabled();
  await expect(panel(page).locator('#right-blend-mode')).toBeDisabled();
  await expect(
    panel(page).locator('[data-action="right-adjust-reset"]'),
    // T-ALL P6 (D-189): the colour controls are live for clips; a group's
    // child has no clip of its own, so they say why they are off.
  ).toHaveAttribute(
    'title',
    'Select elements that have clips on the timeline.',
  );
  // J15: Effects opens: the outline is the stroke (live), shadows are
  // planned and say so.
  await tab(page, 'Effects').click();
  await expect(panel(page).locator('#right-width')).toBeVisible();
  await expect(panel(page).locator('#right-shadow-blur')).toBeDisabled();
  await expect(
    panel(page).locator('.right-row-planned').first(),
  ).toHaveAttribute('title', 'Planned: Wave 6 (FX-001)');
});

test('[LAY-043] text: font, size, B I U S, case, align, colour and spacing in the Text tab, one step each', async ({
  page,
}) => {
  await select(page, 'example-headline');
  expect(await accordions(page)).toEqual(['Text', 'Spacing and more']);
  await panel(page).locator('[data-action="right-italic"]').click();
  let layer = await layerOf(page, 'example-headline');
  expect(layer.properties.fontStyle.value).toBe('italic');
  await expect(
    panel(page).locator('[data-action="right-italic"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  const size = panel(page).locator('#right-font-size');
  await size.fill('64');
  await size.press('Enter');
  layer = await layerOf(page, 'example-headline');
  expect(layer.properties.fontSize.value).toBe(64);
  await panel(page).locator('#right-font').click();
  await page.locator('[role="option"]', { hasText: 'Georgia' }).click();
  layer = await layerOf(page, 'example-headline');
  expect(layer.properties.fontFamily.value).toBe('Georgia');
  expect((await labels(page)).slice(-3)).toEqual([
    'Set italic',
    'Set font size',
    'Set font',
  ]);
  // The toolbar shows the same values (one implementation).
  await expect(
    page.locator('#context-toolbar [data-control="italic"]'),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('[LAY-044] a group: Group with Ungroup and Align; a multi-selection: Arrange with Group, Align and Distribute', async ({
  page,
}) => {
  await select(page, 'example-cards');
  await expect(tab(page, 'Properties')).toHaveAttribute('aria-label', 'Group');
  expect(await accordions(page)).toEqual(['Group', 'Align']);
  await panel(page).locator('[data-action="right-ungroup"]').click();
  expect((await labels(page)).at(-1)).toBe('Ungroup');
  // Now several layers are selected: Arrange.
  await expect(tab(page, 'Properties')).toHaveAttribute(
    'aria-label',
    'Arrange',
  );
  await expect.poll(() => accordions(page)).toEqual(['Arrange', 'Align']);
  await panel(page).locator('[data-action="right-align-left"]').click();
  expect((await labels(page)).at(-1)).toBe('Align layers');
  await panel(page).locator('[data-action="right-group"]').click();
  expect((await labels(page)).at(-1)).toBe('Group');
});

test('[LAY-045] media: an image has Image (Crop, Flip, Corners, Border) and Filters planned; a video has Speed, Audio (mute, detach) and Fade', async ({
  page,
  openFixtureProject,
}) => {
  await openFixtureProject('nle-example.json');
  await select(page, 'layer-c');
  // V4 (spec 5): the first tab is named after the picture.
  await expect(tab(page, 'Properties')).toHaveAttribute('aria-label', 'Image');
  await expect(panel(page).locator('[data-action="right-crop"]')).toBeVisible();
  await expect(
    panel(page)
      .locator('#right-flip-horizontal, [data-control="flip-horizontal"]')
      .first(),
  ).toBeVisible();
  // J15: Filters lists the looks; T-ALL P6 (D-189): they are the FX
  // library's filters, all live, Original first.
  await tab(page, 'Filters').click();
  // V4: tiles (spec 5), None first and selected.
  await expect(
    panel(page).locator('.fx-tile[data-tile="none"]'),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    panel(page).locator('.fx-tile[data-tile="retro"]'),
  ).not.toHaveAttribute('aria-disabled', 'true');
  await tab(page, 'Properties').click();
  await panel(page).locator('[data-action="right-crop"]').click();
  await expect(page.locator('[data-tool-panel="crop"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await select(page, 'layer-a');
  await expect(tab(page, 'Properties')).toHaveAttribute('aria-label', 'Video');
  await tab(page, 'Audio').click();
  await expect(panel(page).locator('#right-volume')).toBeDisabled();
  await panel(page).locator('[data-action="right-mute"]').click();
  expect((await labels(page)).at(-1)).toBe('Mute track');
  await panel(page).locator('[data-action="right-detach-audio"]').click();
  expect((await labels(page)).at(-1)).toBe('Detach audio');
});
