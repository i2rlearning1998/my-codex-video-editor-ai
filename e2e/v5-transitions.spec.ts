import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  showSceneStrip,
  seekKeep,
  settled,
} from './fixtures';
import {
  contactSheet,
  exported,
  meanDiff,
  preview,
  spread,
} from './fx-helpers';

// V5 (Clipchamp clone spec 6): a "+" on a cut between two touching clips
// adds Fade through black; the cut then shows a lavender marker over a band
// as wide as the transition. The marker opens the right Transition panel
// (None, Fades & blurs, Tiles, Wipes, More) with Duration under the chosen
// tile; the left Transitions category applies to the selected marker.
// Delete or the marker's menu removes it. The canvas and the PNG export draw
// it the same.
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const PNG = 'image_gradient_1920x1080.png';
const ZOOM = 80;

const panel = (page: Page) => page.locator('#right-section');
const tileOf = (page: Page, key: string) =>
  panel(page).locator(`.fx-tile[data-tile="${key}"]`);
const labels = async (page: Page) => (await hook(page)).history.labels;
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const clipOf = async (page: Page, layerId: string) =>
  (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.layerId === layerId)!;
const transitionOf = async (page: Page, layerId: string) =>
  (
    (await clipOf(page, layerId)).transitionMetadata as {
      in?: { type: string; duration: number };
    }
  ).in ?? null;

