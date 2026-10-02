import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  showGraphics,
  toScreen,
} from './fixtures';
import { toolbarButton } from './controls';

// I1: fixes for the H-series test findings. Side panels animate their real
// width, toolbar buttons open a collapsed panel, library cards drag onto the
// canvas, templates ask where they go, the canvas bar, the undo rules and
// the media item menu.

const MEDIA = path.resolve('tests/fixtures/media');
const JPG = 'image_testsrc_1200x800.jpg';
const PNG = 'image_gradient_1920x1080.png';

const shell = (page: Page) => page.locator('.editor-shell');
const leftOpen = (page: Page) =>
  shell(page).evaluate((s) => !s.classList.contains('library-collapsed'));
const rightOpen = (page: Page) =>
  shell(page).evaluate((s) => !s.classList.contains('inspector-collapsed'));
const leftToggle = (page: Page) => page.locator('[data-panel="left"]');
const rightToggle = (page: Page) => page.locator('[data-panel="right"]');
const card = (page: Page, id: string) =>
  // I2: an item can show in more than one section.
  page.locator(`.library-card[data-item-id="${id}"]`).first();
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const labels = async (page: Page) => (await hook(page)).history.labels;
const listedAssets = async (page: Page) =>
  (await hook(page)).project.assets.filter(
    (asset) => asset.source.kind === 'local' && asset.metadata.removed !== true,
  ).length;

/** Selects a layer from the Scene list, closing a deep side panel first. */
async function selectLayer(page: Page, id: string) {
  if (!(await leftOpen(page))) await leftToggle(page).click();
  const back = page
    .locator('#side-panel-host .deep-panel-back:visible')
    .first();
  if (await back.isVisible()) await back.click();
  await showCategory(page, 'Scene');
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

/**
 * Samples a panel's drawn width on every frame for 400 ms after the next
 * click anywhere (the click `act` performs with the real mouse).
 */
async function sampleWidth(
  page: Page,
  selector: string,
  act: () => Promise<void>,
) {
  const before = await page
    .locator(selector)
    .evaluate((element) => element.getBoundingClientRect().width);
  await page.evaluate((selector) => {
    const element = document.querySelector(selector)!;
    const store = window as unknown as { samples: [number, number][] };
    store.samples = [];
    document.addEventListener(
      'click',
      () => {
        const start = performance.now();
        const tick = () => {
          const time = performance.now() - start;
          store.samples.push([time, element.getBoundingClientRect().width]);
          if (time < 400) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { capture: true, once: true },
    );
  }, selector);
  await act();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { samples: [number, number][] }).samples.at(
            -1,
          )?.[0] ?? 0,
      ),
    )
    .toBeGreaterThan(400);
  const samples = await page.evaluate(
    () => (window as unknown as { samples: [number, number][] }).samples,
  );
  return { before, after: samples.at(-1)![1], samples };
}
/** At 60 to 120 ms the width lies strictly between collapsed and open. */
function expectMidway(result: Awaited<ReturnType<typeof sampleWidth>>) {
  const low = Math.min(result.before, result.after),
    high = Math.max(result.before, result.after);
  expect(high - low).toBeGreaterThan(100);
  // The window runs 60 to 120 ms from when the width starts to change (the
  // last frame still at the start width). On a busy machine the first frame
  // after the click can come late; anchoring on the start keeps the check
  // about the animation, not the machine. A jump with no animation still
  // fails: the next frame is already at the end width.
  const startAt =
    [...result.samples]
      .filter(([, width]) => Math.abs(width - result.before) < 1)
      .at(-1)?.[0] ?? 0;
  let window = result.samples.filter(
    ([time]) => time >= startAt + 60 && time <= startAt + 120,
  );
  // A busy machine may skip frames: use the frame nearest 90 ms.
  if (!window.length)
    window = [
      [...result.samples]
        .filter(([time]) => time > startAt)
        .sort(
          (a, b) =>
            Math.abs(a[0] - startAt - 90) - Math.abs(b[0] - startAt - 90),
        )[0]!,
    ];
  for (const [, width] of window) {
    expect(width).toBeGreaterThan(low + 2);
    expect(width).toBeLessThan(high - 2);
  }
}

