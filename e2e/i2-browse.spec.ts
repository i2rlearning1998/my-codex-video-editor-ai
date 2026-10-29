import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, toScreen } from './fixtures';

// I2: browse panels (Templates, Elements, Text, Transitions), the Media
// tabs and folders, Save as template and the Draw palette.

const MEDIA = path.resolve('tests/fixtures/media');
const panel = (page: Page, id: string) => page.locator(`#library-${id}`);
const labels = async (page: Page) => (await hook(page)).history.labels;
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const leftOpen = (page: Page) =>
  page
    .locator('.editor-shell')
    .evaluate((s) => !s.classList.contains('library-collapsed'));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[LAY-040] a browse panel has a header with Back and Close, a sticky search, sections with See all, chips, a sliding drill-down and keyboard access', async ({
  page,
}) => {
  await showCategory(page, 'Templates');
  const host = panel(page, 'templates');
  await expect(page.locator('#left-panel-title')).toHaveText('Templates');
  await expect(host.locator('[data-action="browse-back"]')).toBeHidden();
  // Sections, each with a title, See all and a horizontal strip.
  await expect(host.locator('.browse-section-head h3')).toContainText([
    'All Templates',
    'Video Templates',
    'Graphics Templates',
    'Social media Templates',
    'Education Templates',
  ]);
  // R5: My Templates is its own left-rail category.
  await expect(host.locator('[data-section="my"]')).toHaveCount(0);
  const strip = host.locator('[data-section="all"] .browse-strip');
  expect(
    await strip.evaluate((element) => getComputedStyle(element).overflowX),
  ).toBe('auto');
  // Drill down: the page slides in, Back returns.
  await host.locator('[data-see-all="video"]').click();
  await expect(host).toHaveAttribute('data-page', 'templates-video');
  await expect(host.locator('.browse-page')).toHaveClass(
    /browse-enter-forward/,
  );
  await expect(host.locator('.browse-title')).toHaveText('Video Templates');
  // Chips scroll horizontally and filter; each names its canvas size.
  const chips = host.locator('.browse-chip');
  await expect(chips.first()).toHaveText('All');
  await expect(host.locator('[data-chip="youtube-shorts"]')).toHaveAttribute(
    'title',
    '1080 × 1920',
  );
  await host.locator('[data-chip="youtube-videos"]').click();
  await expect(host.locator('[data-chip="youtube-videos"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    host.locator('[data-section="templates"] .library-card'),
  ).toHaveCount(2);
  // An empty subcategory says so, with a hint about packs.
  await host.locator('[data-chip="mobile-video"]').click();
  await expect(host.locator('.browse-empty-title')).toHaveText(
    'No templates yet',
  );
  await expect(host.locator('.browse-empty-hint')).toContainText('packs');
  // Keyboard: arrows move between cards.
  await host.locator('[data-chip=""]').click();
  const first = host
    .locator('[data-section="templates"] .library-card')
    .first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    host.locator('[data-section="templates"] .library-card').nth(1),
  ).toBeFocused();
  await host.locator('[data-action="browse-back"]').click();
  await expect(host).toHaveAttribute('data-page', 'templates');
  // The search stays at the top while the list scrolls.
  const search = host.locator('.browse-search');
  expect(await search.evaluate((e) => getComputedStyle(e).position)).toBe(
    'sticky',
  );
  await host.locator('#browse-search-templates').fill('quiz');
  await expect(host.locator('.library-card')).toHaveCount(1);
  await host.locator('#browse-search-templates').fill('');
  // The shared header's collapse button collapses the side panel (S1).
  await page.locator('.library .panel-head-collapse').click();
  await expect.poll(() => leftOpen(page)).toBe(false);
});

test('[TPL-014] Templates: category rows open pages with subcategory chips; Recently used shows what was added; Education is a flat list', async ({
  page,
}) => {
  await showCategory(page, 'Templates');
  const host = panel(page, 'templates');
  // The Starter Pack 1 templates sit in their categories.
  await expect(
    host.locator('[data-section="video"] .library-card'),
  ).toHaveCount(4);
  await expect(
    host.locator('[data-section="social"] .library-card'),
  ).toHaveCount(1);
  await expect(
    host.locator('[data-section="education"] .library-card'),
  ).toHaveCount(4);
  // All Templates: the document-type chips.
  await host.locator('[data-see-all="all"]').click();
  await expect(host.locator('.browse-chip')).toHaveText([
    'All',
    'YouTube',
    'Instagram',
    'Facebook',
    'Presentation',
    'Invitation',
    'Poster',
    'CV',
    'Logo',
    'Code',
    'Business card',
    'Flyer',
    'Brochure',
    'Menu',
    'Photo collage',
    'Sheet',
    'Doc',
    'Website',
    'Whiteboard',
  ]);
  await host.locator('[data-chip="youtube"]').click();
  await expect(
    host.locator('[data-section="templates"] .library-card'),
  ).toHaveCount(4);
  await host.locator('[data-action="browse-back"]').click();
  // Education has no chips.
  await host.locator('[data-see-all="education"]').click();
  await expect(host.locator('.browse-chip')).toHaveCount(0);
  // Adding a template puts it under Recently used.
  await host.locator('.library-card[data-item-id="template-2"]').click();
  await page.locator('.modal-dialog [data-action="template-confirm"]').click();
  await expect(
    host.locator(
      '[data-section="recent"] .library-card[data-item-id="template-2"]',
    ),
  ).toBeVisible();
});

