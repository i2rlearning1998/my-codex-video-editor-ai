import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  contactSheet,
  exported,
  meanDiff,
  preview,
  spread,
} from './fx-helpers';
import {
  test,
  expect,
  hook,
  showCategory,
  showSceneStrip,
  seekKeep,
  settled,
} from './fixtures';

// V4 (Clipchamp clone spec 5): Filters and Effects are tile grids whose
// thumbnails show the selected picture through the real FX library. Hover
// animates a tile, never the canvas; a click applies (one undo step); the
// settings open under the tile's row. The sweep applies every filter and
// every effect to a picture and checks the canvas and the exported PNG
// frame both change and are not blank; a contact sheet of every tile is
// written for review.
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';

const panel = (page: Page) => page.locator('#right-section');
const tab = (page: Page, name: string) =>
  page.locator(`#rail-right [data-section="${name}"]`);
const tiles = (page: Page) => panel(page).locator('.fx-tile');
const tileOf = (page: Page, key: string) =>
  panel(page).locator(`.fx-tile[data-tile="${key}"]`);
const labels = async (page: Page) => (await hook(page)).history.labels;
const fxOf = async (page: Page, layerId: string) => {
  const state = await hook(page);
  const scene = state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
  return (
    scene.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.layerId === layerId)!.metadata as {
      fx?: { stack: { id: string; params: Record<string, unknown> }[] };
    }
  ).fx;
};

/** A blank scene with one picture, selected, at 1.3 s. */
async function onePicture(page: Page) {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles([path.join(MEDIA, JPG)]);
  await expect(page.locator('#media-import')).toBeHidden();
  await page
    .locator(`.media-item:has(.media-card[data-name="${JPG}"]) .media-card`)
    .click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  const id = (await hook(page)).session.selectedIds[0]!;
  await seekKeep(page, 1.3);
  await settled(page);
  return id;
}

