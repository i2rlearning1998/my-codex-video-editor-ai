import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect, hook, showCategory, showSceneStrip } from './fixtures';

// T-ALL P2 (spec 1-3): lanes take any kind, a new lane opens above,
// between or below; the empty state and the ghost lanes; the playhead on top.
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const WAV = 'audio_tone_440hz_3s.wav';
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const lanes = async (page: Page) =>
  [...(await scene(page)).tracks].sort((a, b) => a.order - b.order);
const rows = (page: Page) =>
  page.locator('#timeline-foundation .timeline-nle-row');

async function blankScene(page: Page) {
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await expect.poll(async () => (await scene(page)).layers.length).toBe(0);
}
async function importMedia(page: Page, ...names: string[]) {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(names.map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
}
async function stable(from: Locator) {
  let last = '';
  let box = null as Awaited<ReturnType<Locator['boundingBox']>>;
  await expect
    .poll(async () => {
      box = await from.boundingBox();
      const now = JSON.stringify(box);
      const same = now === last;
      last = now;
      return same && !!box;
    })
    .toBe(true);
  return box!;
}
/** A source for each kind: a library card or a Media card. */
async function source(page: Page, kind: string) {
  if (kind === 'shape') {
    await showCategory(page, 'Elements');
    return page.locator('[data-shape="rectangle"]').first();
  }
  if (kind === 'text') {
    await showCategory(page, 'Text');
    return page.locator('.library-card[data-item-id="text-1"]').first();
  }
  await showCategory(page, 'Media');
  return page.locator(`.media-card[data-name="${kind}"]`);
}
async function dragTo(page: Page, from: Locator, x: number, y: number) {
  const box = await stable(from);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, {
    steps: 2,
  });
  await page.mouse.move(x, y, { steps: 8 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await blankScene(page);
});

test('[TL-088] an empty scene shows one drop lane and no ruler or playhead; one lane shows ghost lanes; two lanes hide them', async ({
  page,
}) => {
  const drop = page.locator('#timeline-foundation .timeline-empty-drop');
  await expect(drop).toBeVisible();
  await expect(drop).toContainText('Drag & drop media here');
  await expect(
    page.locator('#timeline-foundation .timeline-playhead'),
  ).toBeHidden();
  await expect(
    page.locator('#timeline-foundation .timeline-ruler-bar'),
  ).toBeHidden();
  await expect(
    page.locator('#timeline-foundation [data-action="play"]'),
  ).toBeDisabled();
  await expect(page.locator('#timeline-foundation .timeline-hint')).toHaveCount(
    0,
  );
  // A shape dragged over the empty lane: the hint gives way to a "+".
  const card = await source(page, 'shape');
  const target = await stable(drop);
  await dragTo(page, card, target.x + 80, target.y + target.height / 2);
  await expect(drop.locator('.empty-drop-plus')).toBeVisible();
  await expect(drop).toHaveClass(/ghost-target/);
  await page.mouse.up();
  await expect.poll(async () => (await lanes(page)).length).toBe(1);
  // One lane: ghost lanes for text above and audio below.
  const above = page.locator('.timeline-ghost-lane[data-ghost="above"]');
  const below = page.locator('.timeline-ghost-lane[data-ghost="below"]');
  await expect(above).toContainText('Add text');
  await expect(below).toContainText('Add audio');
  await expect(
    page.locator('#timeline-foundation .timeline-playhead'),
  ).toBeVisible();
  // An image dropped on the "Add audio" ghost lane opens a lane below.
  await importMedia(page, JPG);
  const image = await source(page, JPG);
  const slot = await stable(below);
  await dragTo(page, image, slot.x + 100, slot.y + slot.height / 2);
  await expect(below).toHaveClass(/ghost-target/);
  await page.mouse.up();
  await expect.poll(async () => (await lanes(page)).length).toBe(2);
  expect((await lanes(page)).map((lane) => lane.type)).toEqual([
    'object',
    'video',
  ]);
  await expect(page.locator('.timeline-ghost-lane')).toHaveCount(0);
});

test('[TL-089] every kind opens a new lane above, between or below; a lane of another group only shows the blocked cursor', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await importMedia(page, JPG, WAV);
  // Two lanes: a picture over a shape.
  for (const kind of ['shape', JPG]) {
    const before = (await scene(page)).layers.length;
    await (await source(page, kind)).click();
    await expect
      .poll(async () => (await scene(page)).layers.length)
      .toBe(before + 1);
  }
  await expect(rows(page)).toHaveCount(2);
  const types = async () => (await lanes(page)).map((lane) => lane.type);
  const start = await types();
  for (const kind of ['shape', 'text', JPG, WAV]) {
    for (const [where, index] of [
      ['above', 0],
      ['between', 1],
      ['below', 2],
    ] as const) {
      const first = await stable(rows(page).first());
      const last = await stable(rows(page).last());
      const y =
        where === 'above'
          ? first.y + 2
          : where === 'between'
            ? first.y + first.height - 2
            : last.y + last.height - 2;
      await dragTo(page, await source(page, kind), first.x + 300, y);
      await expect(
        page.locator('#timeline-foundation .timeline-lane-insert'),
        `${kind} ${where}`,
      ).toBeVisible();
      await expect(page.locator('#timeline-foundation')).not.toHaveClass(
        /lane-refused/,
      );
      await page.mouse.up();
      await expect
        .poll(async () => (await lanes(page)).length, `${kind} ${where}`)
        .toBe(3);
      const added = (await types())[index];
      expect(added, `${kind} ${where}`).toBe(
        kind === WAV
          ? 'audio'
          : kind === JPG
            ? 'video'
            : kind === 'text'
              ? 'text'
              : 'object',
      );
      await page.locator('#composition-canvas').focus();
      await page.keyboard.press('Control+z');
      await expect.poll(types).toEqual(start);
    }
  }
  // Text over the picture's lane: blocked only (no ghost, no + line, no hatch).
  const pictureLane = await stable(rows(page).first());
  await dragTo(
    page,
    await source(page, 'text'),
    pictureLane.x + 400,
    pictureLane.y + pictureLane.height / 2,
  );
  await expect(page.locator('#timeline-foundation')).toHaveClass(
    /lane-refused/,
  );
  await expect(
    page.locator(
      '#timeline-foundation .timeline-asset-ghost[data-shown="true"]',
    ),
  ).toHaveCount(0);
  await expect(
    page.locator('#timeline-foundation .timeline-lane-insert'),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  // The "+" follows the pointer.
  const first = await stable(rows(page).first());
  await dragTo(page, await source(page, 'shape'), first.x + 200, first.y + 2);
  const at200 = await page
    .locator('#timeline-foundation .timeline-lane-insert span')
    .boundingBox();
  await page.mouse.move(first.x + 500, first.y + 2, { steps: 4 });
  const at500 = await page
    .locator('#timeline-foundation .timeline-lane-insert span')
    .boundingBox();
  expect(at500!.x - at200!.x).toBeGreaterThan(200);
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('[TL-090] the playhead is drawn above the lanes', async ({ page }) => {
  await (await source(page, 'shape')).click();
  const z = await page
    .locator('#timeline-foundation .timeline-playhead')
    .evaluate((item) => Number(getComputedStyle(item).zIndex));
  const clipZ = await page
    .locator('#timeline-foundation .timeline-clip')
    .first()
    .evaluate((item) => Number(getComputedStyle(item).zIndex) || 0);
  expect(z).toBeGreaterThan(clipZ);
});