test('[TPL-015] Save scene to My Templates keeps a scene in My Templates (not an undo step); it is added again like any template', async ({
  page,
}) => {
  const steps = (await labels(page)).length;
  const name = (await scene(page)).name;
  // The empty canvas menu (R5: saved at once under the scene's name).
  const point = await toScreen(page, 30, 700);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page
    .locator('#canvas-context-menu [data-action="save-scene-to-mine"]')
    .click();
  await expect(
    page.locator('.toast', { hasText: 'Saved to My Templates › Scene' }),
  ).toBeVisible();
  expect((await labels(page)).length).toBe(steps);
  // R5: My Templates (left rail) lists it with its poster.
  await showCategory(page, 'MyTemplates');
  const mine = page.locator('#library-mine .mine-card');
  await expect(mine).toHaveCount(1);
  await expect(mine.locator('img')).toHaveAttribute('src', /^data:image\//);
  // It is kept after a reload (My library), and adds as a new scene.
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'MyTemplates');
  const before = (await hook(page)).project.compositions.length;
  await page.locator('#library-mine .mine-card').click();
  // FIX7: a click opens the scene's breakdown; the whole scene is added
  // from its button (or by dragging the card).
  await page.locator('.scene-breakdown [data-action="scene-add-all"]').click();
  await page.locator('.modal-dialog [data-template-mode="new"]').click();
  await page.locator('.modal-dialog [data-action="template-confirm"]').click();
  const project = (await hook(page)).project;
  expect(project.compositions).toHaveLength(before + 1);
  const added = await scene(page);
  expect(added.name).toBe(name);
  expect(added.layers.length).toBe(project.compositions[0]!.layers.length);
  await page.keyboard.press('Control+z');
  expect((await hook(page)).project.compositions).toHaveLength(before);
});

test('[SHP-026] Elements: Browse categories (Shapes and Graphics live, the rest planned), a Shapes page with Lines and shape sections, and a Graphics page', async ({
  page,
}) => {
  // No separate Graphics rail item.
  await expect(
    page.locator('#rail-left [data-category="Graphics"]'),
  ).toHaveCount(0);
  await showCategory(page, 'Elements');
  const host = panel(page, 'elements');
  const tiles = host.locator('[data-section="categories"] .browse-card');
  await expect(tiles).toHaveText([
    'Shapes',
    'Graphics',
    'Photos',
    'Videos',
    // FINAL2 U2: stock Icons and Stickers; the planned tiles follow the live ones.
    'Icons',
    'Stickers',
    'Audio',
    'Tables',
    '3D',
    'Animations',
    'Charts',
    'Frames',
    'Grids',
  ]);
  for (const [tile, id] of [
    ['charts', 'SHP-016'],
    ['frames', 'MSK-003'],
  ] as const) {
    const button = host.locator(`[data-tile="${tile}"]`);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAttribute('title', 'Coming soon');
  }
  // Shapes: Lines first, then the shape sections.
  await host.locator('[data-tile="shapes"]').click();
  await expect(host.locator('.browse-section-head h3')).toContainText([
    'Lines',
    'Basic shapes',
    'Polygons',
    'Stars',
    'Arrows',
  ]);
  await expect(host.locator('[data-section="lines"] .browse-card')).toHaveText([
    'Line',
    'Dashed line',
    'Dotted line',
    'Arrow',
    'Double arrow',
  ]);
  await host.locator('[data-shape="line-dashed"]').click();
  let layer = (await scene(page)).layers.at(-1)!;
  expect(layer.properties.strokeDash?.value).toBe('dash');
  await host.locator('[data-shape="arrow-double"]').click();
  layer = (await scene(page)).layers.at(-1)!;
  expect(layer.properties.arrowStart?.value).toBe(true);
  // Recently used shows them on the Shapes page and the Elements page.
  await expect(
    host.locator('[data-section="recent"] [data-shape="arrow-double"]'),
  ).toBeVisible();
  await host.locator('[data-action="browse-back"]').click();
  await expect(
    host.locator('[data-section="recent"] [data-shape="line-dashed"]'),
  ).toBeVisible();
  // Graphics: Featured, Gradients and Backgrounds.
  await host.locator('[data-tile="graphics"]').click();
  await expect(host.locator('.browse-section-head h3')).toContainText([
    'Featured',
    'Gradients',
    'Backgrounds',
  ]);
  await expect(
    host.locator('[data-section="featured"] .library-card'),
  ).toHaveCount(6);
});

