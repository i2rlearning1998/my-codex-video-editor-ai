import { readFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import {
  allowError,
  test,
  expect,
  hook,
  showCategory,
  showGraphics,
  toScreen,
} from './fixtures';
import { reveal } from './controls';

// H5: the library (Starter Pack 1) and gradient fills.
const panel = (page: Page, id: string) => page.locator(`#library-${id}`);
const card = (page: Page, id: string) =>
  // I2: an item can show in more than one section (Recently used, a row).
  page.locator(`.library-card[data-item-id="${id}"]`).first();
const labels = async (page: Page) => (await hook(page)).history.labels;
const layers = async (page: Page): Promise<any[]> => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!.layers as any[];
};
/** RGB of the drawn canvas at composition points. */
async function pixels(
  page: Page,
  points: [number, number][],
  at?: { x: number; y: number }[],
) {
  const screen =
    at ?? (await Promise.all(points.map(([x, y]) => toScreen(page, x, y))));
  return page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement, screen) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / rect.width;
      const context = canvas.getContext('2d')!;
      return screen.map(({ x, y }) => [
        ...context
          .getImageData(
            Math.round((x - rect.x) * ratio),
            Math.round((y - rect.y) * ratio),
            1,
            1,
          )
          .data.slice(0, 3),
      ]);
    }, screen);
}
async function exported(
  page: Page,
  testInfo: TestInfo,
  points: [number, number][],
) {
  await page.locator('#export').click();
  const saving = page.waitForEvent('download');
  await page.locator('.modal-dialog #export-png').click();
  const file = testInfo.outputPath(`frame-${Date.now()}.png`);
  await (await saving).saveAs(file);
  await page.locator('.modal-dialog .modal-close').click();
  return page.evaluate(
    async ({ png64, points }) => {
      const bytes = Uint8Array.from(atob(png64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes]));
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
const differ = (a: number[], b: number[]) =>
  a.some((value, index) => Math.abs(value - b[index]!) > 30);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TPL-010] the library lists Starter Pack 1 in Templates, Elements (shapes and graphics) and Text with drawn previews and search', async ({
  page,
}) => {
  // I2: each panel is a browse panel; "See all" (or a category tile) opens
  // the full list.
  const drawn = (locator: ReturnType<Page['locator']>) =>
    locator
      .first()
      .locator('img')
      .evaluate(async (image: HTMLImageElement) => {
        if (!image.complete || !image.naturalWidth) return false;
        const canvas = new OffscreenCanvas(
          image.naturalWidth,
          image.naturalHeight,
        );
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        const first = [data[0], data[1], data[2]].join();
        for (let i = 4; i < data.length; i += 4)
          if ([data[i], data[i + 1], data[i + 2]].join() !== first) return true;
        return false;
      })
      .catch(() => false);
  for (const [category, id, open, minimum] of [
    ['Templates', 'templates', '[data-see-all="all"]', 12],
    ['Elements', 'elements', '[data-tile="shapes"]', 75],
    ['Elements', 'elements', '[data-tile="graphics"]', 38],
    ['Text', 'text', '[data-see-all="styles"]', 28],
  ] as const) {
    await showCategory(page, category);
    const back = panel(page, id).locator('[data-action="browse-back"]');
    while (await back.isVisible()) await back.click();
    await panel(page, id).locator(open).click();
    const cards = panel(page, id).locator('.library-card');
    // Grids render in chunks as they scroll: scroll to the end to count.
    await expect
      .poll(async () => {
        await cards.last().scrollIntoViewIfNeeded();
        return cards.count();
      })
      .toBeGreaterThanOrEqual(minimum);
    // The first preview is drawn by the editor's renderer (not blank).
    await cards.first().scrollIntoViewIfNeeded();
    await expect.poll(() => drawn(cards)).toBe(true);
  }
  // Search filters by name and tag, and says when nothing matches.
  await showCategory(page, 'Elements');
  await panel(page, 'elements').locator('[data-action="browse-back"]').click();
  const search = page.locator('#browse-search-elements');
  await search.fill('star');
  const names = await panel(page, 'elements')
    .locator('.library-card')
    .evaluateAll((items) => items.map((item) => item.getAttribute('title')));
  expect(names.length).toBeGreaterThan(5);
  expect(names.every((name) => /star|burst|seal/i.test(name ?? ''))).toBe(true);
  await search.fill('zzzz');
  await expect(
    panel(page, 'elements').locator('.browse-no-results'),
  ).toHaveText('Nothing matches “zzzz”.');
});

test('[TPL-010] a library that cannot load says so in its panels', async ({
  page,
}) => {
  // The 404 is the point of this test.
  allowError(
    page,
    (message) => /404|index\.json/.test(message),
    'the library file is removed on purpose to show the error state',
  );
  await page.route('**/library/index.json', (route) =>
    route.fulfill({ status: 404, body: 'missing' }),
  );
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'Templates');
  await expect(
    panel(page, 'templates').locator('.browse-status-error'),
  ).toContainText('The library could not be loaded');
});

