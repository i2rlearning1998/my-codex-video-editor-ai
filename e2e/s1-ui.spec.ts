import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, toScreen } from './fixtures';
import { MOVE, importPack } from './creator-helpers';

// S1: Clipchamp-level library panels and menus, measured at 1920 × 1080.
test.use({ viewport: { width: 1920, height: 1080 } });
const SHAPE = readFileSync('examples/creator-packs/shape.json', 'utf8');
const PNG = path.resolve('tests/fixtures/media/image_gradient_1920x1080.png');

const LEFT = [
  'Templates',
  'Elements',
  'Text',
  'Media',
  'Scene',
  'Record',
  'Audio',
  'AI',
  'MyTemplates',
  'Theme',
] as const;
const leftOpen = (page: Page) =>
  page.evaluate(
    () =>
      (
        document.querySelector('.library') as HTMLElement
      ).getBoundingClientRect().width > 100,
  );

test.beforeEach(async ({ page }) => {
  // The real right panel, not the legacy reserved column (D-190).
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_RIGHT__?: string }).__AIVE_E2E_RIGHT__ = 'off';
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[S1-001] every panel has one header: the title and exactly one collapse button, which collapses the panel', async ({
  page,
}) => {
  const head = page.locator('.library .panel-head');
  for (const category of LEFT) {
    await showCategory(page, category);
    await expect(head).toHaveCount(1);
    await expect(head.locator('.panel-head-title')).toHaveText(/\S/);
    await expect(head.locator('button')).toHaveCount(1);
    // No Back arrow or Close cross anywhere in the panel's visible headers.
    for (const old of [
      '.shelf-collapse',
      '.browse-close',
      '.browse-header:visible',
      '.theme-title',
    ])
      await expect(page.locator(`.library ${old}`)).toHaveCount(0);
  }
  for (const category of LEFT) {
    await showCategory(page, category);
    await head.locator('button').click();
    await expect.poll(() => leftOpen(page)).toBe(false);
  }
  // The right panel's header is the same component.
  const badge = await toScreen(page, 80, 460);
  await page.mouse.click(badge.x, badge.y);
  await page
    .locator('#rail-right button[data-section]:not([disabled]):visible')
    .first()
    .click();
  const right = page.locator('.inspector .panel-head');
  await expect(right).toHaveCount(1);
  await expect(right.locator('button')).toHaveCount(1);
  await expect(right.locator('.panel-head-title')).toHaveText(/\S/);
  await right.locator('button').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector('.inspector')!.getBoundingClientRect().width,
      ),
    )
    .toBeLessThan(10);
});

type Box = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};
const box = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el): Box => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    });
const PANELS = [
  ['Media', '#media-panel'],
  ['AI', '#library-ai'],
  ['MyTemplates', '#library-mine'],
] as const;
/** One picture in Media, a shape and a preset in AI, a shape in My Templates. */
async function fill(page: Page) {
  await showCategory(page, 'Media');
  await page.locator('#import-media-input').setInputFiles(PNG);
  await expect(page.locator('#media-panel .shelf-item')).toHaveCount(1);
  await importPack(page, SHAPE);
  await importPack(page, MOVE);
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
  const point = await toScreen(page, 80, 460);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const menu = page.locator('#canvas-context-menu');
  await menu.locator('[data-action="save-to-mine"]').click();
  await menu.locator('[data-action="save-to-mine-shape"]').click();
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
}

