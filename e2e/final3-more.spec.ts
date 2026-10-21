import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  allowError,
  test,
  expect,
  hook,
  openSubmenus,
  showCategory,
  seekKeep,
} from './fixtures';
import { exported, meanDiff, preview } from './fx-helpers';

// FINAL3 at 1920 × 940, the rest of Parts B and C: the text toolbar's
// format tools (case, text position, typography, gradient, format
// painter), every text effect, the font picker's filters and failures, and
// the camera's overlays, background image, Track To and focus picker.
type Layer = {
  id: string;
  name: string;
  type: string;
  properties: Record<string, { value: unknown } | undefined>;
};
const scene = async (page: Page) => {
  const { project, session } = await hook(page);
  return project.compositions.find((c) => c.id === session.compositionId)!;
};
const layerById = async (page: Page, id: string) =>
  ((await scene(page)).layers as unknown as Layer[]).find((l) => l.id === id)!;
const selectedId = async (page: Page) =>
  (await hook(page)).session.selectedIds[0]!;
const lastLabel = async (page: Page) =>
  (await hook(page)).history.labels.at(-1);
const prop = async (page: Page, id: string, key: string) =>
  (await layerById(page, id)).properties[key]?.value;

async function addHeading(page: Page) {
  await showCategory(page, 'Text');
  const before = (await scene(page)).layers.length;
  await page
    .locator(
      '#library-text .text-default-button[data-item-id="text-add-heading"]',
    )
    .click();
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(before + 1);
  return selectedId(page);
}
const selectClip = (page: Page, id: string) =>
  page.locator(`#timeline-foundation .nle-clip[data-id="${id}"]`).click();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
});

test('[FN3-026] text format tools: aA cycles UPPER, lower and Title; superscript; kerning, ligatures and Change all; a gradient of up to 10 colours; the format painter copies a whole text format', async ({
  page,
}) => {
  const first = await addHeading(page);
  const bar = page.locator('#context-toolbar');
  // aA: UPPER, lower, Title, then back to none; one step each.
  for (const expected of ['upper', 'lower', 'title', 'none']) {
    await bar.locator('[data-control="uppercase"]').click();
    await expect.poll(() => prop(page, first, 'textCase')).toBe(expected);
    expect(await lastLabel(page)).toBe('Set text case');
  }
  await bar.locator('[data-control="uppercase"]').click();
  // Text position and typography live under Advanced (spacing).
  await bar.locator('[data-control="spacing"]').click();
  await page.locator('#toolbar-text-position [data-script="super"]').click();
  expect(await lastLabel(page)).toBe('Set text position');
  expect(String(await prop(page, first, 'textRuns'))).toContain('"super"');
  await page.locator('#toolbar-text-position [data-script="none"]').click();
  expect(String((await prop(page, first, 'textRuns')) ?? '')).not.toContain(
    'super',
  );
  await page.locator('.toolbar-popover [data-action="fontKerning"]').click();
  expect(await lastLabel(page)).toBe('Set kerning');
  expect(await prop(page, first, 'fontKerning')).toBe(false);
  await page.locator('.toolbar-popover [data-action="fontLigatures"]').click();
  expect(await prop(page, first, 'fontLigatures')).toBe(false);
  // A second text, then Change all gives it the same typography.
  await page.keyboard.press('Escape');
  const second = await addHeading(page);
  expect(second).not.toBe(first);
  await selectClip(page, first);
  await bar.locator('[data-control="spacing"]').click();
  await page.locator('.toolbar-popover [data-action="typography-all"]').click();
  expect(await lastLabel(page)).toBe('Change all text typography');
  expect(await prop(page, second, 'fontKerning')).toBe(false);
  expect(await prop(page, second, 'fontLigatures')).toBe(false);
  await page.keyboard.press('Escape');
  // A linear gradient, grown to 10 colours (the limit).
  await selectClip(page, first);
  await page.locator('#toolbar-color').click();
  const gradient = page.locator('#text-gradient');
  await gradient.locator('[data-fill-type="linear"]').click();
  expect(await lastLabel(page)).toBe('Set text gradient');
  const add = page.locator('#text-gradient-add');
  for (let n = 3; n <= 10; n++) {
    await add.click();
    await expect(gradient.locator('[data-stop]')).toHaveCount(n);
  }
  await expect(add).toBeDisabled();
  const stops = JSON.parse(String(await prop(page, first, 'textGradient')))
    .stops as unknown[];
  expect(stops).toHaveLength(10);
  await page.screenshot({ path: 'reports/final3/b-text-gradient.png' });
  // Format painter: case, effect and gradient go from the first text to
  // the second in one step.
  await page.keyboard.press('Escape');
  await selectClip(page, first);
  await bar.locator('[data-control="uppercase"]').click();
  await bar.locator('[data-control="effects"]').click();
  await page
    .locator('[data-tool-panel="effects"] [data-effect="glow"]')
    .click();
  await expect
    .poll(async () => String(await prop(page, first, 'textEffect')))
    .toContain('glow');
  await bar.locator('[data-control="copy-style"]').click();
  await selectClip(page, second);
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  const corners = await page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: { getCanvas(): { corners: [number, number][] } };
        }
      ).__AIVE__.getCanvas().corners,
  );
  await page.mouse.click(
    canvas.x + (corners[0]![0] + corners[2]![0]) / 2,
    canvas.y + (corners[0]![1] + corners[2]![1]) / 2,
    { button: 'right' },
  );
  const menu = page.locator('#canvas-context-menu');
  await openSubmenus(menu, 'style-menu');
  await menu.locator('[data-action="paste-style"]').click();
  expect(await lastLabel(page)).toBe('Paste style');
  expect(await prop(page, second, 'textCase')).toBe(
    await prop(page, first, 'textCase'),
  );
  expect(String(await prop(page, second, 'textEffect'))).toContain('glow');
  expect(await prop(page, second, 'textGradient')).toBe(
    await prop(page, first, 'textGradient'),
  );
});

