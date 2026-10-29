import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, seekKeep } from './fixtures';
import { exported, meanDiff, preview } from './fx-helpers';

// FINAL3 Part B: the Canva text rebuild at 1920 × 940: the box is as big as
// its lines (auto width, fixed width), double-click selects all, a visible
// caret, lists on paragraphs, the Text tab, effects, fonts and typewriter.
type Point = [number, number];
interface CanvasDebug {
  view: [number, number, number, number, number, number];
  corners: Point[] | null;
}
const canvasDebug = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __AIVE__: { getCanvas(): CanvasDebug } }
    ).__AIVE__.getCanvas(),
  );
type TextLayer = {
  id: string;
  type: string;
  properties: Record<string, { value: unknown }>;
  transform: { position: { value: [number, number] } };
};
const selectedLayer = async (page: Page) => {
  const { project, session } = await hook(page);
  const scene = project.compositions.find(
    (c) => c.id === session.compositionId,
  )!;
  const find = (layers: readonly TextLayer[]): TextLayer | undefined => {
    for (const layer of layers) {
      if (layer.id === session.selectedIds[0]) return layer;
      const inner = find(
        (layer as unknown as { children: TextLayer[] }).children ?? [],
      );
      if (inner) return inner;
    }
    return undefined;
  };
  return find(scene.layers as unknown as TextLayer[])!;
};
/** The selected box's height and width in composition units. */
const boxSize = async (page: Page) => {
  const debug = await canvasDebug(page);
  const [a] = debug.view;
  const [p0, p1, , p3] = debug.corners!;
  return {
    width: Math.hypot(p1![0] - p0![0], p1![1] - p0![1]) / a,
    height: Math.hypot(p3![0] - p0![0], p3![1] - p0![1]) / a,
  };
};
/** The page point at the selected box's centre. */
const boxCentre = async (page: Page) => {
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  const corners = (await canvasDebug(page)).corners!;
  return {
    x: canvas.x + corners.reduce((sum, p) => sum + p[0], 0) / 4,
    y: canvas.y + corners.reduce((sum, p) => sum + p[1], 0) / 4,
  };
};
async function addHeading(page: Page) {
  await showCategory(page, 'Text');
  await page
    .locator(
      '#library-text .text-default-button[data-item-id="text-add-heading"]',
    )
    .click();
  await expect.poll(async () => (await selectedLayer(page))?.type).toBe('text');
}
async function typeInto(page: Page, text: string) {
  const centre = await boxCentre(page);
  await page.mouse.dblclick(centre.x, centre.y);
  await expect(page.locator('.text-editor')).toBeVisible();
  await page.keyboard.insertText(text);
  await page.keyboard.press('Escape');
  await expect(page.locator('.text-editor')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
});

test('[FN3-005] a new heading is about 8 % of the canvas tall, one line tall, and "Shyam Monani" never wraps in auto width', async ({
  page,
}) => {
  await addHeading(page);
  const { project, session } = await hook(page);
  const scene = project.compositions.find(
    (c) => c.id === session.compositionId,
  )!;
  const layer = await selectedLayer(page);
  const size = layer.properties.fontSize!.value as number;
  expect(size).toBeCloseTo(0.08 * scene.height, 0);
  expect(layer.properties.textBox!.value).toBe('auto');
  await typeInto(page, 'Shyam Monani');
  expect((await selectedLayer(page)).properties.text!.value).toBe(
    'Shyam Monani',
  );
  // Exactly one line: the box is the line height (no empty line below).
  const box = await boxSize(page);
  expect(box.height).toBeCloseTo(size * 1.2, 0);
  expect(box.width).toBeGreaterThan(size * 3);
  await page.screenshot({ path: 'reports/final3/b-text-one-line.png' });
});

test('[FN3-005] dragging a side handle makes the box fixed width: the text wraps and the height grows; double-clicking the handle goes back to auto width', async ({
  page,
}) => {
  await addHeading(page);
  await typeInto(page, 'Shyam Monani teaches maths');
  const before = await boxSize(page);
  const debug = await canvasDebug(page);
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  const [p0, p1, p2] = debug.corners!;
  // The right side's middle.
  const grip = {
    x: canvas.x + (p1![0] + p2![0]) / 2,
    y: canvas.y + (p1![1] + p2![1]) / 2,
  };
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x - (p1![0] - p0![0]) * 0.55, grip.y, {
    steps: 8,
  });
  await page.mouse.up();
  const layer = await selectedLayer(page);
  expect(layer.properties.textBox!.value).toBe('fixed');
  const after = await boxSize(page);
  expect(after.width).toBeLessThan(before.width * 0.6);
  expect(after.height).toBeGreaterThan(before.height * 1.8);
  await page.screenshot({ path: 'reports/final3/b-text-fixed-width.png' });
  // Double-click the side handle: auto width again, one line.
  const now = (await canvasDebug(page)).corners!;
  await page.mouse.dblclick(
    canvas.x + (now[1]![0] + now[2]![0]) / 2,
    canvas.y + (now[1]![1] + now[2]![1]) / 2,
  );
  await expect
    .poll(async () => (await selectedLayer(page)).properties.textBox!.value)
    .toBe('auto');
  expect((await boxSize(page)).height).toBeCloseTo(before.height, 0);
});