test('[TXT-038] Text: Add a text box, default styles (click and drag), sections with See all, and planned Magic Write, Dynamic text and Captions', async ({
  page,
}) => {
  await showCategory(page, 'Text');
  const host = panel(page, 'text');
  await expect(host.locator('[data-action="magic-write"]')).toHaveAttribute(
    'title',
    'Coming soon',
  );
  // FIX6: no disabled tiles that repeat another feature or have no plan:
  // Auto Caption lives in the right rail, page number and date is dropped.
  await expect(host.locator('[data-action="dynamic-text"]')).toHaveCount(0);
  await expect(host.locator('[data-action="captions"]')).toHaveCount(0);
  // FINAL3 T5: Canva's order: default styles, font combinations, the
  // then the rest.
  await expect(host.locator('.browse-section-head h3')).toContainText([
    'Default text styles',
    'Font combinations',
    'Plain text',
    'Text styles',
    'Titles',
    'Two line',
  ]);
  // Add a text box: one step, centred, selected.
  await host.locator('#add-text-box').click();
  expect((await labels(page)).at(-1)).toBe('Add text');
  const box = (await scene(page)).layers.at(-1)!;
  expect(box.type).toBe('text');
  expect(box.properties.text?.value).toBe('Add your text');
  // A default style drags onto the canvas at the drop point.
  const canvas = page.locator('#composition-canvas');
  const at = await toScreen(page, 300, 500);
  const rect = (await canvas.boundingBox())!;
  await host
    .locator('[data-section="default"] [data-item-id="text-add-subheading"]')
    .dragTo(canvas, { targetPosition: { x: at.x - rect.x, y: at.y - rect.y } });
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBeGreaterThan(0);
  const sub = (await scene(page)).layers.at(-1)!;
  expect(sub.properties.text?.value).toBe('Add a subheading');
  const width = sub.properties.width?.value as number,
    height = sub.properties.height?.value as number;
  // Within the pointer's rounding to whole screen pixels.
  expect(
    Math.abs(sub.transform.position.value[0] + width / 2 - 300),
  ).toBeLessThan(3);
  expect(
    Math.abs(sub.transform.position.value[1] + height / 2 - 500),
  ).toBeLessThan(3);
  // See all opens a full list.
  await host.locator('[data-see-all="styles"]').click();
  expect(await host.locator('.library-card').count()).toBeGreaterThanOrEqual(
    24,
  );
});

test('[MED-038] Media: type tabs, sort, folders with drag in, Designs from Save frame to Media, and a drop zone', async ({
  page,
}) => {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  // The drop zone opens the file picker too.
  await page.locator('#media-dropzone').click();
  await (
    await chooser
  ).setFiles([
    path.join(MEDIA, 'image_gradient_1920x1080.png'),
    path.join(MEDIA, 'video_testsrc_720p_2s_vp9_opus.webm'),
    path.join(MEDIA, 'audio_tone_440hz_3s.wav'),
  ]);
  const cards = page.locator('#media-panel .media-card:visible');
  await expect(cards).toHaveCount(3);
  for (const [tab, kind] of [
    ['image', 'image'],
    ['video', 'video'],
    ['audio', 'audio'],
  ] as const) {
    await page.locator(`[data-media-tab="${tab}"]`).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute('data-kind', kind);
  }
  await page.locator('[data-media-tab="all"]').click();
  // Sort by name.
  await page.locator('#media-sort').selectOption('name');
  await expect(cards.locator('.media-name')).toHaveText([
    'audio_tone_440hz_3s.wav',
    'image_gradient_1920x1080.png',
    'video_testsrc_720p_2s_vp9_opus.webm',
  ]);
  // R4: folders are tabs. New folder (beside the search) makes one.
  await page.locator('#media-folder-new').click();
  await page.locator('[data-role="prompt-input"]').fill('B-roll');
  await page.keyboard.press('Enter');
  const folder = page.locator('#media-panel .shelf-folder-tab', {
    hasText: 'B-roll',
  });
  await expect(folder).toHaveAttribute('aria-selected', 'true');
  await expect(cards).toHaveCount(0);
  // Move to folder from the card's "⋯" menu.
  await page.locator('[data-media-tab="all"]').click();
  const video = page.locator('.media-item:has(.media-card[data-kind="video"])');
  await video.hover();
  await video.locator('[data-action="media-more"]').click();
  await page.locator('#media-menu [data-action="media-folder"]').click();
  await page.locator('[data-action="media-folder-pick"]').click();
  await folder.click();
  await expect(cards).toHaveCount(1);
  // A dragged card moves into a folder too.
  const transfer = await page.evaluateHandle(
    (id) => {
      const data = new DataTransfer();
      data.setData('application/x-editor-asset', id);
      return data;
    },
    (await hook(page)).project.assets.find((asset) => asset.type === 'image')!
      .id,
  );
  await folder.dispatchEvent('dragover', { dataTransfer: transfer });
  await folder.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(cards).toHaveCount(2);
  expect((await hook(page)).history.canUndo).toBe(false);
  // Designs: Save frame to Media in the export dialog.
  await page.locator('#export').click();
  await page.locator('.modal-dialog #export-png-media').click();
  await expect(page.locator('.toast', { hasText: 'Designs' })).toBeVisible();
  await page.locator('.modal-dialog .modal-close').click();
  await page.locator('[data-media-tab="design"]').click();
  await expect(cards).toHaveCount(1);
  await page.locator('[data-media-tab="image"]').click();
  await expect(cards).toHaveCount(1);
});