test('[FN3-027] every text effect has its settings and Remove effect, and draws differently from plain text', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const id = await addHeading(page);
  const plain = await preview(page, true);
  await page.locator('#context-toolbar [data-control="effects"]').click();
  const panel = page.locator('[data-tool-panel="effects"]');
  const effects = [
    'shadow',
    'lift',
    'hollow',
    'splice',
    'echo',
    'outline',
    'glow',
    'background',
    'glitch',
    'neon',
  ];
  for (const effect of effects) {
    await panel.locator(`[data-effect="${effect}"]`).click();
    await expect
      .poll(async () => JSON.parse(String(await prop(page, id, 'textEffect'))))
      .toMatchObject({ type: effect });
    // Settings (sliders with number fields) and Remove effect.
    await expect(
      panel.locator('.text-effect-fields .number-field').first(),
    ).toBeVisible();
    await expect(
      panel.locator('[data-action="text-effect-remove"]'),
    ).toBeVisible();
    expect(meanDiff(await preview(page), plain), effect).toBeGreaterThan(0.02);
  }
  // A setting is one step; Remove effect clears it.
  await panel.locator('[data-effect="shadow"]').click();
  const field = panel.locator('#text-effect-intensity');
  await field.fill('90');
  await field.press('Enter');
  await expect
    .poll(async () => JSON.parse(String(await prop(page, id, 'textEffect'))))
    .toMatchObject({ type: 'shadow', intensity: 90 });
  await panel.locator('[data-action="text-effect-remove"]').click();
  expect(await lastLabel(page)).toBe('Remove effect');
  expect(await prop(page, id, 'textEffect')).toBe('');
});

test('[FN3-028] the font picker filters by kind (Serif, Mono, Handwriting), lists document fonts, and a failed font gives its reason and Retry', async ({
  page,
}) => {
  await addHeading(page);
  await page.locator('#toolbar-font').click();
  const panel = page.locator('[data-tool-panel="font"]');
  await expect(panel.locator('#font-search')).toBeVisible();
  // The project's own fonts are listed.
  await expect(
    panel.locator('[data-font-section="document"] .font-option').first(),
  ).toBeVisible();
  for (const chip of ['serif', 'monospace', 'handwriting']) {
    await panel.locator(`[data-font-chip="${chip}"]`).click();
    const rows = panel.locator('[data-font-section="results"] .font-option');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
    await panel.locator('[data-font-chip="all"]').click();
  }
  // A catalogue font that cannot be fetched: a plain reason and Retry; the
  // text keeps its font.
  allowError(
    page,
    (message) => message.includes('503') && message.includes('Bebas+Neue'),
    'The font service is made to fail on purpose (T4.5).',
  );
  await page.route('https://fonts.googleapis.com/css2**', (route) =>
    route.fulfill({ status: 503, body: 'down' }),
  );
  const before = await prop(page, await selectedId(page), 'fontFamily');
  await panel.locator('#font-search').fill('Bebas');
  const row = panel.locator('[data-font="Bebas Neue"]');
  await row.click();
  await expect(row.locator('.font-state[data-state="error"]')).toBeVisible();
  await expect(row.locator('[data-action="font-retry"]')).toBeVisible();
  expect(await prop(page, await selectedId(page), 'fontFamily')).toBe(before);
});