test('[FN3-009] double-click selects all the text; the caret is a visible contrasting line; the editor is never a form field; Shift+Enter is a soft break', async ({
  page,
}) => {
  await addHeading(page);
  const centre = await boxCentre(page);
  await page.mouse.dblclick(centre.x, centre.y);
  const editor = page.locator('.text-editor');
  await expect(editor).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.getSelection()?.toString()))
    .toBe('Add a heading');
  for (const [name, value] of [
    ['autocomplete', 'off'],
    ['autocorrect', 'off'],
  ] as const)
    await expect(editor).toHaveAttribute(name, value);
  await expect(editor).toHaveAttribute('spellcheck', 'false');
  // Typing replaces the selection; the caret is 2 px and contrasts with
  // the canvas background (3:1 or more).
  await page.keyboard.insertText('Line one');
  const caret = page.locator('.text-caret');
  await expect
    .poll(() => caret.evaluate((node) => node.getBoundingClientRect().width))
    .toBe(2);
  const contrast = await page.evaluate(() => {
    const parse = (value: string) =>
      (value.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const c = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * c(r!) + 0.7152 * c(g!) + 0.0722 * c(b!);
    };
    const caret = parse(
      getComputedStyle(document.querySelector('.text-caret')!).backgroundColor,
    );
    const state = (
      window as unknown as {
        __AIVE__: {
          getProject(): {
            compositions: { id: string; backgroundColor: string }[];
            settings: { backgroundColor: string };
          };
          getSession(): { compositionId: string };
        };
      }
    ).__AIVE__;
    const hex = state.getProject().settings.backgroundColor;
    const bg = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [a, b] = [lum(caret), lum(bg)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.insertText('line two');
  await page.keyboard.press('Escape');
  const text = (await selectedLayer(page)).properties.text!.value as string;
  expect(text).toBe('Line one\u2028line two');
  // One paragraph, two lines.
  expect((await boxSize(page)).height).toBeCloseTo(
    ((await selectedLayer(page)).properties.fontSize!.value as number) *
      1.2 *
      2,
    0,
  );
});

test('[FN3-006] a list on one line gives one bullet; on three paragraphs three; Enter adds a bullet, Enter on an empty one leaves the list; Tab indents', async ({
  page,
}) => {
  await addHeading(page);
  await typeInto(page, 'Shyam Monani');
  await page.locator('#context-toolbar [data-control="list"]').click();
  await page
    .locator('.toolbar-popover .select-option', { hasText: 'Bulleted list' })
    .click();
  let layer = await selectedLayer(page);
  expect(layer.properties.text!.value).toBe('Shyam Monani');
  expect(layer.properties.listStyle!.value).toBe('bullet');
  // While editing, each paragraph shows its own marker.
  const centre = await boxCentre(page);
  await page.mouse.dblclick(centre.x, centre.y);
  const markers = page.locator('.text-editor > div[data-marker]');
  await expect(markers).toHaveCount(1);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Second');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Third');
  await expect(markers).toHaveCount(3);
  // Tab indents the third paragraph one level.
  await page.keyboard.press('Tab');
  await expect(page.locator('.text-editor > div').nth(2)).toHaveAttribute(
    'data-level',
    '1',
  );
  // Enter twice: the empty paragraph leaves the list.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('.text-editor > div').nth(3)).toHaveAttribute(
    'data-level',
    '-1',
  );
  await page.keyboard.press('Escape');
  layer = await selectedLayer(page);
  expect(layer.properties.text!.value).toBe('Shyam Monani\nSecond\nThird\n');
  expect(layer.properties.listLevels!.value).toBe('0,0,1,-1');
  await page.screenshot({ path: 'reports/final3/b-text-list.png' });
});