test('[S1-002] Media, AI and My Templates share one layout: the same panel width, full-width rows on one left and right edge, search 40 px with a 40 × 40 New folder 8 px after it', async ({
  page,
}) => {
  await fill(page);
  const widths: number[] = [];
  for (const [category, host] of PANELS) {
    await showCategory(page, category);
    const panel = await box(page, '.library');
    widths.push(panel.width);
    const search = await box(page, `${host} .shelf-search`);
    const folder = await box(page, `${host} .shelf-new-folder`);
    const cards = await box(page, `${host} .shelf-cards`);
    expect(search.height).toBeCloseTo(40, 0);
    expect([folder.width, folder.height]).toEqual([40, 40]);
    expect(folder.left - search.right).toBeCloseTo(8, 0);
    // 16 px of padding on both sides of the panel's content.
    const content = await box(page, host);
    expect(search.left - content.left).toBeCloseTo(16, 0);
    expect(content.right - folder.right).toBeCloseTo(16, 0);
    const rows = [cards];
    if (category === 'Media') {
      rows.push(await box(page, '#media-panel .import-row'));
      rows.push(await box(page, '#media-dropzone'));
      const imp = await box(page, '#import-media');
      expect(imp.height).toBeCloseTo(44, 0);
      expect((await box(page, '#media-dropzone')).height).toBeCloseTo(56, 0);
      const sort = await box(page, '#media-sort');
      expect(sort.right).toBeCloseTo(folder.right, 0);
    }
    if (category === 'AI') {
      const actions = await box(page, '#ai-actions');
      rows.push(actions);
      const a = await box(page, '#ai-import');
      const b = await box(page, '#ai-copy-brief');
      expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
      expect(a.top).toBeCloseTo(b.top, 0);
    }
    if (category === 'MyTemplates')
      await expect(page.locator(`${host} .shelf-actions`)).toHaveCount(0);
    for (const row of rows) {
      expect(row.left).toBeCloseTo(search.left, 0);
      expect(row.right).toBeCloseTo(folder.right, 0);
    }
  }
  // The same width for every left panel, so the canvas never jumps.
  for (const category of [
    'Templates',
    'Elements',
    'Text',
    'Scene',
    'Audio',
    'Theme',
  ]) {
    await showCategory(page, category);
    widths.push((await box(page, '.library')).width);
  }
  expect(new Set(widths).size).toBe(1);
  expect(widths[0]).toBeGreaterThanOrEqual(370);
});

test('[S1-003] cards are two equal columns of the same width (at least 165 px) in Media, AI and My Templates; "⋯" and "+" sit inside the thumbnail, at least 28 px, and never also add the card', async ({
  page,
}) => {
  await fill(page);
  const widths: number[] = [];
  for (const [category, host] of PANELS) {
    await showCategory(page, category);
    const items = page.locator(`${host} .shelf-item`);
    for (const index of [...Array(await items.count()).keys()]) {
      const item = items.nth(index);
      const card = await item
        .locator('.shelf-card')
        .evaluate((el) => el.getBoundingClientRect().width);
      widths.push(card);
      // The thumbnail shows a picture, never a placeholder pill.
      const thumb = item.locator('.shelf-thumb');
      const t = await thumb.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      });
      expect(t.width / t.height).toBeCloseTo(16 / 9, 1);
      await item.hover();
      for (const [button, tip] of [
        ['.shelf-more', 'More options'],
        ['.shelf-plus', 'Add to Scene'],
      ] as const) {
        const control = item.locator(button);
        await expect(control).toHaveCSS('opacity', '1');
        await expect(control).toHaveAttribute('title', tip);
        const c = await control.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        });
        expect(c.width).toBeGreaterThanOrEqual(28);
        expect(c.height).toBeGreaterThanOrEqual(28);
        expect(c.left).toBeGreaterThanOrEqual(t.left);
        expect(c.right).toBeLessThanOrEqual(t.right);
        expect(c.top).toBeGreaterThanOrEqual(t.top);
        expect(c.bottom).toBeLessThanOrEqual(t.bottom);
        expect(t.right - c.right).toBeCloseTo(8, 0);
      }
      const more = await item.locator('.shelf-more').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top;
      });
      expect(more - t.top).toBeCloseTo(8, 0);
      const plus = await item
        .locator('.shelf-plus')
        .evaluate((el) => el.getBoundingClientRect().bottom);
      expect(t.bottom - plus).toBeCloseTo(8, 0);
    }
  }
  expect(widths.length).toBeGreaterThanOrEqual(4);
  for (const width of widths) {
    expect(width).toBeGreaterThanOrEqual(165);
    expect(Math.abs(width - widths[0]!)).toBeLessThanOrEqual(1);
  }
  // "⋯" opens the menu without adding; "+" adds once.
  await showCategory(page, 'AI');
  const steps = (await hook(page)).history.labels.length;
  const item = page.locator('#library-ai .shelf-item').first();
  await item.hover();
  await item.locator('.shelf-more').click();
  await expect(page.locator('#ai-menu')).toBeVisible();
  expect((await hook(page)).history.labels.length).toBe(steps);
  await page.keyboard.press('Escape');
  await item.hover();
  await item.locator('.shelf-plus').click();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps + 1);
});