/** A blank scene with two pictures touching at 5 s on one lane. */
async function twoPictures(page: Page) {
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
  await (
    await chooser
  ).setFiles([JPG, PNG].map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
  const add = async (name: string) => {
    await page
      .locator(`.media-item:has(.media-card[data-name="${name}"]) .media-card`)
      .click({ button: 'right' });
    await page.locator('#media-menu [data-action="media-add"]').click();
    return (await hook(page)).session.selectedIds[0]!;
  };
  const first = await add(JPG);
  await seekKeep(page, 5);
  const second = await add(PNG);
  // One lane, touching at 5 s.
  const a = await clipOf(page, first),
    b = await clipOf(page, second);
  expect(a.startTime + a.duration).toBeCloseTo(5, 6);
  expect(b.startTime).toBeCloseTo(5, 6);
  return { first, second, clip: b.id };
}
const plus = (page: Page, clipId: string) =>
  page.locator(`#timeline-foundation .transition-add[data-id="${clipId}"]`);
const marker = (page: Page, clipId: string) =>
  page.locator(`#timeline-foundation .transition-chip[data-id="${clipId}"]`);
const band = (page: Page, clipId: string) =>
  page.locator(`#timeline-foundation .transition-band[data-id="${clipId}"]`);

test('[TR-013] a "+" on the cut adds Fade through black; the marker and its band; the right panel swaps it, sets its duration and None removes it; Delete and the menu remove it; one step each', async ({
  page,
}) => {
  const { first, second, clip } = await twoPictures(page);
  const before = [await clipOf(page, first), await clipOf(page, second)];
  // The "+" shows only with the pointer near the cut; its tooltip.
  const add = plus(page, clip);
  await expect(add).toHaveAttribute('title', 'Add transition');
  const box = (await add.boundingBox())!;
  const glyph = add.locator('svg');
  await page.mouse.move(box.x + box.width / 2, box.y - 40);
  await expect
    .poll(() => glyph.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2);
  await expect
    .poll(() => glyph.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await add.click();
  expect((await labels(page)).at(-1)).toBe('Add transition');
  expect(await transitionOf(page, second)).toEqual({
    type: 'fade-black',
    duration: 1,
  });
  // Clips are not moved or shortened.
  expect(
    [await clipOf(page, first), await clipOf(page, second)].map((item) => [
      item.startTime,
      item.duration,
    ]),
  ).toEqual(before.map((item) => [item.startTime, item.duration]));
  // The marker over a band one second wide, centred on the cut.
  await expect(marker(page, clip)).toBeVisible();
  const bandBox = (await band(page, clip).boundingBox())!;
  const markerBox = (await marker(page, clip).boundingBox())!;
  expect(Math.abs(bandBox.width - ZOOM)).toBeLessThan(2);
  expect(
    Math.abs(
      bandBox.x + bandBox.width / 2 - (markerBox.x + markerBox.width / 2),
    ),
  ).toBeLessThan(2);
  // The right panel shows the Transition section with the tile chosen.
  await settled(page);
  await expect(
    page.locator('#rail-right [data-section="Transitions"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(tileOf(page, 'none')).toBeVisible();
  await expect(tileOf(page, 'fade-black')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(panel(page).locator('.fx-tiles-group').first()).toHaveText(
    'Fades & blurs',
  );
  // Swap to Cross fade (one step).
  await tileOf(page, 'crossfade').click();
  expect((await labels(page)).at(-1)).toBe('Change transition');
  expect((await transitionOf(page, second))!.type).toBe('crossfade');
  // Duration under the tile's row; the band follows it.
  const duration = panel(page).locator('#transition-duration');
  await duration.fill('2');
  await duration.press('Enter');
  expect((await labels(page)).at(-1)).toBe('Transition duration');
  await expect
    .poll(async () => (await band(page, clip).boundingBox())!.width)
    .toBeCloseTo(2 * ZOOM, 0);
  // None removes it; Undo brings it back.
  await tileOf(page, 'none').click();
  expect((await labels(page)).at(-1)).toBe('Remove transition');
  expect(await transitionOf(page, second)).toBeNull();
  await page.locator('#undo').click();
  expect((await transitionOf(page, second))!.type).toBe('crossfade');
  // Delete on the focused marker removes it (the clips stay).
  await marker(page, clip).click();
  await marker(page, clip).focus();
  await page.keyboard.press('Delete');
  expect(await transitionOf(page, second)).toBeNull();
  expect((await scene(page)).layers.map((layer) => layer.id)).toContain(second);
  await page.locator('#undo').click();
  // The marker's menu: Remove transition.
  await marker(page, clip).click({ button: 'right' });
  await page
    .locator(
      '#timeline-foundation .timeline-menu [data-action="transition-remove"]',
    )
    .click();
  expect(await transitionOf(page, second)).toBeNull();
  expect((await labels(page)).at(-1)).toBe('Remove transition');
});

test('[TR-014] the canvas and the exported frame show the transition at its midpoint: through black is black, through white is white', async ({
  page,
}, testInfo) => {
  const { clip } = await twoPictures(page);
  // (The artboard is found where the paper shows, on the first picture.)
  await seekKeep(page, 1);
  await settled(page);
  await preview(page, true);
  await plus(page, clip).click();
  await seekKeep(page, 5);
  const black = await preview(page);
  expect(Math.max(...black)).toBeLessThan(12);
  expect(Math.max(...(await exported(page, testInfo)))).toBeLessThan(12);
  await tileOf(page, 'fade-white').click();
  const white = await preview(page);
  // (Near white everywhere: the pictures are gone, nothing but the veil.)
  expect(Math.min(...white)).toBeGreaterThan(230);
  expect(spread(white)).toBeLessThan(6);
  const whiteFile = await exported(page, testInfo);
  expect(Math.min(...whiteFile)).toBeGreaterThan(230);
  expect(spread(whiteFile)).toBeLessThan(6);
  // A quarter in, the outgoing picture shows through.
  await seekKeep(page, 4.75);
  expect(spread(await preview(page))).toBeGreaterThan(5);
});

test('[TR-015] the left Transitions category shows the same tiles; a tile applies to the selected marker', async ({
  page,
}) => {
  const { second, clip } = await twoPictures(page);
  await showCategory(page, 'Transitions');
  const left = page.locator('#library-transitions');
  // Nothing selected on the timeline: a hint, nothing changes.
  await left.locator('.fx-tile[data-tile="transition.tiles"]').click();
  await expect(page.locator('.toast').last()).toContainText('Select a cut');
  expect(await transitionOf(page, second)).toBeNull();
  await plus(page, clip).click();
  await left.locator('.fx-tile[data-tile="transition.tiles"]').click();
  expect((await transitionOf(page, second))!.type).toBe('transition.tiles');
  expect((await labels(page)).at(-1)).toBe('Change transition');
});

test('[TR-016] sweep: every transition changes the canvas and the exported frame inside its window and neither is blank; contact sheet', async ({
  page,
}, testInfo) => {
  test.setTimeout(480_000);
  const { clip } = await twoPictures(page);
  await seekKeep(page, 4.8);
  const plainPreview = await preview(page, true);
  const plainExport = await exported(page, testInfo);
  await plus(page, clip).click();
  await seekKeep(page, 4.8);
  await contactSheet(page, testInfo, 'contact-transitions');
  const keys = (
    await panel(page)
      .locator('.fx-tile')
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset.tile!),
      )
  ).filter((key) => key !== 'none');
  expect(keys).toHaveLength(28);
  const failures: string[] = [];
  for (const key of keys) {
    await tileOf(page, key).click();
    const shown = await preview(page);
    const file = await exported(page, testInfo);
    const problems = [
      meanDiff(shown, plainPreview) <= 0.5 && 'preview unchanged',
      spread(shown) <= 1 && 'preview blank',
      meanDiff(file, plainExport) <= 0.5 && 'export unchanged',
      spread(file) <= 1 && 'export blank',
    ].filter(Boolean);
    if (problems.length) failures.push(`${key}: ${problems.join(', ')}`);
  }
  expect(failures).toEqual([]);
});
