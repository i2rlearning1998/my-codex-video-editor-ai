import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  openRight,
  showCategory as showVisibleCategory,
  toScreen,
} from './fixtures';
import { importPack } from './creator-helpers';

// FIX5: the owner's bug round (C1 to C10), one focused test per bug.
/** The rail hides some categories under More on a short window (1366 x 768). */
async function showCategory(page: Page, name: string) {
  const button = page.locator(`#rail-left [data-category="${name}"]`);
  if (!(await button.isVisible()) && (await button.count()))
    await button.evaluate((el) => (el as HTMLElement).click());
  else await showVisibleCategory(page, name);
}
const pack = (name: string) =>
  readFileSync(`examples/creator-packs/${name}.json`, 'utf8');

/** The share of a card's thumbnail pixels that are not flat (a pixel check). */
async function thumbIsDrawn(page: Page, slot: Locator) {
  const png = await slot.screenshot();
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let different = 0;
    for (let i = 4; i < data.length; i += 4)
      if (
        Math.abs(data[i]! - data[0]!) +
          Math.abs(data[i + 1]! - data[1]!) +
          Math.abs(data[i + 2]! - data[2]!) >
        24
      )
        different++;
    return different / (data.length / 4);
  }, png.toString('base64'));
}

test('[FX5-001] every AI and My Templates card has a drawn thumbnail (never blank), one kind each', async ({
  page,
}) => {
  test.setTimeout(180_000);
  // The shared import helper needs the AI rail button, hidden under More here.
  test.skip(test.info().project.name !== 'desktop', 'desktop only');
  await page.goto('/');
  for (const name of [
    'shape',
    'background',
    'text',
    'template',
    'motion-b',
    'move-preset',
    'style-documentary',
    'theme-midnight',
  ])
    await importPack(page, pack(name));
  // My Templates: save the example badge as a sticker and as an animation.
  for (const kind of ['sticker', 'animation', 'text']) {
    await showCategory(page, 'Scene');
    await page.locator('#scene-list [data-layer-id="example-badge"]').click();
    const point = await toScreen(page, 80, 460);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    const menu = page.locator('#canvas-context-menu');
    await menu.locator('[data-action="save-to-mine"]').click();
    await menu.locator(`[data-action="save-to-mine-${kind}"]`).click();
  }
  for (const [category, host] of [
    ['AI', '#library-ai'],
    ['MyTemplates', '#library-mine'],
  ] as const) {
    await showCategory(page, category);
    const cards = page.locator(`${host} .shelf-item`);
    await expect.poll(() => cards.count()).toBeGreaterThan(1);
    const total = await cards.count();
    console.log(
      category,
      await cards.evaluateAll((l) =>
        l.map((e) => (e as HTMLElement).dataset.itemId),
      ),
    );
    for (let i = 0; i < total; i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      const slot = card.locator('.shelf-thumb');
      // Wait out the retry: a card settles on a picture or on its icon.
      await expect
        .poll(async () => thumbIsDrawn(page, slot), {
          message: `card ${await card.getAttribute('data-item-id')} stays blank`,
          timeout: 15_000,
        })
        .toBeGreaterThan(0.0002);
    }
  }
  // The same item twice is listed once.
  const ids = await page
    .locator('#library-ai .shelf-item')
    .evaluateAll((items) => items.map((item) => item.textContent?.trim()));
  expect(new Set(ids).size).toBe(ids.length);
});