test('[FX-016] Filters: a 3-column tile grid with a sticky search and None first; thumbnails of the picture; hover leaves the canvas; a click applies one step and opens Intensity under its row', async ({
  page,
}) => {
  const id = await onePicture(page);
  await preview(page, true);
  await tab(page, 'Filters').click();
  const grid = panel(page).locator('.fx-tiles-grid');
  await expect(grid).toBeVisible();
  // None first and selected; 49 named filters.
  await expect(tiles(page).first()).toHaveAttribute('data-tile', 'none');
  await expect(tiles(page).first()).toHaveAttribute('aria-selected', 'true');
  await expect(tiles(page)).toHaveCount(50);
  // Three columns of 80 px tiles.
  const boxes = await Promise.all(
    [1, 2, 3].map(async (n) => (await tiles(page).nth(n).boundingBox())!),
  );
  expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(1);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + 50);
  expect(Math.round(boxes[0]!.width)).toBe(80);
  // Thumbnails of the picture arrive (visible tiles only, lazily).
  await expect
    .poll(() =>
      tileOf(page, 'retro')
        .locator('img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(160);
  // Hover changes nothing on the canvas.
  const before = await preview(page);
  await tileOf(page, 'retro').hover();
  expect(meanDiff(await preview(page), before)).toBe(0);
  // A click applies the filter: one step, the canvas changes.
  await tileOf(page, 'retro').click();
  expect((await labels(page)).at(-1)).toBe('Apply filter');
  expect((await fxOf(page, id))!.stack[0]!.params.preset).toBe('retro');
  expect(meanDiff(await preview(page), before)).toBeGreaterThan(1);
  await expect(tileOf(page, 'retro')).toHaveAttribute('aria-selected', 'true');
  // Intensity opens under the tile's row: after its row's last tile.
  const settings = panel(page).locator('.fx-tiles-settings');
  await expect(settings).toBeVisible();
  const settingsBox = (await settings.boundingBox())!;
  const retroBox = (await tileOf(page, 'retro').boundingBox())!;
  expect(settingsBox.y).toBeGreaterThan(retroBox.y + retroBox.height - 1);
  const next = (await tiles(page).nth(3).boundingBox())!;
  expect(next.y).toBeGreaterThan(settingsBox.y);
  // Intensity 0 is the original picture.
  const slider = panel(page).locator('#right-filter-intensity');
  await slider.fill('0');
  await slider.dispatchEvent('change');
  expect((await labels(page)).at(-1)).toBe('Filter intensity');
  await expect.poll(async () => meanDiff(await preview(page), before)).toBe(0);
  // Search filters the tiles; the box stays at the top while scrolling.
  const search = panel(page).locator('.fx-tiles-search');
  await search.fill('overlay');
  await expect(tiles(page)).toHaveCount(10);
  await search.fill('');
  await panel(page).evaluate((host) => (host.scrollTop = 600));
  const searchBox = (await search.boundingBox())!;
  const panelBox = (await panel(page).boundingBox())!;
  expect(searchBox.y).toBeGreaterThanOrEqual(panelBox.y - 1);
  expect(searchBox.y).toBeLessThan(panelBox.y + 60);
  // Undo twice: no filter.
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  expect((await fxOf(page, id)) ?? null).toBeNull();
});

test('[FX-017] Effects: several at once, a click toggles one, None clears all; a selected effect shows its own settings; hovering animates the tile but not the canvas', async ({
  page,
}) => {
  const id = await onePicture(page);
  await preview(page, true);
  await tab(page, 'Effects').click();
  await expect(tiles(page).first()).toHaveAttribute('data-tile', 'none');
  // The library's extra item sits under More, at the end.
  await expect(panel(page).locator('.fx-tiles-group')).toHaveText('More');
  // Hover animates the thumbnail; the canvas stays.
  const spin = tileOf(page, 'effect.disco');
  await spin.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      spin
        .locator('img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(160);
  const canvas = await preview(page);
  await spin.hover();
  const seen = new Set<string>();
  await expect
    .poll(
      async () => {
        seen.add(
          await spin
            .locator('img')
            .evaluate((image: HTMLImageElement) => image.src.slice(-80)),
        );
        return seen.size;
      },
      { intervals: [60] },
    )
    .toBeGreaterThan(2);
  expect(meanDiff(await preview(page), canvas)).toBe(0);
  // Two effects at once.
  await tileOf(page, 'effect.blur').click();
  await tileOf(page, 'effect.vhs').click();
  expect((await fxOf(page, id))!.stack.map((item) => item.id)).toEqual([
    'effect.blur',
    'effect.vhs',
  ]);
  await expect(tileOf(page, 'effect.blur')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The last clicked shows its settings (VHS: noise, speed, intensity).
  await expect(panel(page).locator('#right-fx-effect-vhs-noise')).toBeVisible();
  await tileOf(page, 'effect.blur').click(); // toggles off
  expect((await fxOf(page, id))!.stack.map((item) => item.id)).toEqual([
    'effect.vhs',
  ]);
  expect((await labels(page)).at(-1)).toBe('Remove effect');
  // A setting is one step.
  const radius = panel(page).locator('#right-fx-effect-vhs-noise');
  await radius.fill('40');
  await radius.press('Enter');
  expect((await labels(page)).at(-1)).toBe('Effect settings');
  expect((await fxOf(page, id))!.stack[0]!.params.noise).toBe(40);
  // None clears every effect.
  await tileOf(page, 'none').click();
  expect((await fxOf(page, id))?.stack ?? []).toEqual([]);
  expect((await labels(page)).at(-1)).toBe('Remove effects');
});

for (const kind of ['Filters', 'Effects'] as const)
  test(`[FX-018] sweep: every ${kind === 'Filters' ? 'filter' : 'effect'} tile changes the preview and the exported PNG frame and neither is blank; contact sheet`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(480_000);
    await onePicture(page);
    await tab(page, kind).click();
    const plainPreview = await preview(page, true);
    const plainExport = await exported(page, testInfo);
    expect(spread(plainPreview)).toBeGreaterThan(10);
    // The plain picture near the clip's end too (a still picture: the same).
    await seekKeep(page, 4.6);
    const latePreview: number[] | null = await preview(page);
    const lateExport: number[] | null = await exported(page, testInfo);
    await seekKeep(page, 1.3);
    await contactSheet(page, testInfo, `contact-${kind.toLowerCase()}`);
    const keys = await tiles(page).evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.tile!),
    );
    const failures: string[] = [];
    for (const key of keys.filter((item) => item !== 'none')) {
      await tileOf(page, key).click();
      // The test picture has white but no black: remove white.
      if (key === 'effect.black-white-removal') {
        await panel(page)
          .locator('#right-fx-effect-black-white-removal-color')
          .click();
        await page.getByRole('option', { name: 'White', exact: true }).click();
        // Near-white paper shows through where white goes: remove more of
        // the light colours, so the removal shows.
        const threshold = panel(page).locator(
          '#right-fx-effect-black-white-removal-threshold',
        );
        await threshold.fill('80');
        await threshold.press('Enter');
      }
      let shown = await preview(page);
      // Some effects build up over the clip (Crash zoom hits at its end):
      // an unchanged frame at 1.3 s is checked again near the end.
      const late = meanDiff(shown, plainPreview) <= 0.5;
      if (late) {
        await seekKeep(page, 4.6);
        shown = await preview(page);
      }
      const file = await exported(page, testInfo);
      const plainFile = late ? lateExport! : plainExport;
      const problems = [
        meanDiff(shown, late ? latePreview! : plainPreview) <= 0.5 &&
          'preview unchanged',
        spread(shown) <= 1 && 'preview blank',
        meanDiff(file, plainFile) <= 0.5 && 'export unchanged',
        spread(file) <= 1 && 'export blank',
      ].filter(Boolean);
      if (problems.length) failures.push(`${key}: ${problems.join(', ')}`);
      // Back to the plain picture (Effects toggle; Filters choose None).
      await tileOf(page, kind === 'Effects' ? key : 'none').click();
      if (late) await seekKeep(page, 1.3);
    }
    expect(failures).toEqual([]);
  });