test('[S1-004] Media always shows All, Images, Videos and Audio; AI and My Templates show All plus a chip per kind that has items; AI cards carry no AI bar', async ({
  page,
}) => {
  const chips = (host: string) =>
    page
      .locator(`${host} .shelf-tab`)
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset.tab),
      );
  await showCategory(page, 'Media');
  expect(await chips('#media-panel')).toEqual([
    'all',
    'image',
    'video',
    'audio',
  ]);
  await showCategory(page, 'AI');
  expect(await chips('#library-ai')).toEqual([]);
  await importPack(page, SHAPE);
  await importPack(page, MOVE);
  await expect(page.locator('#library-ai .shelf-tabs')).toBeVisible();
  expect(await chips('#library-ai')).toEqual(['all', 'shape', 'preset']);
  await expect(page.locator('#library-ai .ai-chip')).toHaveCount(0);
  // The preset card is an ordinary card with a drawn thumbnail.
  const preset = page.locator(
    '#library-ai .shelf-item[data-item-id="move-pack--preset-move"]',
  );
  await expect(preset.locator('.shelf-thumb')).not.toHaveAttribute(
    'data-thumb',
    'placeholder',
  );
  await showCategory(page, 'MyTemplates');
  expect(await chips('#library-mine')).toEqual([]);
});

const sceneOf = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (c) => c.id === state.session.compositionId,
  )!;
};
/** Drags `card` with the mouse to (x, y) and releases. */
async function dragCard(
  page: Page,
  card: ReturnType<Page['locator']>,
  to: { x: number; y: number },
) {
  const from = (await card.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 3);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + 20, {
    steps: 3,
  });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
/** A point in the first lane (text and shapes), well after its clip. */
async function laneSpot(page: Page) {
  const row = page.locator('#timeline-foundation .timeline-nle-row').first();
  const clip = (await row.locator('.timeline-clip').first().boundingBox())!;
  const view = (await page
    .locator('#timeline-foundation .timeline-scroll')
    .boundingBox())!;
  return { x: view.x + view.width - 80, y: clip.y + clip.height / 2 };
}