// C2: audio rows never play on hover; a Play / Stop button does.
test('[FX5-002] audio rows: hover never plays, Play and Stop work, one at a time, My audio and Media audio play, a category switch stops', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Audio');
  const pack = page.locator('#library-audio');
  const riser = pack.locator('.sound-tile[data-sound="riser"] .audio-play');
  const chime = pack.locator('.sound-tile[data-sound="chime"] .audio-play');
  await expect(riser).toHaveAccessibleName('Play preview of Riser');
  await expect(riser).toHaveAttribute('title', 'Play preview of Riser');
  await pack.locator('.sound-tile[data-sound="riser"]').hover();
  await page.waitForTimeout(400);
  await expect(riser).toHaveAttribute('data-state', 'stopped');
  await riser.click();
  await expect(riser).toHaveAttribute('data-state', 'playing');
  await expect(riser).toHaveAccessibleName('Stop preview of Riser');
  await chime.click();
  await expect(chime).toHaveAttribute('data-state', 'playing');
  await expect(riser).toHaveAttribute('data-state', 'stopped');
  await chime.click();
  await expect(chime).toHaveAttribute('data-state', 'stopped');
  // A finished preview resets its button (the click sound lasts 0.08 s).
  const click = pack.locator('.sound-tile[data-sound="click"] .audio-play');
  await click.click();
  await expect(click).toHaveAttribute('data-state', 'stopped');
  // Switching category stops a running preview.
  await riser.click();
  await expect(riser).toHaveAttribute('data-state', 'playing');
  await showCategory(page, 'Media');
  await expect(riser).toHaveAttribute('data-state', 'stopped');

  // An uploaded audio file: Media card and Audio > My audio both play it.
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles(['tests/fixtures/media/audio_tone_440hz_3s.wav']);
  const mediaPlay = page.locator(
    '#media-panel .media-card[data-name="audio_tone_440hz_3s.wav"]',
  );
  await expect(mediaPlay).toBeVisible();
  const mediaButton = page.locator(
    '#media-panel .shelf-item:has(.media-card[data-name="audio_tone_440hz_3s.wav"]) .audio-play',
  );
  await mediaButton.click();
  await expect(mediaButton).toHaveAttribute('data-state', 'playing');
  await mediaButton.click();
  await expect(mediaButton).toHaveAttribute('data-state', 'stopped');
  await showCategory(page, 'Audio');
  await page.locator('[data-audio-tab="mine"]').click();
  const mine = page.locator('.audio-mine-item .audio-play');
  await expect(mine).toHaveCount(1);
  await mine.click();
  await expect(mine).toHaveAttribute('data-state', 'playing');
  await page.locator('[data-audio-tab="sounds"]').click();
  await expect(mine).toHaveAttribute('data-state', 'stopped');
});

// C3: the Scene panel's header, search and first row never overlap.
test('[FX5-003] Scene panel: header, search row and first layer row do not overlap and stay aligned', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Scene');
  await expect(page.locator('#scene-list .outliner-row').first()).toBeVisible();
  const boxes = await page.evaluate(() => {
    const box = (selector: string) => {
      const found = document.querySelector(selector);
      const r = found?.getBoundingClientRect();
      return r
        ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
        : null;
    };
    return {
      header: box('#left-panel-title'),
      search: box('#scene-heading .outliner-search'),
      folder: box('#scene-heading [data-ol="new-collection"]'),
      row: box('#scene-list .outliner-row'),
      panel: box('.library'),
    };
  });
  const { header, search, folder, row, panel } = boxes;
  expect(header && search && folder && row && panel).toBeTruthy();
  expect(header!.bottom).toBeLessThanOrEqual(search!.top);
  expect(search!.bottom).toBeLessThanOrEqual(row!.top);
  // Search and the new-collection button sit on one line without touching.
  expect(search!.right).toBeLessThanOrEqual(folder!.left);
  expect(Math.abs(search!.top - folder!.top)).toBeLessThan(12);
  expect(search!.left).toBeGreaterThanOrEqual(panel!.left);
  expect(folder!.right).toBeLessThanOrEqual(panel!.right);
  await page.screenshot({ path: 'reports/fix5/c3-scene-panel.png' });
});

// C4: the Draw palette opens a flyout of choices per tool before placing.
test('[FX5-004] Draw palette: a chosen shape, line, note colour, text style and table size are what gets placed; Esc cancels; one undo step each', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Draw');
  const palette = page.locator('#draw-palette');
  const choices = page.locator('#draw-choices');
  const layers = async () => {
    const state = await hook(page);
    return state.project.compositions.find(
      (c) => c.id === state.session.compositionId,
    )!.layers as unknown as {
      type: string;
      name: string;
      properties: Record<string, { value: unknown }>;
      children: { properties: Record<string, { value: unknown }> }[];
    }[];
  };
  const before = (await layers()).length;
  // Shape: choose Ellipse, a click places an ellipse.
  await palette.locator('[data-palette-tool="shape"]').click();
  await choices.locator('[data-choice="ellipse"]').click();
  await expect(choices.locator('[data-choice="ellipse"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  let at = await toScreen(page, 300, 300);
  await page.mouse.move(at.x, at.y);
  await expect(page.locator('.place-ghost')).toBeVisible();
  await page.mouse.click(at.x, at.y);
  expect((await layers()).at(-1)!.properties.shapeKind?.value).toBe('ellipse');
  // Line: choose the double arrow; a drag draws its length.
  await palette.locator('[data-palette-tool="line"]').click();
  await choices.locator('[data-choice="arrow-double"]').click();
  at = await toScreen(page, 100, 500);
  const to = await toScreen(page, 500, 500);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  const arrow = (await layers()).at(-1)!;
  expect(arrow.properties.shapeKind?.value).toBe('arrow');
  expect(arrow.properties.width?.value as number).toBeCloseTo(400, -1);
  // Sticky note: the third colour.
  await palette.locator('[data-palette-tool="sticky"]').click();
  await choices.locator('[data-choice="#a7f3d0"]').click();
  at = await toScreen(page, 1000, 500);
  await page.mouse.click(at.x, at.y);
  const note = (await layers()).at(-1)!;
  expect(note.type).toBe('group');
  expect(note.children[0]!.properties.fill?.value).toBe('#a7f3d0');
  // Text: the heading style.
  await palette.locator('[data-palette-tool="text"]').click();
  await choices.locator('[data-choice="text-add-heading"]').click();
  at = await toScreen(page, 600, 150);
  await page.mouse.click(at.x, at.y);
  const heading = (await layers()).at(-1)!;
  expect(heading.type).toBe('text');
  expect(heading.properties.text?.value).toBe('Add a heading');
  // Table: 2 rows by 4 columns.
  await palette.locator('[data-palette-tool="table"]').click();
  await choices.locator('[data-choice="2x4"]').click();
  await expect(choices.locator('.draw-choices-size')).toHaveText(/2.*4/);
  at = await toScreen(page, 600, 650);
  await page.mouse.click(at.x, at.y);
  expect((await layers()).at(-1)!.name).toBe('Table');
  expect((await layers()).length).toBe(before + 5);
  // One undo step each.
  const steps = (await hook(page)).history.labels.length;
  await page.keyboard.press('Control+z');
  expect((await hook(page)).history.labels.length).toBe(steps - 1);
  // Esc cancels a placing drag: nothing is added.
  await palette.locator('[data-palette-tool="shape"]').click();
  const count = (await layers()).length;
  at = await toScreen(page, 200, 200);
  const end = await toScreen(page, 400, 400);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await layers()).length).toBe(count);
  await page.screenshot({ path: 'reports/fix5/c4-flyout.png' });
});

