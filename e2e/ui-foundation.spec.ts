import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  artboard,
  showCategory,
  openInspector,
} from './fixtures';
import { choose, pickColor, reveal } from './controls';

// G1: shared UI foundation. Rail categories, number fields, selects, colour
// picker, menus, side panels and focus states.
const ready = async (page: Page) =>
  expect.poll(async () => page.evaluate(() => '__AIVE__' in window)).toBe(true);
/** The visible panels in the left library, by their rail tag. */
const visiblePanels = (page: Page) =>
  page
    .locator('.library [data-rail-panel]:visible')
    .evaluateAll((items) => [
      ...new Set(items.map((item) => (item as HTMLElement).dataset.railPanel)),
    ]);

test('[LAY-002] each rail category shows only its own panel, on first load, after every switch and after a reload', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  // First load: the Scene category, and nothing from Media.
  expect(await visiblePanels(page)).toEqual(['Scene']);
  await expect(page.locator('#asset-search')).toBeHidden();
  await expect(page.locator('#import-media')).toBeHidden();
  const expected: Record<string, string> = {
    Media: 'Media',
    Elements: 'Elements',
    // H5: Text and Templates hold the library; I2: Graphics live inside
    // Elements, Transitions is a browse panel, Draw is a palette over the
    // canvas (no left panel); Audio is still a placeholder.
    Text: 'Text',
    Templates: 'Templates',
    Transitions: 'Transitions',
    Audio: 'placeholder',
    Scene: 'Scene',
  };
  for (const [category, panel] of Object.entries(expected)) {
    await showCategory(page, category);
    expect(await visiblePanels(page)).toEqual([panel]);
  }
  // I2: Draw opens the palette over the canvas and collapses the panel.
  await showCategory(page, 'Draw');
  await expect(page.locator('#draw-palette')).toBeVisible();
  await expect(page.locator('.editor-shell')).toHaveClass(/library-collapsed/);
  await page.locator('#draw-palette-close').click();
  await expect(page.locator('#draw-palette')).toBeHidden();
  // After a reload (the reported bug showed Media and Scene mixed).
  await showCategory(page, 'Media');
  await page.reload();
  await ready(page);
  expect(await visiblePanels(page)).toEqual(['Scene']);
  await expect(page.locator('[data-category="Scene"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

/** Exports the playhead frame as PNG and reads composition pixels from it. */
async function exportedPixels(
  page: Page,
  testInfo: import('@playwright/test').TestInfo,
  points: [number, number][],
) {
  await page.locator('#export').click();
  const saving = page.waitForEvent('download');
  await page.locator('.modal-dialog #export-png').click();
  const file = testInfo.outputPath(`frame-${Date.now()}.png`);
  await (await saving).saveAs(file);
  await page.locator('.modal-dialog .modal-close').click();
  await expect(page.locator('.modal-dialog')).toHaveCount(0);
  const { readFileSync } = await import('node:fs');
  return page.evaluate(
    async ({ png64, points }) => {
      const bytes = Uint8Array.from(atob(png64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' }),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return points.map(([x, y]) => [
        ...context.getImageData(x, y, 1, 1).data.slice(0, 3),
      ]);
    },
    { png64: readFileSync(file).toString('base64'), points },
  );
}
const isGreen = ([r, g, b]: number[]) => g! > 140 && r! < 60 && b! < 60;
const isInk = ([r, g, b]: number[]) => r! + g! + b! < 3 * 90;

test('[SHP-005] stroke joins and caps change the exported frame, not just the stored value', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await ready(page);
  // A rectangle (520,280 240x160) with a 40 px green stroke kept inside it.
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="rectangle"]').click();
  await pickColor(page, 'toolbar-stroke', '#00aa00');
  const width = await reveal(page, 'toolbar-width');
  await width.fill('40');
  await width.press('Enter');
  // Sharp (miter) joins fill the outer corner; round joins leave it empty.
  const corner: [number, number] = [522, 282];
  expect(isGreen((await exportedPixels(page, testInfo, [corner]))[0]!)).toBe(
    true,
  );
  await choose(page, 'toolbar-join', 'round');
  expect(isGreen((await exportedPixels(page, testInfo, [corner]))[0]!)).toBe(
    false,
  );
  // Caps on a line (520..760 at y 360, 30 px): square reaches past the end.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="line"]').click();
  const lineWidth = await reveal(page, 'toolbar-width');
  await lineWidth.fill('30');
  await lineWidth.press('Enter');
  const beyond: [number, number] = [770, 360];
  await choose(page, 'toolbar-cap', 'butt');
  expect(isInk((await exportedPixels(page, testInfo, [beyond]))[0]!)).toBe(
    false,
  );
  await choose(page, 'toolbar-cap', 'square');
  expect(isInk((await exportedPixels(page, testInfo, [beyond]))[0]!)).toBe(
    true,
  );
});

const selectLayer = async (page: Page, id: string) => {
  await showCategory(page, 'Scene');
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([id]);
};
const badge = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers.find(
    (item) => item.id === 'example-badge',
  )!;
const labels = async (page: Page) => (await hook(page)).history.labels;

test('[INS-006][INS-007][LAY-023] number fields scrub, type, step with arrows, revert with Escape, clamp, and offer a slider and presets', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await ready(page);
  await selectLayer(page, 'example-badge');
  await openInspector(page);
  const x = page.getByRole('spinbutton', { name: 'Position X', exact: true });
  await expect(x).toHaveValue('76');
  // Scrub: drag the label right; the value previews and commits once.
  const label = page.locator('#inspector-content dt label', {
    hasText: 'Position X',
  });
  const box = (await label.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + box.height / 2, { steps: 8 });
  expect(await labels(page)).toEqual([]);
  await page.mouse.up();
  // 40 px of drag at 0.5 units per px.
  await expect(x).toHaveValue('96');
  expect((await badge(page)).transform.position.value[0]).toBe(96);
  expect(await labels(page)).toHaveLength(1);
  // Shift scrubs finely (a tenth).
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(x).toHaveValue('98');
  // Arrow keys step (Shift ×10) and keep focus across the re-render.
  await x.click();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');
  await expect(x).toHaveValue('109');
  await expect(x).toBeFocused();
  // Escape reverts a typed value; Enter commits.
  await x.fill('300');
  await x.press('Escape');
  await expect(x).toHaveValue('109');
  await x.fill('150');
  await x.press('Enter');
  expect((await badge(page)).transform.position.value[0]).toBe(150);
  // Opacity is 0-100 %, clamps, and has a slider and presets.
  const opacity = page.getByRole('spinbutton', {
    name: 'Opacity',
    exact: true,
  });
  await opacity.fill('150');
  await opacity.press('Enter');
  await expect(opacity).toHaveValue('100');
  await page.locator('#inspector-opacity-more').click();
  await expect(page.locator('#inspector-opacity-slider')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('number-popover.png') });
  await page.locator('.popover [data-preset="50"]').click();
  await expect(opacity).toHaveValue('50');
  expect((await badge(page)).transform.opacity.value).toBe(0.5);
  // The toolbar uses the same field, with units (Transparency, in %).
  await page.locator('#context-toolbar [data-control="transparency"]').click();
  await expect(
    page.locator('.toolbar-popover .number-field-unit').first(),
  ).toHaveText('%');
});

