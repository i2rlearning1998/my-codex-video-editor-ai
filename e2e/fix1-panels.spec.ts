import type { Page } from '@playwright/test';
import { test, expect, showCategory } from './fixtures';

// FIX1 F1: every left panel, right panel and icon rail scrolls, so its last
// control can always be reached; library shelves keep their chips fixed; the
// selection's action cluster never covers the floating toolbar. Runs at the
// default 1920 × 940 and in the laptop-1366 project at 1366 × 768.
const MEDIA = 'tests/fixtures/media/';
const ready = (page: Page) =>
  expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);

/** Controls clipped by an ancestor the user cannot scroll (static check). */
const unreachable = (page: Page, root: string) =>
  page.evaluate((root) => {
    const host = document.querySelector<HTMLElement>(root)!;
    const out: string[] = [];
    const ancestors = (el: HTMLElement) => {
      const list: HTMLElement[] = [];
      for (let a = el.parentElement; a; a = a.parentElement) list.push(a);
      return list;
    };
    for (const el of host.querySelectorAll<HTMLElement>(
      'button,input,select,textarea,[role="slider"]',
    )) {
      if (el.offsetParent === null || !el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 2 || r.width < 2) continue;
      for (const a of ancestors(el)) {
        const style = getComputedStyle(a);
        if (style.overflowY === 'visible') continue;
        const box = a.getBoundingClientRect();
        if (r.bottom <= box.bottom + 1 && r.top >= box.top - 1) continue;
        const scrolls =
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          a.scrollHeight > a.clientHeight;
        if (!scrolls)
          out.push(
            `${(el.textContent || el.getAttribute('aria-label') || el.id).trim().slice(0, 40)} clipped by ${a.id || a.className}`,
          );
        break;
      }
    }
    return out;
  }, root);

/** Wheels over `root` until nothing scrolls, then checks its last control. */
async function lastControlVisible(page: Page, root: string) {
  const panel = page.locator(root);
  const box = (await panel.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
  let before = '';
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 800);
    const now = await page.evaluate(
      (root) =>
        [...document.querySelectorAll(`${root}, ${root} *`)]
          .map((el) => el.scrollTop)
          .join(','),
      root,
    );
    if (now === before) break;
    before = now;
  }
  return page.evaluate((root) => {
    const host = document.querySelector<HTMLElement>(root)!;
    const area = host.getBoundingClientRect();
    const controls = [
      ...host.querySelectorAll<HTMLElement>('button,input,select,textarea'),
    ].filter(
      (el) =>
        el.offsetParent !== null &&
        el.checkVisibility() &&
        el.getBoundingClientRect().height > 2 &&
        !el.closest('.panel-header, .right-panel-header'),
    );
    if (!controls.length) return 'no controls';
    const last = controls.reduce((a, b) =>
      b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom
        ? b
        : a,
    );
    const r = last.getBoundingClientRect();
    if (r.bottom > Math.min(area.bottom, innerHeight) + 1)
      return `last control "${(last.textContent || last.id).trim().slice(0, 30)}" ends at ${Math.round(r.bottom)} below ${Math.round(Math.min(area.bottom, innerHeight))}`;
    const hit = document.elementFromPoint(
      r.left + Math.min(8, r.width / 2),
      r.top + r.height / 2,
    );
    if (!hit || !(last.contains(hit) || hit.contains(last)))
      return `last control "${(last.textContent || last.id).trim().slice(0, 30)}" is covered by ${hit?.className}`;
    return 'ok';
  }, root);
}

async function openLeft(page: Page, name: string) {
  const button = page.locator(`#rail-left [data-category="${name}"]`);
  if (await button.isVisible()) return showCategory(page, name);
  await page.locator('#rail-more').click();
  await page.locator(`[data-more-category="${name}"]`).click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

async function rightSections(page: Page, label: string) {
  const sections = await page
    .locator('#rail-right [data-section]')
    .evaluateAll((els) =>
      els
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => el.getAttribute('aria-disabled') !== 'true')
        .map((el) => el.getAttribute('data-section')!)
        .sort((a, b) => Number(b === 'Captions') - Number(a === 'Captions')),
    );
  for (const section of sections) {
    const button = page.locator(`#rail-right [data-section="${section}"]`);
    // With nothing selected, opening Project audio or Theme keeps only those
    // two on the rail (Auto Caption opens a dialog, checked before them).
    if (!(await button.isVisible())) continue;
    await button.scrollIntoViewIfNeeded();
    if ((await button.getAttribute('aria-pressed')) !== 'true')
      await button.click();
    // Captions with nothing selected opens its dialog; close it.
    if (await page.locator('.modal-backdrop').count()) {
      await page.keyboard.press('Escape');
      await expect(page.locator('.modal-backdrop')).toHaveCount(0);
      continue;
    }
    await expect(
      page.locator('.editor-shell'),
      `${label} ${section}`,
    ).not.toHaveClass(/inspector-collapsed/);
    expect(
      await unreachable(page, '#inspector-panel'),
      `${label} ${section}`,
    ).toEqual([]);
    expect(
      await lastControlVisible(page, '#inspector-panel'),
      `${label} ${section}`,
    ).toBe('ok');
  }
}