test('[LAY-038] the left panel animates its real width when collapsed and opened from the rail and the top-bar toggle', async ({
  page,
}) => {
  const rail = page.locator('#rail-left [data-category="Scene"]');
  expectMidway(await sampleWidth(page, '.library', () => rail.click()));
  expect(await leftOpen(page)).toBe(false);
  expectMidway(await sampleWidth(page, '.library', () => rail.click()));
  expect(await leftOpen(page)).toBe(true);
  expectMidway(
    await sampleWidth(page, '.library', () => leftToggle(page).click()),
  );
  expect(await leftOpen(page)).toBe(false);
  expectMidway(
    await sampleWidth(page, '.library', () => leftToggle(page).click()),
  );
  expect(await leftOpen(page)).toBe(true);
  // The content keeps its open width while the panel narrows (no reflow).
  const body = page.locator('.library > .panel-body');
  const open = await body.evaluate((e) => e.getBoundingClientRect().width);
  await leftToggle(page).click();
  expect(
    await body.evaluate((e) => e.getBoundingClientRect().width),
  ).toBeCloseTo(open, 0);
});

test('[LAY-038] the right panel animates its real width from its rail and its top-bar toggle', async ({
  page,
}) => {
  const active = page.locator('#rail-right button[aria-pressed="true"]');
  const name = (await active.getAttribute('data-section'))!;
  const rail = page.locator(`#rail-right [data-section="${name}"]`);
  expectMidway(await sampleWidth(page, '.inspector', () => rail.click()));
  expect(await rightOpen(page)).toBe(false);
  expectMidway(await sampleWidth(page, '.inspector', () => rail.click()));
  expect(await rightOpen(page)).toBe(true);
  expectMidway(
    await sampleWidth(page, '.inspector', () => rightToggle(page).click()),
  );
  expect(await rightOpen(page)).toBe(false);
  expectMidway(
    await sampleWidth(page, '.inspector', () => rightToggle(page).click()),
  );
  expect(await rightOpen(page)).toBe(true);
});

test('[LAY-038] [LAY-039] a toolbar button opens a collapsed left panel, animated, then shows its content', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await leftToggle(page).click();
  await expect.poll(() => leftOpen(page)).toBe(false);
  const position = await toolbarButton(page, 'position');
  expectMidway(await sampleWidth(page, '.library', () => position.click()));
  expect(await leftOpen(page)).toBe(true);
  await expect(page.locator('#side-panel-host')).toBeVisible();
});

