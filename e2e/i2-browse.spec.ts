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
  await expect(host.locator('.browse-title')).toHaveText('Templates');
  await expect(host.locator('[data-action="browse-back"]')).toBeHidden();
  // Sections, each with a title, See all and a horizontal strip.
  await expect(host.locator('.browse-section-head h3')).toContainText([
    'All Templates',
    'Video Templates',
    'Graphics Templates',
    'Social media Templates',
    'Education Templates',
    'My Templates',
  ]);
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
  // Close collapses the side panel.
  await host.locator('[data-action="browse-close"]').click();
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

test('[TPL-015] Save as template keeps a scene in My Templates (not an undo step); it is added again like any template', async ({
  page,
}) => {
  const steps = (await labels(page)).length;
  // The empty canvas menu.
  const point = await toScreen(page, 30, 700);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page
    .locator('#canvas-context-menu [data-action="save-as-template"]')
    .click();
  await page.locator('#save-template-name').fill('My intro');
  await page.locator('#save-template-category').selectOption('education');
  await page.locator('[data-action="save-template-confirm"]').click();
  await expect(
    page.locator('.toast', { hasText: 'Saved My intro' }),
  ).toBeVisible();
  expect((await labels(page)).length).toBe(steps);
  // My Templates lists it with its poster, and so does Education.
  await showCategory(page, 'Templates');
  const host = panel(page, 'templates');
  const mine = host.locator('[data-section="my"] [data-my-template]');
  await expect(mine).toHaveCount(1);
  await mine.scrollIntoViewIfNeeded();
  await expect(mine.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await host.locator('[data-see-all="education"]').click();
  await expect(host.locator('[data-my-template]')).toHaveCount(1);
  // It is kept after a reload (browser storage), and adds as a new scene.
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'Templates');
  const before = (await hook(page)).project.compositions.length;
  await panel(page, 'templates')
    .locator('[data-section="my"] [data-my-template]')
    .click();
  await page.locator('.modal-dialog [data-template-mode="new"]').click();
  await page.locator('.modal-dialog [data-action="template-confirm"]').click();
  const project = (await hook(page)).project;
  expect(project.compositions).toHaveLength(before + 1);
  const added = await scene(page);
  expect(added.name).toBe('My intro');
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
    '3D',
    'Animations',
    'Audio',
    'Tables',
    'Charts',
    'Frames',
    'Grids',
  ]);
  for (const [tile, id] of [
    ['photos', 'MED-028'],
    ['tables', 'SHP-025'],
    ['frames', 'MSK-003'],
  ] as const) {
    const button = host.locator(`[data-tile="${tile}"]`);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAttribute(
      'title',
      new RegExp(`Planned: Wave \\d+ \\(${id}\\)`),
    );
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
    'Planned: Wave 10 (AI-001)',
  );
  await expect(host.locator('[data-action="dynamic-text"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(host.locator('[data-action="captions"]')).toHaveAttribute(
    'title',
    'Planned: Wave 8 (TXT-035)',
  );
  await expect(host.locator('.browse-section-head h3')).toContainText([
    'Default text styles',
    'Dynamic text',
    'Font combinations',
    'Plain text',
    'Text styles',
    'Titles',
    'Two line',
    'Captions',
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
    .locator('[data-section="default"] .library-card[data-item-id="text-2"]')
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

test('[TR-010] Transitions: a tip, a Duration control and sections of transitions with posters, planned for Wave 6', async ({
  page,
}) => {
  await showCategory(page, 'Transitions');
  const host = panel(page, 'transitions');
  await expect(host.locator('.browse-tip')).toContainText('Wave 6');
  await expect(host.locator('#transition-duration')).toBeDisabled();
  await expect(host.locator('.browse-section-head h3')).toHaveText([
    'Fades & blurs',
    'Wipes',
    'Pushes',
    'Cartoon',
    'Glitches',
    '3D',
  ]);
  const fade = host.locator('.library-card[data-item-id="transition-fade"]');
  await expect(fade).toHaveAttribute('aria-disabled', 'true');
  await expect(fade).toHaveAttribute('title', 'Planned: Wave 6 (TR-003)');
  await expect(fade.locator('img')).toHaveAttribute('src', /^data:image\/png/);
  // A click does nothing (the card is aria-disabled, so force the click).
  const steps = (await labels(page)).length;
  await fade.click({ force: true });
  expect((await labels(page)).length).toBe(steps);
  // Search: the Glitches section's two transitions match "glitch".
  await host.locator('#browse-search-transitions').fill('glitch');
  await expect(host.locator('.library-card')).toHaveText([
    'Glitch',
    'RGB split',
  ]);
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
  // Folders: create one, drag a card onto it, open it.
  await page.locator('[data-media-tab="folders"]').click();
  await page.locator('#media-folder-new').click();
  await page.locator('[data-role="prompt-input"]').fill('B-roll');
  await page.keyboard.press('Enter');
  const folder = page.locator('.media-folder', { hasText: 'B-roll' });
  await expect(folder).toContainText('0 items');
  // Moving needs a card on screen: the All tab, then drop on the folder in
  // the Folders tab through the menu's Move to folder.
  await page.locator('[data-media-tab="all"]').click();
  const video = page.locator('.media-item:has(.media-card[data-kind="video"])');
  await video.hover();
  await video.locator('[data-action="media-more"]').click();
  await page.locator('#media-menu [data-action="media-folder"]').click();
  await page.locator('[data-action="media-folder-pick"]').click();
  await page.locator('[data-media-tab="folders"]').click();
  await expect(folder).toContainText('1 item');
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
  await expect(folder).toContainText('2 items');
  await folder.locator('.media-folder-open').click();
  await expect(page.locator('#media-folder-name')).toHaveText('B-roll');
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

test('[SHP-027] the Draw palette: Draw collapses the panel; Shape, Line, Sticky note and Text place on the canvas; Signature and the brushes work; closing restores the panel', async ({
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
  // Table is planned.
  await expect(palette.locator('[data-palette-tool="table"]')).toHaveAttribute(
    'title',
    'Planned: Wave 8 (SHP-025)',
  );
  // Shape: drag a rectangle.
  await palette.locator('[data-palette-tool="shape"]').click();
  await expect(page.locator('#draw-flyout')).toBeHidden();
  const a = await toScreen(page, 100, 100),
    b = await toScreen(page, 400, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await expect(page.locator('.place-preview')).toBeVisible();
  await page.mouse.up();
  expect((await labels(page)).at(-1)).toBe('Add shape');
  let layer = (await scene(page)).layers.at(-1)!;
  expect(layer.properties.width?.value as number).toBeCloseTo(300, -1);
  expect(layer.properties.height?.value as number).toBeCloseTo(200, -1);
  expect(layer.transform.position.value[0]).toBeCloseTo(100, -1);
  // The palette is back on Select after placing.
  await expect(palette.locator('[data-palette-tool="select"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Line: drag diagonally.
  await palette.locator('[data-palette-tool="line"]').click();
  const c = await toScreen(page, 600, 100),
    d = await toScreen(page, 900, 400);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(d.x, d.y, { steps: 6 });
  await page.mouse.up();
  layer = (await scene(page)).layers.at(-1)!;
  expect(layer.properties.shapeKind?.value).toBe('line');
  expect(layer.properties.width?.value as number).toBeCloseTo(424, -1);
  expect(layer.transform.rotation.value).toBeCloseTo(45, 0);
  // Sticky note: one group at the click.
  await palette.locator('[data-palette-tool="sticky"]').click();
  const e = await toScreen(page, 1000, 500);
  await page.mouse.click(e.x, e.y);
  expect((await labels(page)).at(-1)).toBe('Add sticky note');
  layer = (await scene(page)).layers.at(-1)!;
  expect(layer.type).toBe('group');
  expect(layer.children.map((child) => child.type)).toEqual(['shape', 'text']);
  // Text: a click adds a text box there.
  await palette.locator('[data-palette-tool="text"]').click();
  const f = await toScreen(page, 300, 600);
  await page.mouse.click(f.x, f.y);
  layer = (await scene(page)).layers.at(-1)!;
  expect(layer.type).toBe('text');
  const width = layer.properties.width?.value as number;
  expect(
    Math.abs(layer.transform.position.value[0] + width / 2 - 300),
  ).toBeLessThan(3);
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
