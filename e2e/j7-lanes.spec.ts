import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, toScreen } from './fixtures';

// J7: the lane model. Lanes come in three groups, top to bottom: text and
// shapes, visuals, audio. Lane order is the canvas's stacking order, a clip
// never leaves its group, and audio has a single lane.
const MEDIA = 'tests/fixtures/media';
const JPG = 'image_testsrc_1200x800.jpg';
const WAV = 'audio_tone_440hz_3s.wav';
const RANK = { text: 0, object: 0, video: 1, audio: 2 } as const;

const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const lanes = async (page: Page) =>
  [...(await scene(page)).tracks].sort((a, b) => a.order - b.order);
const laneOf = async (page: Page, layerId: string) =>
  (await lanes(page)).findIndex((track) =>
    track.clips.some((clip) => clip.layerId === layerId),
  );
const labels = async (page: Page) => (await hook(page)).history.labels;

async function importMedia(page: Page, ...names: string[]) {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(names.map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
}
/** Adds an imported file from its media menu; returns the new layer's id. */
async function addToScene(page: Page, name: string) {
  const item = page.locator(
    `.media-item:has(.media-card[data-name="${name}"])`,
  );
  await item.locator('.media-card').click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  return (await hook(page)).session.selectedIds[0]!;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TL-061] lanes never mix groups and keep their own order; the top lane is in front; audio has one lane', async ({
  page,
}, testInfo) => {
  await importMedia(page, JPG, WAV);
  const image = await addToScene(page, JPG);
  const tone = await addToScene(page, WAV);
  const tracks = await lanes(page);
  // (U1, D-176) Lanes keep their own order: no lane mixes groups, a new
  // picture's lane opens at the top (there was no visual lane yet) and the
  // sound's lane at the bottom.
  const ranks = tracks.map((track) => RANK[track.type]);
  expect(new Set(ranks)).toEqual(new Set([0, 1, 2]));
  expect(tracks[0]!.type).toBe('video');
  expect(tracks.at(-1)!.type).toBe('audio');
  const rows = page.locator('#timeline-foundation .timeline-nle-row');
  await expect(rows).toHaveCount(tracks.length);
  expect(
    await rows.evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.laneGroup),
    ),
  ).toEqual(
    tracks.map((track) =>
      track.type === 'audio'
        ? 'audio'
        : track.type === 'video'
          ? 'visual'
          : 'text',
    ),
  );
  // The stacking follows the lanes: the picture on the top lane is in front
  // of every text and shape element; the audio (no picture) is at the back.
  const layers = (await scene(page)).layers.map((layer) => layer.id);
  const textual = layers.filter((id) => id !== image && id !== tone);
  expect(layers.indexOf(tone)).toBe(0);
  for (const id of textual)
    expect(layers.indexOf(image)).toBeGreaterThan(layers.indexOf(id));
  await page.screenshot({ path: testInfo.outputPath('lanes.png') });
  // A second sound at the same time goes to the one audio lane, at the
  // nearest free time (after the first, 3 s long).
  await page.locator('#timeline-foundation [data-action="frame-back"]').focus();
  const again = await addToScene(page, WAV);
  const audio = (await lanes(page)).filter((track) => track.type === 'audio');
  expect(audio).toHaveLength(1);
  const placed = audio[0]!.clips.find((clip) => clip.layerId === again)!;
  expect(placed.startTime).toBeCloseTo(3, 6);
});

test('[TL-062] a clip dragged onto a lane of another group shows not-allowed and snaps back', async ({
  page,
}) => {
  await importMedia(page, JPG);
  const image = await addToScene(page, JPG);
  const before = await scene(page);
  const steps = (await labels(page)).length;
  const clip = before.tracks
    .flatMap((track) => track.clips.map((item) => ({ ...item, track })))
    .find((item) => item.layerId === image)!;
  const element = page.locator(
    `#timeline-foundation .timeline-clip[data-clip-id="${clip.id}"]`,
  );
  await element.scrollIntoViewIfNeeded();
  const from = (await element.boundingBox())!;
  // A text-and-shapes lane (U1: lanes may sit in any order).
  const target = (await page
    .locator(
      '#timeline-foundation .timeline-nle-row[data-lane-group="text"] .timeline-track',
    )
    .last()
    .boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, target.y + target.height / 2, {
    steps: 8,
  });
  await expect(page.locator('#timeline-foundation')).toHaveClass(
    /lane-refused/,
  );
  await expect(
    page.locator('#timeline-foundation .timeline-nle-row.drop-refused'),
  ).toHaveCount(1);
  expect(
    await page
      .locator('#timeline-foundation')
      .evaluate((root) => getComputedStyle(root).cursor),
  ).toBe('not-allowed');
  await page.mouse.up();
  await expect(page.locator('#timeline-foundation')).not.toHaveClass(
    /lane-refused/,
  );
  // Nothing moved and nothing was added to the history.
  const after = (await scene(page)).tracks
    .flatMap((track) => track.clips.map((item) => ({ ...item, track })))
    .find((item) => item.layerId === image)!;
  expect([after.track.id, after.startTime]).toEqual([
    clip.track.id,
    clip.startTime,
  ]);
  expect((await labels(page)).length).toBe(steps);
  // A lane moves only within its group: the first visual lane cannot go up.
  const row = page.locator(
    `#timeline-foundation .timeline-nle-row[data-track-id="${clip.track.id}"]`,
  );
  // V2 (D-191): in the lane's right-click menu.
  await row.scrollIntoViewIfNeeded();
  const area = (await page
    .locator('#timeline-foundation .timeline-scroll')
    .boundingBox())!;
  const lane = (await row.boundingBox())!;
  await page.mouse.click(area.x + area.width - 12, lane.y + lane.height / 2, {
    button: 'right',
  });
  await expect(
    page.locator(
      '#timeline-foundation .timeline-menu [data-action="track-up"]',
    ),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('[TL-063] Bring forward and Send backward move an element between the lanes of its group, and the canvas stacking follows', async ({
  page,
}) => {
  // The example's paper (a shape) overlaps the headline in time.
  const pick = async (x: number, y: number) => {
    const at = await toScreen(page, x, y);
    await page.mouse.click(at.x, at.y);
  };
  await pick(300, 250);
  const id = (await hook(page)).session.selectedIds[0]!;
  const lane = await laneOf(page, id);
  const index = (await scene(page)).layers.findIndex((item) => item.id === id);
  // Send backward: one lane down (a new lane when the next one is busy).
  await page.keyboard.press('Control+[');
  expect((await labels(page)).at(-1)).toBe('Send backward');
  expect(await laneOf(page, id)).toBeGreaterThan(lane);
  expect(
    (await scene(page)).layers.findIndex((item) => item.id === id),
  ).toBeLessThan(index);
  // Bring forward returns it in front.
  await page.keyboard.press('Control+]');
  expect((await labels(page)).at(-1)).toBe('Bring forward');
  const layers = (await scene(page)).layers;
  expect(layers.findIndex((item) => item.id === id)).toBe(index);
  // One undo step each.
  await page.keyboard.press('Control+z');
  expect(await laneOf(page, id)).toBeGreaterThan(lane);
  // Every lane still holds only its own group.
  for (const track of await lanes(page))
    for (const clip of track.clips) {
      const layer = (await scene(page)).layers.find(
        (item) => item.id === clip.layerId,
      )!;
      expect(RANK[track.type]).toBe(
        layer.type === 'audio'
          ? 2
          : layer.type === 'video' || layer.type === 'image'
            ? 1
            : 0,
      );
    }
});