test('[LAY-039] every panel button of the text, shape and image toolbars opens the collapsed left panel', async ({
  page,
}) => {
  const check = async (layerId: string | null, controls: string[]) => {
    for (const control of controls) {
      if (layerId) await selectLayer(page, layerId);
      else {
        if (!(await leftOpen(page))) await leftToggle(page).click();
        const back = page
          .locator('#side-panel-host .deep-panel-back:visible')
          .first();
        if (await back.isVisible()) await back.click();
      }
      await leftToggle(page).click();
      await expect.poll(() => leftOpen(page)).toBe(false);
      await (await toolbarButton(page, control)).click();
      await expect.poll(() => leftOpen(page), control).toBe(true);
      await expect(page.locator('#side-panel-host'), control).toBeVisible();
      await expect(
        page.locator('#side-panel-host .deep-panel-body:visible').first(),
        control,
      ).not.toBeEmpty();
    }
  };
  await check('example-headline', [
    'font',
    'color',
    'effects',
    'animate',
    'position',
  ]);
  await check('example-paper', ['fill']);
  // An image: imported, then added from the media item menu.
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(path.join(MEDIA, JPG));
  const item = page.locator(`.media-item:has(.media-card[data-name="${JPG}"])`);
  await item.hover();
  await item.locator('[data-action="media-more"]').click();
  await page.locator('#media-menu [data-action="media-add"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  await check(null, ['edit-image', 'replace', 'crop']);
});

test('[TPL-012] a dragged library shape, background and text style land at the drop point as one step, never as media', async ({
  page,
}) => {
  const canvas = page.locator('#composition-canvas');
  const box = (await canvas.boundingBox())!;
  const media = await listedAssets(page);
  const drop = async (
    id: string,
    category: string,
    at: { x: number; y: number },
  ) => {
    await showCategory(page, category);
    const steps = (await labels(page)).length;
    await card(page, id).dragTo(canvas, {
      targetPosition: { x: at.x - box.x, y: at.y - box.y },
    });
    await expect.poll(async () => (await labels(page)).length).toBe(steps + 1);
    expect(await listedAssets(page)).toBe(media);
    // The new layer is selected; its drawn box is centred on the drop point.
    const corners = await page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: { getCanvas(): { corners: [number, number][] } };
          }
        ).__AIVE__.getCanvas().corners,
    );
    const cx = corners.reduce((sum, [x]) => sum + x, 0) / corners.length,
      cy = corners.reduce((sum, [, y]) => sum + y, 0) / corners.length;
    return { cx: cx + box.x, cy: cy + box.y };
  };
  const at = await toScreen(page, 300, 200);
  const shape = await drop('shape-star-5', 'Elements', at);
  expect(Math.abs(shape.cx - at.x)).toBeLessThan(3);
  expect(Math.abs(shape.cy - at.y)).toBeLessThan(3);
  expect((await labels(page)).at(-1)).toBe('Add element');
  const at2 = await toScreen(page, 900, 500);
  const text = await drop('text-1', 'Text', at2);
  expect(Math.abs(text.cx - at2.x)).toBeLessThan(3);
  expect(Math.abs(text.cy - at2.y)).toBeLessThan(3);
  // A background covers the canvas wherever it is dropped.
  // I2: Graphics live inside Elements.
  await showGraphics(page);
  const steps = (await labels(page)).length;
  await card(page, 'bg-gradient-1').dragTo(canvas, {
    targetPosition: { x: 40, y: 40 },
  });
  await expect.poll(async () => (await labels(page)).length).toBe(steps + 1);
  expect((await labels(page)).at(-1)).toBe('Add background');
  expect(await listedAssets(page)).toBe(media);
  // The preview image never drags on its own.
  await expect(card(page, 'bg-gradient-1').locator('img')).toHaveAttribute(
    'draggable',
    'false',
  );
  await expect(card(page, 'bg-gradient-1')).toHaveAttribute(
    'draggable',
    'true',
  );
  // Undo removes the last drop only.
  await page.keyboard.press('Control+z');
  expect((await labels(page)).length).toBe(steps);
});