test('[S1-005] AI, My Templates and Media cards drag to the canvas (centred on the drop point) and to the timeline (a clip at the drop time), each one undo step', async ({
  page,
}) => {
  await fill(page);
  const cases = [
    [
      'AI',
      '#library-ai .shelf-item[data-item-id="shape-pack--shape-kite"] .shelf-card',
    ],
    ['MyTemplates', '#library-mine .shelf-card'],
    ['Media', '#media-panel .shelf-card'],
  ] as const;
  for (const [category, selector] of cases) {
    // Canvas: the new element's box is centred on the drop point.
    await showCategory(page, category);
    const before = new Set((await sceneOf(page)).layers.map((l) => l.id));
    const steps = (await hook(page)).history.labels.length;
    const drop = await toScreen(page, 900, 300);
    await dragCard(page, page.locator(selector).first(), drop);
    await expect
      .poll(async () => (await sceneOf(page)).layers.length)
      .toBe(before.size + 1);
    expect((await hook(page)).history.labels.length).toBe(steps + 1);
    const added = (await sceneOf(page)).layers.find((l) => !before.has(l.id))!;
    await expect
      .poll(async () => (await hook(page)).session.selectedIds)
      .toContain(added.id);
    // The drawn selection box (canvas pixels) is centred on the drop.
    const centre = await page.evaluate(() => {
      const corners = (
        window as unknown as {
          __AIVE__: { getCanvas(): { corners: number[][] | null } };
        }
      ).__AIVE__.getCanvas().corners;
      const rect = document
        .querySelector('#composition-canvas')!
        .getBoundingClientRect();
      if (!corners?.length) return null;
      return [
        rect.left + corners.reduce((sum, p) => sum + p[0]!, 0) / corners.length,
        rect.top + corners.reduce((sum, p) => sum + p[1]!, 0) / corners.length,
      ];
    });
    expect(centre).not.toBeNull();
    expect(Math.abs(centre![0]! - drop.x)).toBeLessThan(12);
    expect(Math.abs(centre![1]! - drop.y)).toBeLessThan(12);
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await sceneOf(page)).layers.length)
      .toBe(before.size);
    // Media's timeline drops are proven by MED-039 and MED-041.
    if (category === 'Media') continue;
    // Timeline: a clip that starts at the drop time, not at the playhead.
    const spot = await laneSpot(page);
    await dragCard(page, page.locator(selector).first(), spot);
    await expect
      .poll(async () => (await sceneOf(page)).layers.length)
      .toBe(before.size + 1);
    const layer = (await sceneOf(page)).layers.find((l) => !before.has(l.id))!;
    const clip = (await sceneOf(page)).tracks
      .flatMap((track) => track.clips)
      .find((item) => item.layerId === layer.id)!;
    expect(clip.startTime).toBeGreaterThan(1);
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await sceneOf(page)).layers.length)
      .toBe(before.size);
  }
});

const PULSE = readFileSync('tests/fixtures/code/pulse-block.js', 'utf8');
/** Imports the pulse block through AI › Import; `place` adds it too. */
async function importPulse(page: Page, place: boolean) {
  await showCategory(page, 'AI');
  await page.locator('#ai-import').click();
  await page.locator('#ai-import-source').fill(PULSE);
  await expect(page.locator('.ai-import-item')).toHaveAttribute(
    'data-status',
    'ok',
  );
  if (!place) await page.locator('#ai-import-scene').uncheck();
  await page.locator('#ai-import-add').click();
  await expect(page.locator('.ai-import-dialog')).toBeHidden();
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
}
const codeLayerId = async (page: Page) => {
  await expect
    .poll(async () => (await sceneOf(page)).layers.some((l) => l.code))
    .toBe(true);
  return (await sceneOf(page)).layers.find((l) => l.code)!.id;
};
const inside = async (page: Page, selector: string) => {
  // Measured after the menu's enter animation (a 0.98 scale) has finished.
  await page
    .locator(selector)
    .last()
    .evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
    );
  const box = (await page.locator(selector).last().boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height);
  return box;
};
const topRows = (page: Page, selector: string) =>
  page
    .locator(selector)
    .evaluate(
      (menu) =>
        menu.querySelectorAll(':scope > button, :scope > [role="menuitem"]')
          .length,
    );