test('[LAY-018] the custom select opens a listbox, moves with the keyboard, and closes on Escape or an outside click', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await selectLayer(page, 'example-subtitle');
  const align = page.locator('#toolbar-align');
  await expect(align).toHaveAttribute('data-value', 'left');
  await align.focus();
  await page.keyboard.press('ArrowDown');
  const list = page.locator('.select-popover');
  await expect(list).toBeVisible();
  await expect(list.locator('[aria-selected="true"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(align).toHaveAttribute('data-value', 'center');
  await expect(list).toHaveCount(0);
  expect((await labels(page)).at(-1)).toBe('Set text alignment');
  // Escape closes without choosing; so does an outside click.
  await align.click();
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(align).toBeFocused();
  await align.click();
  await page.mouse.click(10, 990);
  await expect(list).toHaveCount(0);
  await expect(align).toHaveAttribute('data-value', 'center');
  // H3: the Font panel shows each font in its own face.
  await page.locator('#toolbar-font').click();
  await expect(
    page.locator('[data-tool-panel="font"] [data-font="Georgia"]'),
  ).toHaveCSS('font-family', /Georgia/);
});

test('[LAY-022] the colour picker edits by square, hue, hex and swatches, lists recent and design colours, and offers No fill', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await ready(page);
  await selectLayer(page, 'example-badge');
  await page.locator('#toolbar-fill').click();
  const panel = page.locator('[data-deep-panel="colour"]');
  await expect(panel).toBeVisible();
  // It opens in the left side panel, beside the canvas, not over it.
  const library = (await page.locator('.library').boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(
    library.x + library.width + 1,
  );
  // Colours already in the design, and the defaults.
  await expect(
    panel.locator('[data-row="document"] [data-color="#cbbced"]'),
  ).toBeVisible();
  await panel.locator('[data-row="defaults"] [data-color="#ff3131"]').click();
  expect((await badge(page)).properties.fill!.value).toBe('#ff3131');
  expect((await labels(page)).at(-1)).toBe('Set color');
  // The hex field; a bad value is refused in place.
  const hex = page.locator('#color-picker-hex');
  await hex.fill('zz');
  await hex.press('Enter');
  await expect(hex).toHaveAttribute('aria-invalid', 'true');
  await hex.fill('#00aa00');
  await hex.press('Enter');
  expect((await badge(page)).properties.fill!.value).toBe('#00aa00');
  // A drag on the square previews and commits once, on release.
  const before = (await labels(page)).length;
  const square = (await panel.locator('.color-square').boundingBox())!;
  await page.mouse.move(square.x + 10, square.y + 10);
  await page.mouse.down();
  await page.mouse.move(square.x + square.width - 5, square.y + 20, {
    steps: 6,
  });
  expect(await labels(page)).toHaveLength(before);
  await page.mouse.up();
  expect(await labels(page)).toHaveLength(before + 1);
  // Recently used colours are offered.
  await expect(
    panel.locator('[data-row="recent"] [data-color="#00aa00"]'),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('colour-panel.png') });
  // No fill.
  await panel.locator('[data-action="no-fill"]').click();
  expect((await badge(page)).properties.fillEnabled!.value).toBe(false);
  await expect(page.locator('#toolbar-fill')).toHaveAttribute(
    'data-value',
    'none',
  );
});