// C5: the Text panel has no My text styles section; Magic write explains itself.
test('[FX5-005] Text panel: no My text styles section; Magic write says it needs the AI service; Dynamic text cards are enabled', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Text');
  const host = page.locator('#library-text');
  await expect(host.locator('.browse-section-head h3').first()).toBeVisible();
  await expect(host.locator('.browse-section-head h3')).not.toContainText([
    'My text styles',
  ]);
  await expect(host.locator('[data-action="magic-write"]')).toHaveAttribute(
    'title',
    'Needs the AI service (planned)',
  );
  // Dynamic text is live since Phase 0 (TXT-037, D-313): its field cards work.
  await expect(
    host.locator('[data-action="dynamic-text"]').first(),
  ).not.toHaveAttribute('aria-disabled', 'true');
});

// C6: Review video plan is readable, and AI > Video plans reopens it.
test('[FX5-006] Review video plan: a summary and one card per scene that fit the panel; AI > Video plans reopens it after leaving', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await showCategory(page, 'AI');
  // No plan yet: no Video plans section.
  await expect(page.locator('#library-ai .ai-video-plans')).toBeHidden();
  await page.locator('#library-ai #ai-import').click();
  await page
    .locator('#ai-import-source')
    .fill(readFileSync('docs/samples/plan-en-honey.json', 'utf8'));
  await page.locator('[data-action="build-video"]').click();
  await expect(
    page.locator('.toast', { hasText: 'Built 3 scenes' }),
  ).toBeVisible();
  await page.locator('#plan-review').click();
  const review = page.locator('.plan-review');
  await expect(review.locator('.plan-review-summary')).toContainText(
    '3 scenes',
  );
  await expect(review.locator('details.plan-scene')).toHaveCount(3);
  // Nothing is cut off: no sideways overflow, every scene card inside the panel.
  const fits = await page.evaluate(() => {
    const root = document.querySelector('.plan-review') as HTMLElement;
    const frame = root.getBoundingClientRect();
    const scroller = root.closest('.side-panel-host') as HTMLElement | null;
    return {
      overflow: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      outside: [...root.querySelectorAll('.plan-scene, .plan-layer')].filter(
        (el) => el.getBoundingClientRect().right > frame.right + 1,
      ).length,
    };
  });
  expect(fits.overflow).toBeLessThanOrEqual(1);
  expect(fits.outside).toBe(0);
  // A scene card collapses.
  const first = review.locator('details.plan-scene').first();
  await first.locator('summary').click();
  await expect(first).not.toHaveAttribute('open', '');
  await page.screenshot({ path: 'reports/fix5/c6-review.png' });
  // Leave to Media; come back through AI > Video plans.
  await showCategory(page, 'Media');
  await expect(review).toBeHidden();
  await showCategory(page, 'AI');
  const card = page.locator('#library-ai .ai-video-plan');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Where honey comes from');
  await card.locator('[data-action="plan-open-review"]').click();
  await expect(page.locator('.plan-review')).toBeVisible();
});