/** Nothing selected → the scene toolbar's Camera → Add camera. */
async function addCamera(page: Page) {
  await page.keyboard.press('Escape');
  const bar = page.locator('#context-toolbar');
  await expect(bar).toHaveAttribute('data-kind', 'scene');
  await bar.locator('[data-control="scene-camera"]').click();
  await page.locator('#right-section [data-action="camera-add"]').click();
  return selectedId(page);
}
const right = (page: Page) => page.locator('#right-section');
const cameraSpec = async (page: Page, shot: string) =>
  JSON.parse(String(await prop(page, shot, 'cameraSpec'))) as {
    trackTo: { layerId: string | null };
    dof: { enabled: boolean; focusLayer: string | null };
    background: { assetId: string; render: boolean } | null;
  };
async function openGroup(page: Page, id: string) {
  const head = right(page).locator(`[data-accordion-toggle="camera-${id}"]`);
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
}
async function pick(page: Page, id: string, text: string) {
  await right(page).locator(`#${id}`).click();
  await page.locator('[role="option"]', { hasText: text }).first().click();
}

test('[FN3-029] camera overlays (guides, safe areas, passepartout) show only in the editor; a background image draws through the camera and exports only with Include in render; Track To and the focus picker', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles(path.resolve('tests/fixtures/media/image_alpha_logo_512.png'));
  await expect
    .poll(async () => (await hook(page)).project.assets.length)
    .toBeGreaterThan(0);
  await seekKeep(page, 1);
  const shot = await addCamera(page);
  await right(page).locator('[data-action="camera-preview"]').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const plain = await preview(page, true);
  const file0 = await exported(page, testInfo);
  // Overlays: thirds, safe areas, passepartout.
  await selectClip(page, shot);
  await openGroup(page, 'overlays');
  await right(page).locator('[data-action="camera-guide-thirds"]').click();
  expect(await lastLabel(page)).toBe('Composition guides');
  await right(page).locator('[data-action="camera-safe-areas"]').click();
  expect(await lastLabel(page)).toBe('Safe areas');
  for (const action of ['camera-passepartout', 'camera-show-name'])
    await expect(
      right(page).locator(`[data-action="${action}"]`),
    ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const guided = await preview(page);
  expect(meanDiff(guided, plain)).toBeGreaterThan(0.05);
  expect(meanDiff(await exported(page, testInfo), file0)).toBeLessThan(0.5);
  await page.screenshot({ path: 'reports/final3/c-camera-overlays.png' });
  // A background image in front at half alpha: drawn in the editor, not
  // exported until Include in render.
  await selectClip(page, shot);
  await openGroup(page, 'background');
  const logo = (await hook(page)).project.assets.at(-1)!;
  await pick(page, 'camera-bg-asset', logo.name);
  expect(await lastLabel(page)).toBe('Camera background');
  await pick(page, 'camera-bg-depth', 'Front');
  expect((await cameraSpec(page, shot)).background?.assetId).toBe(logo.id);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => meanDiff(await preview(page), guided))
    .toBeGreaterThan(0.3);
  expect(meanDiff(await exported(page, testInfo), file0)).toBeLessThan(0.5);
  await selectClip(page, shot);
  await openGroup(page, 'background');
  await right(page).locator('[data-action="camera-bg-render"]').click();
  expect((await cameraSpec(page, shot)).background?.render).toBe(true);
  expect(meanDiff(await exported(page, testInfo), file0)).toBeGreaterThan(0.3);
  // Track To a layer, then pick the focus object on the canvas.
  const headline = await layerById(page, 'example-headline');
  await openGroup(page, 'track-to');
  await pick(page, 'camera-track-target', headline.name);
  expect(await lastLabel(page)).toBe('Track To');
  expect((await cameraSpec(page, shot)).trackTo.layerId).toBe(headline.id);
  await openGroup(page, 'dof');
  await right(page).locator('[data-action="camera-pick-focus"]').click();
  await selectClip(page, headline.id);
  await expect.poll(() => lastLabel(page)).toBe('Focus object');
  const dof = (await cameraSpec(page, shot)).dof;
  expect(dof).toMatchObject({ enabled: true, focusLayer: headline.id });
  expect(await selectedId(page)).toBe(shot);
});