test('[LAY-030][CV-043] right-click submenus open on hover, keep open on a diagonal move, work by keyboard, and the menu needs no scrollbar', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await ready(page);
  await selectLayer(page, 'example-badge');
  const board = await artboard(page);
  const at = (x: number, y: number) => ({
    x: board.x + x * board.scale,
    y: board.y + y * board.scale,
  });
  const point = at(150, 470);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const menu = page.locator('#canvas-context-menu');
  await expect(menu).toBeVisible();
  // No scrollbar, and every item (Copy style included) is on screen.
  expect(
    await menu.evaluate(
      (element) => element.scrollHeight <= element.clientHeight,
    ),
  ).toBe(true);
  await expect(menu.locator('[data-action="copy-style"]')).toBeInViewport();
  for (const action of ['toggle-enabled', 'link', 'unlink'])
    await expect(menu.locator(`[data-action="${action}"]`)).toHaveCount(0);
  // Hover opens the Layer submenu after a short delay, without a click.
  const arrange = menu.locator(':scope > [data-action="arrange"]');
  await arrange.hover();
  const flyout = menu.locator('.menu-flyout');
  await expect(flyout).toBeVisible();
  await expect(flyout.locator('[data-action="arrange-front"]')).toBeVisible();
  // A diagonal move across a sibling toward the flyout keeps it open.
  const target = (await flyout
    .locator('[data-action="arrange-back"]')
    .boundingBox())!;
  const from = (await arrange.boundingBox())!;
  await page.mouse.move(from.x + from.width - 10, from.y + from.height / 2);
  await page.mouse.move(target.x + 10, target.y + target.height / 2, {
    steps: 8,
  });
  await expect(flyout).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('menu-flyout.png') });
  // Keyboard: Left closes the flyout, Right opens it on the parent.
  await flyout.locator('[data-action="arrange-back"]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(flyout).toHaveCount(0);
  await expect(arrange).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(menu.locator('.menu-flyout')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu.locator('.menu-flyout')).toHaveCount(0);
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('[LAY-028] deep panels open in the left side panel with Back and never cover the canvas; Spacing is a popover under the toolbar', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  const outsideCanvas = async (selector: string) => {
    const box = (await page.locator(selector).boundingBox())!;
    return box.x + box.width <= canvas.x + 1;
  };
  await selectLayer(page, 'example-badge');
  for (const [control, id] of [
    ['position', 'position'],
    // (U5: Animate is a right-panel tab now; ANI-023.)
  ] as const) {
    await page.locator(`#context-toolbar [data-control="${control}"]`).click();
    const panel = page.locator(`[data-deep-panel="${id}"]`);
    await expect(panel).toBeVisible();
    expect(await outsideCanvas(`[data-deep-panel="${id}"]`)).toBe(true);
    // The rail's own content is hidden while it is open.
    await expect(page.locator('#scene-list')).toBeHidden();
    await panel.locator('[data-action="side-panel-back"]').click();
    await expect(panel).toBeHidden();
    await expect(page.locator('#scene-list')).toBeVisible();
  }
  // Spacing and Stroke style are quick popovers: they float, so the canvas
  // does not move.
  await page.locator('#context-toolbar [data-control="stroke-style"]').click();
  await expect(page.locator('#toolbar-width')).toBeVisible();
  await page.keyboard.press('Escape');
  await selectLayer(page, 'example-subtitle');
  await page.locator('#context-toolbar [data-control="spacing"]').click();
  await expect(page.locator('#toolbar-line-height')).toBeVisible();
  expect(await page.locator('#composition-canvas').boundingBox()).toEqual(
    canvas,
  );
  await expect(page.locator('.toolbar-row')).toHaveCount(0);
});

