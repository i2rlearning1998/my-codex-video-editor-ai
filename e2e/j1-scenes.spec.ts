import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';
import { pickColor, toolbarButton } from './controls';

// J1: every scene owns its background and canvas size; undo is scoped to the
// scene it edited and opens that scene.
type Matrix = [number, number, number, number, number, number];
const cards = (page: Page) => page.locator('#scene-strip .scene-strip-card');
const project = async (page: Page) => (await hook(page)).project;
const labels = async (page: Page) => (await hook(page)).history.labels;
const openScene = async (page: Page) =>
  (await hook(page)).session.compositionId;

/** The canvas pixel (RGB) at a composition point of the open scene. */
async function pixelAt(page: Page, x: number, y: number) {
  return page.locator('#composition-canvas').evaluate(
    (canvas: HTMLCanvasElement, [x, y]) => {
      const [a, b, c, d, e, f] = (
        window as unknown as {
          __AIVE__: { getCanvas(): { view: Matrix } };
        }
      ).__AIVE__.getCanvas().view;
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / rect.width;
      const px = (a * x + c * y + e) * ratio,
        py = (b * x + d * y + f) * ratio;
      const data = canvas
        .getContext('2d')!
        .getImageData(Math.round(px), Math.round(py), 1, 1).data;
      return `#${[data[0], data[1], data[2]].map((v) => v!.toString(16).padStart(2, '0')).join('')}`;
    },
    [x, y] as const,
  );
}
async function addBlankScene(page: Page) {
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
}
/** Clicks the empty artboard so the toolbar is the scene bar. */
async function sceneBar(page: Page) {
  await page.keyboard.press('Escape');
  const bar = page.locator('#context-toolbar');
  if ((await bar.getAttribute('data-kind')) !== 'scene') {
    // A blank scene: the artboard's middle is empty.
    const box = (await page.locator('#composition-canvas').boundingBox())!;
    const [a, , , d, e, f] = await page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: { getCanvas(): { view: Matrix } };
          }
        ).__AIVE__.getCanvas().view,
    );
    await page.mouse.click(box.x + a * 8 + e, box.y + d * 8 + f);
  }
  await expect(bar).toHaveAttribute('data-kind', 'scene');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[PRJ-024] [PRJ-026] each scene owns its background: changing one scene leaves the others; a new scene starts from the project default', async ({
  page,
}) => {
  const first = (await project(page)).compositions[0]!;
  const original = first.backgroundColor;
  expect(original).toBe('#f0eee7');
  await sceneBar(page);
  await pickColor(page, 'toolbar-background', '#aa2222');
  expect((await labels(page)).at(-1)).toBe('Set background');
  expect((await project(page)).compositions[0]!.backgroundColor).toBe(
    '#aa2222',
  );
  await expect.poll(() => pixelAt(page, 6, 6)).toBe('#aa2222');
  // A new scene starts from the project's default, not from scene 1.
  await addBlankScene(page);
  let scenes = (await project(page)).compositions;
  expect(scenes[1]!.backgroundColor).toBe(
    (await project(page)).settings.backgroundColor,
  );
  expect(scenes[1]!.backgroundColor).toBe(original);
  await expect.poll(() => pixelAt(page, 640, 360)).toBe(original);
  // Changing scene 2 leaves scene 1 as it was.
  await sceneBar(page);
  await pickColor(page, 'toolbar-background', '#2244aa');
  scenes = (await project(page)).compositions;
  expect(scenes.map((scene) => scene.backgroundColor)).toEqual([
    '#aa2222',
    '#2244aa',
  ]);
  await expect.poll(() => pixelAt(page, 640, 360)).toBe('#2244aa');
  await cards(page).first().click();
  await expect.poll(() => pixelAt(page, 6, 6)).toBe('#aa2222');
  // The strip thumbnails follow each scene's own background.
  const sample = (index: number) =>
    cards(page)
      .nth(index)
      .locator('img')
      .evaluate(async (image: HTMLImageElement) => {
        if (!image.complete || !image.naturalWidth) return '';
        const canvas = new OffscreenCanvas(
          image.naturalWidth,
          image.naturalHeight,
        );
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const d = context.getImageData(
          Math.round(image.naturalWidth * 0.13),
          Math.round(image.naturalHeight * 0.06),
          1,
          1,
        ).data;
        return [d[0], d[1], d[2]].join(',');
      });
  await expect.poll(() => sample(1)).toBe('34,68,170');
  await expect.poll(() => sample(0)).toBe('170,34,34');
});