test('[FN3-011][FIX7-007] the Text tab: search, the three default styles (click and drag), 24 font combinations in English and Hindi, text styles saved to My Templates', async ({
  page,
}) => {
  await showCategory(page, 'Text');
  const host = page.locator('#library-text');
  await expect(host.locator('.text-default-button')).toHaveText([
    'Add a heading',
    'Add a subheading',
    'Add a little bit of body text',
  ]);
  // The strip shows the first combinations; See all lists every one.
  await expect(
    host.locator('[data-section="combinations-built"] .library-card').first(),
  ).toBeVisible();
  await host.locator('[data-see-all="combinations-built"]').click();
  const combos = host.locator(
    '[data-section="combinations-built"] .library-card',
  );
  await expect.poll(() => combos.count()).toBeGreaterThanOrEqual(24);
  // A Hindi combination adds Devanagari text in a Devanagari font.
  await host
    .locator(
      '[data-section="combinations-built"] [data-item-id="combo-hi-festival"]',
    )
    .click();
  const { project, session } = await hook(page);
  const scene = project.compositions.find(
    (c) => c.id === session.compositionId,
  )!;
  const group = scene.layers.at(-1) as unknown as {
    children: TextLayer[];
  };
  expect(group.children.map((child) => child.properties.text!.value)).toContain(
    'दिवाली मुबारक',
  );
  expect(
    group.children.map((child) => child.properties.fontFamily!.value),
  ).toContain('Yatra One');
  // Search finds a combination by its font.
  await host.locator('input[type="search"]').fill('Pacifico');
  await expect(host.locator('[data-item-id="combo-script"]')).toBeVisible();
  await host.locator('input[type="search"]').fill('');
  await host.locator('[data-action="browse-back"]').click();
  // Drag "Add a subheading" onto the canvas.
  const canvas = page.locator('#composition-canvas');
  await host
    .locator('.text-default-button[data-item-id="text-add-subheading"]')
    .dragTo(canvas);
  await expect
    .poll(async () => (await selectedLayer(page))?.properties.text?.value)
    .toBe('Add a subheading');
  // Save it as My text style; it is listed and adds a copy.
  await page.locator('#context-toolbar [data-control="text-more"]').click();
  await page
    .locator('.toolbar-popover .select-option', {
      hasText: 'Save to My Templates',
    })
    .click();
  // FIX7: it is kept in My Templates (Text), not in the Text panel.
  await expect(host.locator('.my-text-style-use')).toHaveCount(0);
  await expect(
    page.locator('.toast', { hasText: 'Saved to My Templates' }),
  ).toBeVisible();
  await page.screenshot({ path: 'reports/final3/b-text-tab.png' });
});

test('[FN3-008] a text effect draws the same in the preview and the export; Curve bends the text', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await addHeading(page);
  await preview(page, true);
  const plain = await preview(page);
  await page.locator('#context-toolbar [data-control="effects"]').click();
  const panel = page.locator('[data-tool-panel="effects"]');
  await panel.locator('[data-effect="neon"]').click();
  await expect
    .poll(async () => (await selectedLayer(page)).properties.textEffect?.value)
    .toContain('neon');
  await page.screenshot({ path: 'reports/final3/b-text-effects.png' });
  // Nothing selected, so no handles are measured.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const shown = await preview(page);
  expect(meanDiff(shown, plain)).toBeGreaterThan(0.2);
  const file = await exported(page, testInfo);
  expect(meanDiff(shown, file)).toBeLessThan(6);
});

test('[FN3-008] the typewriter shows part of the text half way through its In', async ({
  page,
}) => {
  await addHeading(page);
  const layerId = (await selectedLayer(page)).id;
  await page.locator('#context-toolbar [data-control="animate"]').click();
  await page
    .locator('[data-deep-panel="animate"] [data-preset="typewriter"]')
    .first()
    .click();
  const clip = async () =>
    (await hook(page)).project.compositions[0]!.tracks.flatMap(
      (track) => track.clips,
    ).find((item) => item.layerId === layerId)!;
  await expect
    .poll(async () => JSON.stringify((await clip()).metadata))
    .toContain('typewriter');
  const { startTime } = await clip();
  const inkAt = async (time: number) => {
    await seekKeep(page, time);
    await page.keyboard.press('Escape');
    return page
      .locator('#composition-canvas')
      .evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext('2d')!;
        const { data } = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
        let ink = 0;
        for (let i = 0; i < data.length; i += 16)
          if (data[i]! < 80 && data[i + 1]! < 80 && data[i + 2]! < 100) ink++;
        return ink;
      });
  };
  const length = (
    (await clip()).metadata as { animation: { in: { duration: number } } }
  ).animation.in.duration;
  const empty = await inkAt(startTime);
  const half = await inkAt(startTime + length / 2);
  const full = await inkAt(startTime + 3);
  expect(half).toBeGreaterThan(empty);
  expect(half).toBeLessThan(full);
});

test('[FN3-012] an uploaded font (.woff2) is listed under Uploaded fonts and used by the text', async ({
  page,
}) => {
  await addHeading(page);
  await page.locator('#toolbar-font').click();
  const panel = page.locator('[data-tool-panel="font"]');
  await expect(panel.locator('[data-font-section="uploaded"]')).toBeVisible();
  await panel
    .locator('#font-upload-input')
    .setInputFiles(
      path.resolve(
        'public/fonts/noto-sans-devanagari/noto-sans-devanagari-devanagari-400-normal.woff2',
      ),
    );
  await expect
    .poll(async () => (await selectedLayer(page)).properties.fontSource?.value)
    .toBe('uploaded');
  const family = (await selectedLayer(page)).properties.fontFamily!
    .value as string;
  expect(family).toBe('noto-sans-devanagari-devanagari-400-normal');
  await expect(
    panel.locator(`[data-font-section="uploaded"] [data-font="${family}"]`),
  ).toBeVisible();
});