test('[TPL-013] a template asks where it goes, remembers the choice, scales to the canvas and offers Undo', async ({
  page,
}) => {
  const before = (await hook(page)).project.compositions.length;
  await showCategory(page, 'Templates');
  const dialog = page.locator('.modal-dialog');
  // Escape cancels: nothing is added.
  await card(page, 'template-1').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-template-mode="new"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect((await hook(page)).project.compositions).toHaveLength(before);
  // Rapid clicks open one dialog; Enter confirms the default (New scene).
  await page.evaluate(() => {
    const store = window as unknown as { crossfades: number };
    store.crossfades = 0;
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement && node.matches('.scene-crossfade'))
            store.crossfades++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  const at = (await card(page, 'template-1').boundingBox())!;
  for (let i = 0; i < 3; i++)
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
  expect(await dialog.count()).toBeLessThanOrEqual(1);
  expect((await hook(page)).project.compositions).toHaveLength(before);
  if (!(await dialog.isVisible())) await card(page, 'template-1').click();
  await expect(dialog).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  expect((await hook(page)).project.compositions).toHaveLength(before + 1);
  // The canvas crossfades into the new scene (once).
  expect(
    await page.evaluate(
      () => (window as unknown as { crossfades: number }).crossfades,
    ),
  ).toBe(1);
  const toast = page.locator('.toast', { hasText: 'YouTube intro' });
  await expect(toast).toBeVisible();
  // The toast's Undo removes the scene.
  await toast.locator('.toast-action').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions.length)
    .toBe(before);
  // Add onto this scene: chosen with the arrows, remembered next time.
  const layers = (await scene(page)).layers.length;
  await card(page, 'template-2').click();
  await dialog.locator('[data-template-mode="add"]').click();
  await dialog.locator('[data-action="template-confirm"]').click();
  expect((await hook(page)).project.compositions).toHaveLength(before);
  expect((await scene(page)).layers.length).toBeGreaterThan(layers);
  await card(page, 'template-3').click();
  await expect(dialog.locator('[data-template-mode="add"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // Replace this scene: the old layers go, in one step.
  await dialog.locator('[data-template-mode="replace"]').click();
  await page.keyboard.press('Enter');
  const replaced = await scene(page);
  expect(replaced.layers.some((layer) => layer.id.startsWith('example-'))).toBe(
    false,
  );
  expect((await labels(page)).at(-1)).toBe('Replace with template');
  await page.keyboard.press('Control+z');
  expect(
    (await scene(page)).layers.some((layer) => layer.id.startsWith('example-')),
  ).toBe(true);
});

test('[TPL-013] a template of another size is scaled to fit and centred on a square canvas', async ({
  page,
}) => {
  // Square canvas from the canvas bar's Ratio chip.
  await page.locator('#composition-canvas').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('#context-toolbar')).toHaveAttribute(
    'data-mode',
    'canvas',
  );
  await (await toolbarButton(page, 'canvas-size')).click();
  await page.locator('.canvas-size-preset[data-preset="square"]').click();
  expect((await scene(page)).width).toBe((await scene(page)).height);
  await showCategory(page, 'Templates');
  await card(page, 'template-1').click();
  await page.locator('.modal-dialog [data-action="template-confirm"]').click();
  const added = await scene(page);
  expect(added.width).toBe(added.height);
  await expect(page.locator('.toast', { hasText: 'scaled' })).toBeVisible();
});

test('[CV-057] the canvas bar shows outside the artboard and after Escape; object toolbars carry no size chip', async ({
  page,
}) => {
  const bar = page.locator('#context-toolbar');
  // An object: no size chip.
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await expect(bar).toHaveAttribute('data-mode', 'text');
  await expect(bar.locator('[data-control="canvas-size"]')).toHaveCount(0);
  // Escape with nothing selected: the canvas bar.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Escape');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('data-mode', 'canvas');
  await expect(bar.locator('[data-control="canvas-size"]')).toBeVisible();
  await expect(bar.locator('[data-control="canvas-background"]')).toBeVisible();
  await expect(bar.locator('[data-control="auto-captions"]')).toBeDisabled();
  // The artboard: the scene bar, with its own size chip; one bar only.
  const point = await toScreen(page, 30, 690);
  await page.mouse.click(point.x, point.y);
  await expect(bar).toHaveAttribute('data-mode', 'scene');
  await expect(bar.locator('[data-control="canvas-size"]')).toBeVisible();
  await expect(page.locator('.context-toolbar')).toHaveCount(1);
  // The dark stage outside the artboard: the canvas bar again.
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + box.height - 6);
  await expect(bar).toHaveAttribute('data-mode', 'canvas');
  // The background colour applies as one undo step.
  const steps = (await labels(page)).length;
  await bar.locator('[data-control="canvas-background"]').click();
  await page.locator('.color-swatch').first().click();
  await expect.poll(async () => (await labels(page)).length).toBe(steps + 1);
  // An object hides it.
  await selectLayer(page, 'example-paper');
  await expect(bar).toHaveAttribute('data-mode', 'shape');
});