test('[S1-006] canvas and timeline menus stay inside the window at the canvas bottom-right, the timeline bottom and the window edges; 240 to 260 px wide, 32 px rows, at most 14 top-level rows for a code layer', async ({
  page,
}) => {
  await importPulse(page, true);
  const id = await codeLayerId(page);
  const canvasMenu = '#canvas-context-menu';
  // Canvas: right-clicks at the artboard's bottom-right and near its edges.
  for (const [x, y] of [
    [1270, 710],
    [10, 710],
    [1270, 10],
    [640, 360],
  ] as const) {
    await page.keyboard.press('Escape');
    const point = await toScreen(page, x, y);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await expect(page.locator(canvasMenu)).toBeVisible();
    const box = await inside(page, canvasMenu);
    expect(box.width).toBeGreaterThanOrEqual(240);
    expect(box.width).toBeLessThanOrEqual(260);
  }
  // The code layer's canvas menu: short, with submenus inside the window.
  await page.keyboard.press('Escape');
  const centre = await toScreen(page, 640, 360);
  await page.mouse.click(centre.x, centre.y);
  await page.mouse.click(centre.x, centre.y, { button: 'right' });
  await expect(
    page.locator(`${canvasMenu} [data-action="code-menu"]`),
  ).toBeVisible();
  expect(await topRows(page, canvasMenu)).toBeLessThanOrEqual(14);
  const row = (await page
    .locator(`${canvasMenu} > button`)
    .first()
    .boundingBox())!;
  expect(row.height).toBeCloseTo(32, 0);
  for (const parent of ['code-menu', 'save-to-mine', 'more-menu']) {
    await page.locator(`${canvasMenu} > [data-action="${parent}"]`).click();
    await inside(page, `${canvasMenu} .menu-flyout`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Timeline: the code clip, at the bottom of the timeline and at the
  // window's right edge.
  const menu = '#timeline-foundation .timeline-menu';
  const clip = page.locator(
    `#timeline-foundation .timeline-clip[data-id="${id}"]`,
  );
  const lanes = (await page
    .locator('#timeline-foundation .timeline-scroll')
    .boundingBox())!;
  const clipBox = (await clip.boundingBox())!;
  for (const point of [
    { x: clipBox.x + 20, y: clipBox.y + clipBox.height / 2 },
    { x: lanes.x + 40, y: lanes.y + lanes.height - 6 },
    { x: lanes.x + lanes.width - 6, y: lanes.y + lanes.height - 6 },
  ]) {
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await expect(page.locator(menu)).toBeVisible();
    const box = await inside(page, menu);
    expect(box.width).toBeGreaterThanOrEqual(240);
    expect(box.width).toBeLessThanOrEqual(260);
    await page.keyboard.press('Escape');
  }
  await clip.click({ button: 'right', position: { x: 20, y: 8 } });
  await expect(page.locator(`${menu} [data-action="code-menu"]`)).toBeVisible();
  expect(await topRows(page, menu)).toBeLessThanOrEqual(14);
  for (const parent of ['code-menu', 'clip-menu', 'track-menu', 'save-mine']) {
    await page.locator(`${menu} > [data-action="${parent}"]`).click();
    await inside(page, '#timeline-foundation .timeline-submenu');
  }
  // Clip › Speed opens a second level, also inside the window.
  await page.locator(`${menu} > [data-action="clip-menu"]`).click();
  await page
    .locator('#timeline-foundation .timeline-submenu [data-action="speed"]')
    .click();
  await expect(
    page.locator('#timeline-foundation .timeline-submenu'),
  ).toHaveCount(2);
  await inside(page, '#timeline-foundation .timeline-submenu');
});

test('[S1-007] Save to My Templates lists every kind, none hidden or covered; "Save as template" exists nowhere', async ({
  page,
}) => {
  await importPulse(page, true);
  const id = await codeLayerId(page);
  const kinds = [
    'shape',
    'text',
    'background',
    'animation',
    'video',
    'image',
    'annotation',
    'sticker',
    'scene',
  ];
  /** Every entry is drawn on top: the element at its centre is itself. */
  const allShown = async (selector: string) => {
    for (const item of await page.locator(selector).all()) {
      const box = (await item.boundingBox())!;
      const hit = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x!, y!);
          return el?.closest('button')?.textContent ?? null;
        },
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      expect(hit).toBe(await item.textContent());
    }
  };
  const point = await toScreen(page, 640, 360);
  await page.mouse.click(point.x, point.y);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  const canvasMenu = page.locator('#canvas-context-menu');
  await expect(canvasMenu).not.toContainText('Save as template');
  await canvasMenu.locator('> [data-action="save-to-mine"]').click();
  for (const kind of kinds)
    await expect(
      canvasMenu.locator(`[data-action="save-to-mine-${kind}"]`),
    ).toBeVisible();
  await allShown('#canvas-context-menu .menu-flyout button');
  await canvasMenu.locator('> [data-action="code-menu"]').click();
  await expect(canvasMenu).not.toContainText('Save as template');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Timeline.
  const menu = page.locator('#timeline-foundation .timeline-menu');
  await page
    .locator(`#timeline-foundation .timeline-clip[data-id="${id}"]`)
    .click({ button: 'right', position: { x: 20, y: 8 } });
  await expect(menu).not.toContainText('Save as template');
  await menu.locator('> [data-action="save-mine"]').click();
  for (const kind of kinds)
    await expect(
      menu.locator(
        `.timeline-submenu [data-action="save-mine-kind"][data-kind="${kind}"]`,
      ),
    ).toBeVisible();
  await allShown('#timeline-foundation .timeline-submenu button');
  await menu.locator('> [data-action="code-menu"]').click();
  await expect(menu).not.toContainText('Save as template');
  await expect(menu.locator('[data-command="code-save-template"]')).toHaveCount(
    0,
  );
  // The empty canvas menu says Save scene to My Templates.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Escape');
  const corner = await toScreen(page, 1270, 10);
  await page.mouse.click(corner.x, corner.y, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await expect(canvasMenu).not.toContainText('Save as template');
});

test('[S1-008] AI and My Templates code animations have Duplicate ("<name> copy", unique) and Export, and an exported file imports again', async ({
  page,
}) => {
  await importPulse(page, false);
  const ai = page.locator('#library-ai');
  const card = (name: string) =>
    ai.locator('.shelf-item', { hasText: new RegExp(`^${name}$`) });
  await expect(ai.locator('.shelf-item')).toHaveCount(1);
  const first = ai.locator('.shelf-item').first();
  const name = (await first.locator('.shelf-name').textContent())!;
  const menuOf = async (item: ReturnType<Page['locator']>, host: string) => {
    await item.hover();
    await item.locator('.shelf-more').click();
    await expect(page.locator(`#${host}-menu`)).toBeVisible();
    await inside(page, `#${host}-menu`);
  };
  await menuOf(first, 'ai');
  await page.locator('#ai-menu [data-action="ai-duplicate"]').click();
  await expect(card(`${name} copy`)).toHaveCount(1);
  await menuOf(first, 'ai');
  await page.locator('#ai-menu [data-action="ai-duplicate"]').click();
  await expect(card(`${name} copy 2`)).toHaveCount(1);
  // Export, then import the file again.
  await menuOf(first, 'ai');
  const download = page.waitForEvent('download');
  await page.locator('#ai-menu [data-action="ai-export"]').click();
  const file = await (await download).path();
  expect(readFileSync(file, 'utf8')).toBe(PULSE);
  await page.locator('#ai-import').click();
  await page.locator('#ai-import-file').setInputFiles(file);
  await expect(page.locator('.ai-import-item')).toHaveAttribute(
    'data-status',
    'ok',
  );
  await page.locator('#ai-import-cancel').click();
  // My Templates: a code layer saved as an Animation.
  await first.locator('.shelf-plus').click({ force: true });
  const id = await codeLayerId(page);
  await page
    .locator(`#timeline-foundation .timeline-clip[data-id="${id}"]`)
    .click({ button: 'right', position: { x: 20, y: 8 } });
  const menu = page.locator('#timeline-foundation .timeline-menu');
  await menu.locator('> [data-action="save-mine"]').click();
  await menu.locator('.timeline-submenu [data-kind="animation"]').click();
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
  await showCategory(page, 'MyTemplates');
  const mine = page.locator('#library-mine .shelf-item');
  await expect(mine).toHaveCount(1);
  const saved = (await mine.first().locator('.shelf-name').textContent())!;
  await menuOf(mine.first(), 'mine');
  await page.locator('#mine-menu [data-action="mine-duplicate"]').click();
  await expect(mine).toHaveCount(2);
  await expect(page.locator('#library-mine')).toContainText(`${saved} copy`);
  await menuOf(mine.last(), 'mine');
  const download2 = page.waitForEvent('download');
  await page.locator('#mine-menu [data-action="mine-export"]').click();
  const file2 = await (await download2).path();
  expect(readFileSync(file2, 'utf8')).toBe(PULSE);
  await showCategory(page, 'AI');
  await page.locator('#ai-import').click();
  await page.locator('#ai-import-file').setInputFiles(file2);
  await expect(page.locator('.ai-import-item')).toHaveAttribute(
    'data-status',
    'ok',
  );
});