test('[SHP-027] the Draw palette: Draw collapses the panel; Shape, Line, Sticky note and Text add from their flyouts (the canvas adds nothing); Signature and the brushes work; closing restores the panel', async ({
  page,
}) => {
  expect(await leftOpen(page)).toBe(true);
  await showCategory(page, 'Draw');
  const palette = page.locator('#draw-palette');
  await expect(palette).toBeVisible();
  await expect.poll(() => leftOpen(page)).toBe(false);
  // Draw is on with the brush flyout.
  await expect(palette.locator('[data-palette-tool="draw"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#draw-flyout [data-brush="pen"]')).toBeVisible();
  expect((await hook(page)).session.drawBrush).toBe('pen');
  // Table is a real tool now (its flyout lists the sizes).
  await expect(palette.locator('[data-palette-tool="table"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // FIX9: the canvas never creates an object. With the Shape tool open, a
  // click or a drag on the canvas adds nothing; the tiles do.
  await palette.locator('[data-palette-tool="shape"]').click();
  await expect(page.locator('#draw-flyout .draw-tile').first()).toBeVisible();
  await expect(page.locator('#draw-panel')).toBeHidden();
  const before = (await scene(page)).layers.length;
  const a = await toScreen(page, 700, 100),
    b = await toScreen(page, 1000, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.mouse.click(b.x, b.y);
  expect((await scene(page)).layers.length).toBe(before);
  // A shape tile adds that shape, centred, as one undo step.
  await page.locator('#draw-flyout .draw-tile').nth(2).click();
  expect((await labels(page)).at(-1)).toBe('Add shape');
  expect((await scene(page)).layers.length).toBe(before + 1);
  // Line, Sticky note: their tiles add; Text: a text style adds text.
  await palette.locator('[data-palette-tool="line"]').click();
  await page.locator('#draw-flyout .draw-tile').nth(3).click();
  let layer = (await scene(page)).layers.at(-1)!;
  expect(layer.properties.shapeKind?.value).toBe('arrow');
  await palette.locator('[data-palette-tool="sticky"]').click();
  await page.locator('#draw-flyout .draw-tile').nth(2).click();
  expect((await labels(page)).at(-1)).toBe('Add sticky note');
  layer = (await scene(page)).layers.at(-1)!;
  expect(layer.type).toBe('group');
  expect(layer.children.map((child) => child.type)).toEqual(['shape', 'text']);
  await palette.locator('[data-palette-tool="text"]').click();
  await page.locator('#draw-flyout .draw-text-tile').first().click();
  expect((await scene(page)).layers.at(-1)!.type).toBe('text');
  // Each placement is one undo step.
  const steps = (await labels(page)).length;
  await page.keyboard.press('Control+z');
  expect((await labels(page)).length).toBe(steps - 1);
  // Signature opens the H6 panel (the left panel opens for it).
  await palette.locator('#palette-signature').click();
  await expect(page.locator('[data-signature-tab="type"]')).toBeVisible();
  // Close: the palette goes, draw mode ends.
  await page.locator('#draw-palette-close').click();
  await expect(palette).toBeHidden();
  expect((await hook(page)).session.drawBrush).toBe(null);
});