test('[HIS-007] [HIS-008] importing media and renaming the project are not undone; placing media is', async ({
  page,
}) => {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(path.join(MEDIA, PNG));
  await expect(page.locator(`.media-card[data-name="${PNG}"]`)).toBeVisible();
  const steps = (await labels(page)).length;
  // Import adds no history step; Undo keeps the media.
  expect((await hook(page)).history.canUndo).toBe(false);
  await page.keyboard.press('Control+z');
  await expect(page.locator(`.media-card[data-name="${PNG}"]`)).toBeVisible();
  // Placing it on the canvas is one step; Undo removes the clip, not the media.
  await page
    .locator(`.media-card[data-name="${PNG}"]`)
    .dragTo(page.locator('#composition-canvas'));
  await expect.poll(async () => (await labels(page)).length).toBe(steps + 1);
  const placed = (await scene(page)).layers.length;
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  expect((await scene(page)).layers.length).toBe(placed - 1);
  await expect(page.locator(`.media-card[data-name="${PNG}"]`)).toBeVisible();
  expect(await listedAssets(page)).toBe(1);
  // Redo brings the clip back, still with its media.
  await page.keyboard.press('Control+Shift+z');
  expect((await scene(page)).layers.length).toBe(placed);
  // Renaming the project is not a step.
  const before = (await labels(page)).length;
  await page.locator('#project-name').click();
  await page.locator('#project-name-input').fill('Renamed project');
  await page.locator('#project-name-input').press('Enter');
  await expect
    .poll(async () => (await hook(page)).project.metadata.name)
    .toBe('Renamed project');
  expect((await labels(page)).length).toBe(before);
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  expect((await hook(page)).project.metadata.name).toBe('Renamed project');
});

test('[MED-037] the media item menu renames (not undoable), moves to a folder, shows details and adds to the scene', async ({
  page,
}) => {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(path.join(MEDIA, JPG));
  const item = page.locator('.media-item').first();
  await expect(item).toBeVisible();
  const menu = page.locator('#media-menu');
  const open = async () => {
    await item.hover();
    await item.locator('[data-action="media-more"]').click();
    await expect(menu).toBeVisible();
  };
  await open();
  await expect(menu.locator('button')).toHaveText([
    'Rename',
    'Add to scene',
    'Move to folder',
    'Details',
    'Delete',
  ]);
  // Rename.
  await menu.locator('[data-action="media-rename"]').click();
  await page.locator('[data-role="prompt-input"]').fill('Test card');
  await page.keyboard.press('Enter');
  await expect(item.locator('.media-name')).toHaveText('Test card');
  expect((await hook(page)).history.canUndo).toBe(false);
  // Move to a new folder (kept in the browser, not the project).
  await open();
  await menu.locator('[data-action="media-folder"]').click();
  await page.locator('[data-action="media-folder-new"]').click();
  await page.locator('[data-role="prompt-input"]').fill('Shots');
  await page.keyboard.press('Enter');
  await expect(
    page.locator('.toast', { hasText: 'Moved to Shots' }),
  ).toBeVisible();
  await expect(item).toHaveAttribute('data-folder-id', /^folder-/);
  // Details.
  await open();
  await menu.locator('[data-action="media-details"]').click();
  const details = page.locator('.modal-dialog .media-details');
  await expect(details).toContainText('1,200 × 800');
  await expect(details).toContainText('0 clips');
  await page.keyboard.press('Escape');
  // Right-click opens the same menu; Add to scene is one undo step.
  await item.locator('.media-card').click({ button: 'right' });
  await expect(menu).toBeVisible();
  await menu.locator('[data-action="media-add"]').click();
  expect((await labels(page)).at(-1)).toBe('Add asset layer');
  const layer = (await scene(page)).layers.at(-1)!;
  expect(layer.type).toBe('image');
});