test('[SHP-002] a library shape is added centred at the playhead as one undo step', async ({
  page,
}) => {
  await showCategory(page, 'Elements');
  await card(page, 'shape-star-5').click();
  expect((await labels(page)).at(-1)).toBe('Add element');
  const shape = (await layers(page)).at(-1)!;
  expect(shape.properties.shapeKind.value).toBe('path');
  const selected = (await hook(page)).session.selectedIds;
  expect(selected).toEqual([shape.id]);
  // Centred on the 1280 × 720 canvas.
  const width = shape.properties.width.value as number;
  expect(shape.transform.position.value[0] + width / 2).toBeCloseTo(640, 0);
  // The star's centre is painted in its colour, not the paper.
  const [centre] = await pixels(page, [[640, 360]]);
  expect(differ(centre!, [0xf0, 0xee, 0xe7])).toBe(true);
  await page.keyboard.press('Control+z');
  expect((await layers(page)).some((item) => item.id === shape.id)).toBe(false);
});

test('[SHP-013] a background goes behind everything and covers the canvas, gradient included, in the preview and the export', async ({
  page,
}, testInfo) => {
  // Screen points first: the paper the helper looks for gets covered.
  const corners = await Promise.all([
    toScreen(page, 1220, 60),
    toScreen(page, 60, 660),
  ]);
  // I2: Graphics live inside Elements.
  await showGraphics(page);
  await card(page, 'bg-gradient-1').click();
  expect((await labels(page)).at(-1)).toBe('Add background');
  const background = (await layers(page))[0]!;
  expect(background.properties.width.value).toBe(1280);
  expect(background.properties.height.value).toBe(720);
  expect(background.properties.fillGradient.value).toContain('linear');
  // Sunrise (135°) runs from pink at the top right to yellow at the bottom left.
  const [topLeft, bottomRight] = await pixels(
    page,
    [
      [1220, 60],
      [60, 660],
    ],
    corners,
  );
  expect(differ(topLeft!, bottomRight!)).toBe(true);
  const [exportTopLeft, exportBottomRight] = await exported(page, testInfo, [
    [1220, 60],
    [60, 660],
  ]);
  expect(differ(exportTopLeft!, topLeft!)).toBe(false);
  expect(differ(exportBottomRight!, bottomRight!)).toBe(false);
});

test('[SHP-004] a shape fill can be a linear or radial gradient with 2 to 4 colours and an angle', async ({
  page,
}) => {
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="rectangle"]').click();
  const rectangle = (await layers(page)).at(-1)!;
  // The rectangle spans 520..760 × 280..440.
  const sample = (): Promise<number[][]> =>
    pixels(page, [
      [530, 300],
      [750, 300],
    ]);
  await reveal(page, 'toolbar-fill-opacity');
  await page.locator('[data-gradient-type="linear"]').click();
  expect((await labels(page)).at(-1)).toBe('Set gradient');
  let [left, right] = await sample();
  expect(differ(left!, right!)).toBe(true);
  // A vertical angle makes left and right the same again.
  const angle = page.locator('#gradient-angle');
  await angle.fill('90');
  await angle.press('Enter');
  [left, right] = await sample();
  expect(differ(left!, right!)).toBe(false);
  await page.locator('[data-action="gradient-add"]').click();
  let gradient = JSON.parse(
    (await layers(page)).at(-1)!.properties.fillGradient.value as string,
  );
  expect(gradient.stops).toHaveLength(3);
  await page.locator('[data-gradient-type="radial"]').click();
  gradient = JSON.parse(
    (await layers(page)).at(-1)!.properties.fillGradient.value as string,
  );
  expect(gradient.type).toBe('radial');
  await page.locator('[data-gradient-type="solid"]').click();
  expect(
    (await layers(page)).find((item) => item.id === rectangle.id)!.properties
      .fillGradient.value,
  ).toBe('');
  expect((await labels(page)).slice(-1)).toEqual(['Remove gradient']);
});

test('[TXT-001] Text styles add a heading, subheading, body or styled text at the playhead in one step', async ({
  page,
}) => {
  await showCategory(page, 'Text');
  await card(page, 'text-1').click();
  expect((await labels(page)).at(-1)).toBe('Add text');
  const heading = (await layers(page)).at(-1)!;
  expect(heading.type).toBe('text');
  expect(heading.properties.text.value).toBe('Add a heading');
  expect(heading.properties.fontWeight.value).toBe(700);
  expect(heading.properties.fontSize.value).toBe(72);
  // A two-part style comes in as one group.
  await card(page, 'text-11').click();
  const pair = (await layers(page)).at(-1)!;
  expect(pair.type).toBe('group');
  expect(pair.children.map((child: { type: string }) => child.type)).toEqual([
    'text',
    'text',
  ]);
  expect((await labels(page)).at(-1)).toBe('Add text');
});

test('[TPL-011] a template becomes a new scene after this one, sized to the canvas, with clips; one undo removes it', async ({
  page,
}) => {
  const before = (await hook(page)).project.compositions.length;
  await showCategory(page, 'Templates');
  await card(page, 'template-1').click();
  // I1.4 (TPL-013): the template asks where it goes; New scene is the default.
  await page.locator('.modal-dialog [data-action="template-confirm"]').click();
  expect((await labels(page)).at(-1)).toBe('Add template');
  const project = (await hook(page)).project;
  expect(project.compositions).toHaveLength(before + 1);
  const scene = project.compositions[1]!;
  expect(scene.name).toBe('YouTube intro');
  expect([scene.width, scene.height]).toEqual([1280, 720]);
  expect((await hook(page)).session.compositionId).toBe(scene.id);
  // Every top-level layer has a clip.
  const clipped = new Set(
    scene.tracks.flatMap((track) => track.clips.map((clip) => clip.layerId)),
  );
  expect(scene.layers.every((layer) => clipped.has(layer.id))).toBe(true);
  await page.keyboard.press('Control+z');
  expect((await hook(page)).project.compositions).toHaveLength(before);
});