// C7: the first Play press starts picture and sound together.
test('[FX5-007] first Play press: waits for the sound to decode (Preparing audio), then picture and sound start together; no console warnings', async ({
  page,
  openFixtureProject,
}) => {
  test.setTimeout(120_000);
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('av-sync.json');
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles([
    'tests/fixtures/media/video_av_sync_flash_beep_720p.webm',
    'tests/fixtures/media/audio_tone_440hz_3s.wav',
  ]);
  await expect(page.locator('#media-import')).toBeHidden();
  // A fresh session where decoding the sound takes a while (a big file).
  await page.addInitScript(() => {
    const original = OfflineAudioContext.prototype.decodeAudioData;
    OfflineAudioContext.prototype.decodeAudioData = function (
      this: OfflineAudioContext,
      ...args: [ArrayBuffer]
    ) {
      return new Promise((resolve, reject) =>
        setTimeout(
          () => original.apply(this, args).then(resolve, reject),
          1200,
        ),
      ) as never;
    } as never;
  });
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  const media = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: {
              getMedia(): { audio: { state: string; sources: unknown[] } };
              getSession(): { playing: boolean };
            };
          }
        ).__AIVE__.getMedia().audio,
    );
  await page.locator('[data-action="play"]').click();
  // Not a dead button: it says what it waits for, and nothing half-plays.
  await expect(page.locator('[data-action="play"]')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect((await hook(page)).session.playing).toBe(false);
  await expect(
    page.locator('.toast', { hasText: 'Preparing audio' }),
  ).toBeVisible();
  // One press later, picture and sound run together.
  await expect.poll(async () => (await hook(page)).session.playing).toBe(true);
  await expect
    .poll(async () => (await media()).sources.length, { timeout: 2000 })
    .toBeGreaterThan(0);
  expect((await media()).state).toBe('running');
  await page.locator('[data-action="play"]').click();
  expect(
    warnings.filter((text) => /AudioContext|autoplay/i.test(text)),
  ).toEqual([]);
});

// C8: the blend mode list: unique labels, a menu no taller than 60 % of the window.
test('[FX5-008][MSK-002] Adjust colors blend mode: each mode once, grouped, and the open menu stays within 60 % of the window', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles(['tests/fixtures/media/image_testsrc_1200x800.jpg']);
  await expect(page.locator('#media-import')).toBeHidden();
  const card = page.locator(
    '.media-item:has(.media-card[data-name="image_testsrc_1200x800.jpg"])',
  );
  await card.locator('.media-card').click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  await openRight(page, 'Adjust');
  await page.locator('#right-blend-mode').click();
  const list = page.locator('.select-popover .select-list');
  await expect(list).toBeVisible();
  const labels = await list
    .locator('.select-option')
    .evaluateAll((items) => items.map((item) => item.textContent!.trim()));
  expect(labels).toHaveLength(16);
  expect(new Set(labels).size).toBe(16);
  // A group heading never repeats an item's own name.
  const headings = await list
    .locator('.select-group')
    .evaluateAll((items) => items.map((item) => item.textContent!.trim()));
  expect(headings.length).toBeGreaterThan(3);
  for (const heading of headings) expect(labels).not.toContain(heading);
  const box = await page.locator('.select-popover').boundingBox();
  const height = page.viewportSize()!.height;
  expect(box!.height).toBeLessThanOrEqual(height * 0.6 + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height);
  await page.screenshot({ path: 'reports/fix5/c8-blend.png' });
});

// C10: the Audio panel's tabs, heading and search never overlap or leave the panel.
test('[FX5-010] Audio panel: tabs, heading, search and first sound do not overlap and stay inside the panel', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Audio');
  await expect(
    page.locator('#library-audio .sound-tile').first(),
  ).toBeVisible();
  const boxes = await page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r
        ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
        : null;
    };
    return {
      tabs: box('#library-audio .audio-library-tabs'),
      heading: box('#library-audio .sound-pack-title'),
      search: box('#library-audio .sound-pack-search'),
      first: box('#library-audio .sound-tile'),
      panel: box('.library'),
    };
  });
  const { tabs, heading, search, first, panel } = boxes;
  expect(tabs && heading && search && first && panel).toBeTruthy();
  expect(tabs!.bottom - tabs!.top).toBeGreaterThan(24);
  expect(tabs!.bottom).toBeLessThanOrEqual(heading!.top + 1);
  expect(heading!.bottom).toBeLessThanOrEqual(search!.top + 1);
  expect(search!.bottom).toBeLessThanOrEqual(first!.top + 1);
  expect(search!.right).toBeLessThanOrEqual(panel!.right);
  expect(first!.right).toBeLessThanOrEqual(panel!.right);
});