async function railEnd(page: Page) {
  const last = page.locator('#rail-right [data-section]:visible').last();
  const rail = (await page.locator('#rail-right').boundingBox())!;
  await page.mouse.move(rail.x + rail.width / 2, rail.y + rail.height / 2);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 600);
  const box = (await last.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(rail.y + rail.height + 1);
  await expect(last).toBeInViewport({ ratio: 1 });
  await last.click();
}

test('[FX1-001] every left panel, right panel and icon rail scrolls to its last control; the right rail last icon is reachable', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await ready(page);
  await showCategory(page, 'Media');
  await page
    .locator('#import-media-input')
    .setInputFiles([
      MEDIA + 'video_av_sync_flash_beep_720p.webm',
      MEDIA + 'image_testsrc_1200x800.jpg',
      MEDIA + 'image_alpha_logo_512.png',
      MEDIA + 'audio_tone_440hz_3s.ogg',
    ]);
  await expect(page.locator('#media-panel .shelf-item')).toHaveCount(4);
  await page.evaluate(() =>
    document.querySelectorAll('.toast').forEach((toast) => toast.remove()),
  );
  const categories = await page
    .locator('#rail-left [data-category]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-category')!));
  for (const category of categories) {
    if (category === 'Draw') continue;
    await openLeft(page, category);
    expect(await unreachable(page, '#library-panel'), category).toEqual([]);
    expect(await lastControlVisible(page, '#library-panel'), category).toBe(
      'ok',
    );
  }
  expect(await unreachable(page, '#rail-left'), 'left rail').toEqual([]);
  // Nothing selected, then a video clip, then an audio clip.
  await rightSections(page, 'nothing selected');
  await openLeft(page, 'Media');
  await page.locator('#media-panel .shelf-item').first().dblclick();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __AIVE__: { getSession(): { selectedIds: string[] } };
            }
          ).__AIVE__.getSession().selectedIds.length,
      ),
    )
    .toBe(1);
  await railEnd(page);
  await page.keyboard.press('Escape');
  await rightSections(page, 'video');
  await openLeft(page, 'Audio');
  await page
    .locator('#library-audio [data-action="sound-add"]')
    .first()
    .click();
  await page
    .locator('.timeline-clip')
    .last()
    .click({ position: { x: 8, y: 6 } });
  await rightSections(page, 'audio');
});

test('[FX1-002] Media keeps search, Import, drop zone and chips fixed while the cards scroll; the action cluster never covers the floating toolbar', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await showCategory(page, 'Media');
  const files = [
    'image_alpha_logo_512.png',
    'image_animated_320x240.gif',
    'image_exif_orientation6_1600x1200.jpg',
    'image_gradient_1920x1080.png',
    'image_testsrc_1200x800.jpg',
    'image_testsrc_800x600.webp',
    'image_vector_logo.svg',
    'audio_tone_440hz_3s.ogg',
    'audio_tone_440hz_3s.wav',
    'video_av_sync_flash_beep_720p.webm',
  ].map((name) => MEDIA + name);
  await page.locator('#import-media-input').setInputFiles(files);
  await expect(page.locator('#media-panel .shelf-item')).toHaveCount(
    files.length,
    { timeout: 20_000 },
  );
  const chips = page.locator('#media-tabs');
  const search = page.locator('#asset-search');
  const before = (await chips.boundingBox())!;
  const searchBefore = (await search.boundingBox())!;
  const body = page.locator('#media-body');
  const short = (page.viewportSize()?.height ?? 940) <= 820;
  await expect(body).toHaveCSS('overflow-y', short ? 'visible' : 'auto');
  const grid = (await body.boundingBox())!;
  await page.mouse.move(grid.x + grid.width / 2, grid.y + grid.height / 2);
  await page.mouse.wheel(0, 2000);
  if (!short) expect((await chips.boundingBox())!.y).toBeCloseTo(before.y, 0);
  // Short windows scroll the whole shelf and pin only the chips.
  if (!short)
    expect((await search.boundingBox())!.y).toBeCloseTo(searchBefore.y, 0);
  else
    expect((await chips.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await page.locator('#library-panel').boundingBox())!.y - 1,
    );
  // No card paints over the chips: the chip's centre hits the chip.
  const hit = await page.evaluate(() => {
    const chip = document.querySelector('#media-tabs [role="tab"]')!;
    const r = chip.getBoundingClientRect();
    const el = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return !!el && chip.contains(el);
  });
  expect(hit).toBe(true);
  if (!short)
    expect(grid.y).toBeGreaterThanOrEqual(before.y + before.height - 1);
  // Select the video on the canvas: the cluster and the toolbar never meet.
  await page
    .locator('#media-panel .media-item', { hasText: 'video_av_sync' })
    .dblclick();
  const toolbar = page.locator('#context-toolbar');
  const cluster = page.locator('#selection-actions');
  await expect(toolbar).toBeVisible();
  await expect(cluster).toBeVisible();
  for (const zoom of ['fit', 'in', 'in', 'in', 'out', 'actual']) {
    await page.locator(`[data-canvas-zoom="${zoom}"]`).click();
    if (!(await cluster.isVisible())) continue;
    const a = (await toolbar.boundingBox())!;
    const b = (await cluster.boundingBox())!;
    const overlap =
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    expect(overlap, `zoom ${zoom}`).toBe(false);
  }
  await page.screenshot({
    path: `reports/fix1/f1-panels-${test.info().project.name}.png`,
  });
});