test('[MED-036] deleting unused media can be restored for 8 s; media in use asks first and its clip shows Missing media', async ({
  page,
}) => {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles([path.join(MEDIA, JPG), path.join(MEDIA, PNG)]);
  const item = (name: string) =>
    page.locator(`.media-item:has(.media-card[data-name="${name}"])`);
  await expect(item(JPG)).toBeVisible();
  await expect(item(PNG)).toBeVisible();
  const menu = page.locator('#media-menu');
  const del = async (name: string) => {
    await item(name).hover();
    await item(name).locator('[data-action="media-more"]').click();
    await menu.locator('[data-action="media-delete"]').click();
  };
  // Unused: deleted at once, with Restore.
  await del(PNG);
  await expect(item(PNG)).toHaveCount(0);
  expect((await hook(page)).history.canUndo).toBe(false);
  const toast = page.locator('.toast', { hasText: `Deleted ${PNG}` });
  await toast.locator('.toast-action').click();
  await expect(item(PNG)).toBeVisible();
  // In use: a confirmation names the clips; the clip then draws Missing media.
  await item(JPG)
    .locator('.media-card')
    .dragTo(page.locator('#composition-canvas'));
  await expect.poll(async () => (await labels(page)).length).toBe(1);
  await del(JPG);
  const confirm = page.locator('.modal-dialog');
  await expect(confirm).toContainText('1 clip');
  await confirm.locator('[data-role="cancel"]').click();
  await expect(item(JPG)).toBeVisible();
  await del(JPG);
  await confirm.locator('[data-role="confirm"]').click();
  await expect(item(JPG)).toHaveCount(0);
  const asset = (await hook(page)).project.assets.find(
    (entry) => entry.name === JPG,
  )!;
  expect(asset.metadata.removed).toBe(true);
  // Undo history is untouched: the placed clip is still the last step.
  expect((await labels(page)).at(-1)).toBe('Add asset layer');
  // After the restore window the stored bytes are gone for real.
  const key = `media/${asset.metadata.fingerprint as string}`;
  await expect
    .poll(
      () =>
        page.evaluate(async (key) => {
          const root = await navigator.storage.getDirectory();
          try {
            const [folder, name] = key.split('/') as [string, string];
            const media = await root.getDirectoryHandle('aive-media');
            await (await media.getDirectoryHandle(folder)).getFileHandle(name);
            return true;
          } catch {
            return false;
          }
        }, key),
      { timeout: 15_000 },
    )
    .toBe(false);
  // Importing the file again brings it back.
  const again = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await again).setFiles(path.join(MEDIA, JPG));
  await expect(item(JPG)).toBeVisible();
  await expect(page.locator('.toast', { hasText: 'Restored 1' })).toBeVisible();
});

test('[MED-036] a clip whose media was deleted draws a Missing media placeholder', async ({
  page,
}) => {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(path.join(MEDIA, PNG));
  const card = page.locator(`.media-card[data-name="${PNG}"]`);
  await card.dragTo(page.locator('#composition-canvas'));
  await expect.poll(async () => (await labels(page)).length).toBe(1);
  // Pixels at the image's centre before and after the delete.
  const centre = async () =>
    page
      .locator('#composition-canvas')
      .evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext('2d')!;
        const x = Math.round(canvas.width / 2),
          y = Math.round(canvas.height / 2);
        return [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
      });
  await expect.poll(centre).not.toEqual([0, 0, 0]);
  const drawn = await centre();
  const item = page.locator('.media-item').first();
  await item.hover();
  await item.locator('[data-action="media-more"]').click();
  await page.locator('#media-menu [data-action="media-delete"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect
    .poll(async () => {
      const now = await centre();
      return now.some((value, index) => Math.abs(value - drawn[index]!) > 20);
    })
    .toBe(true);
  // The placeholder is grey (equal channels), not the gradient.
  const grey = await centre();
  expect(Math.max(...grey) - Math.min(...grey)).toBeLessThan(12);
});