test('[LAY-024][LAY-027][LAY-029] buttons show hover, pressed and focus states; scrollbars are thin and themed', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const media = page.locator('[data-category="Media"]');
  const background = () =>
    media.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.mouse.move(5, 995);
  const idle = await background();
  // Hover (after its short transition) changes the background.
  await media.hover();
  await expect.poll(background).not.toBe(idle);
  await page.mouse.move(5, 995);
  await expect.poll(background).toBe(idle);
  // Pressed: the button shifts and darkens while the pointer is down.
  const exportButton = page.locator('#export');
  const exportBox = (await exportButton.boundingBox())!;
  await page.mouse.move(exportBox.x + 10, exportBox.y + 10);
  await page.mouse.down();
  expect(
    await exportButton.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
  ).not.toBe('none');
  await page.mouse.move(5, 995);
  await page.mouse.up();
  // Keyboard focus draws the focus ring.
  await page.keyboard.press('Tab');
  const focusedOutline = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    return getComputedStyle(element).outlineStyle;
  });
  expect(focusedOutline).toBe('solid');
  // Thin, themed scrollbars; hidden in side panels until hover.
  const inspector = page.locator('.inspector');
  expect(
    await inspector.evaluate(
      (element) => getComputedStyle(element).scrollbarWidth,
    ),
  ).toBe('thin');
  const hiddenColor = await inspector.evaluate(
    (element) => getComputedStyle(element).scrollbarColor,
  );
  await inspector.hover();
  const hoverColor = await inspector.evaluate(
    (element) => getComputedStyle(element).scrollbarColor,
  );
  expect(hiddenColor).not.toBe(hoverColor);
});