test('[PRJ-025] a canvas size belongs to its scene and never moves layers: changing it and back leaves every layer as it was', async ({
  page,
}) => {
  await addBlankScene(page);
  await cards(page).first().click();
  const before = await project(page);
  const layersBefore = JSON.stringify(before.compositions[0]!.layers);
  await sceneBar(page);
  await (await toolbarButton(page, 'canvas-size')).click();
  await page
    .locator('.toolbar-popover .canvas-size-preset[data-preset="square"]')
    .click();
  let scenes = (await project(page)).compositions;
  expect(scenes.map((scene) => [scene.width, scene.height])).toEqual([
    [1080, 1080],
    [1280, 720],
  ]);
  // No layer was rewritten.
  expect(JSON.stringify(scenes[0]!.layers)).toBe(layersBefore);
  expect((await labels(page)).at(-1)).toBe('Canvas size');
  // Back to the original size: still identical.
  await (await toolbarButton(page, 'canvas-size')).click();
  await page.locator('#canvas-size-w').fill('1280');
  await page.locator('#canvas-size-w').press('Enter');
  await page.locator('#canvas-size-h').fill('720');
  await page.locator('#canvas-size-h').press('Enter');
  await page.locator('#canvas-size-apply').click();
  scenes = (await project(page)).compositions;
  expect(scenes.map((scene) => [scene.width, scene.height])).toEqual([
    [1280, 720],
    [1280, 720],
  ]);
  expect(JSON.stringify(scenes[0]!.layers)).toBe(layersBefore);
  // Scene 2's own size is independent.
  await cards(page).nth(1).click();
  await sceneBar(page);
  await (await toolbarButton(page, 'canvas-size')).click();
  await page
    .locator('.toolbar-popover .canvas-size-preset[data-preset="vertical"]')
    .click();
  scenes = (await project(page)).compositions;
  expect(scenes.map((scene) => [scene.width, scene.height])).toEqual([
    [1280, 720],
    [1080, 1920],
  ]);
  expect(JSON.stringify(scenes[0]!.layers)).toBe(layersBefore);
});

test('[HIS-009] undo and redo revert only their own edit and open the scene it changed', async ({
  page,
}) => {
  await addBlankScene(page);
  const [sceneA, sceneB] = (await project(page)).compositions.map(
    (scene) => scene.id,
  );
  await cards(page).first().click();
  await sceneBar(page);
  await pickColor(page, 'toolbar-background', '#aa2222');
  await cards(page).nth(1).click();
  await sceneBar(page);
  await pickColor(page, 'toolbar-background', '#2244aa');
  const colours = async () =>
    (await project(page)).compositions.map((scene) => scene.backgroundColor);
  expect(await colours()).toEqual(['#aa2222', '#2244aa']);
  // Undo from the keyboard, focus on the canvas.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+z');
  expect(await colours()).toEqual(['#aa2222', '#f0eee7']);
  expect(await openScene(page)).toBe(sceneB);
  await page.keyboard.press('Control+z');
  expect(await colours()).toEqual(['#f0eee7', '#f0eee7']);
  // The undone edit was in scene A, so scene A opens.
  expect(await openScene(page)).toBe(sceneA);
  await expect(cards(page).first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+Shift+z');
  expect(await colours()).toEqual(['#aa2222', '#f0eee7']);
  expect(await openScene(page)).toBe(sceneA);
  await page.keyboard.press('Control+Shift+z');
  expect(await colours()).toEqual(['#aa2222', '#2244aa']);
  expect(await openScene(page)).toBe(sceneB);
});
