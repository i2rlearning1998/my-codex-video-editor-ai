import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, rulerBox } from './fixtures';

// H1.3: audio layers are never drawn on, or picked from, the canvas. They
// live as clips on audio tracks, in the Scene list and in the side panels.
// av-sync.json: layer-av (video, full canvas) and layer-tone (audio, stored
// at 0,0, so before the fix it was drawn and picked over the video's corner).
const MEDIA = 'tests/fixtures/media';
const AV = 'video_av_sync_flash_beep_720p.webm';
const TONE = 'audio_tone_440hz_3s.wav';
type Matrix = [number, number, number, number, number, number];
interface CanvasDebug {
  view: Matrix;
  corners: unknown;
}
const canvasDebug = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __AIVE__: { getCanvas(): CanvasDebug } }
    ).__AIVE__.getCanvas(),
  );
const media = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __AIVE__: {
          getMedia(): {
            audio: {
              sources: { clipId: string }[];
              lastSnippet: { clipIds: string[] } | null;
              snippets: number;
            };
          };
        };
      }
    ).__AIVE__.getMedia(),
  );
async function screen(page: Page, x: number, y: number) {
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  const [a, b, c, d, e, f] = (await canvasDebug(page)).view;
  return { x: box.x + a * x + c * y + e, y: box.y + b * x + d * y + f };
}
const selected = async (page: Page) => (await hook(page)).session.selectedIds;
const clipEl = (page: Page, id: string) =>
  page.locator(`.timeline-clip[data-clip-id="${id}"]`);

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await openFixtureProject('av-sync.json');
  await page.locator('[data-category="Media"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles([AV, TONE].map((name) => path.resolve(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
});

test('[AUD-018] an audio layer is never drawn or picked on the canvas', async ({
  page,
}) => {
  // Where the tone layer used to be drawn, a click picks the video under it.
  const corner = await screen(page, 40, 30);
  await page.mouse.click(corner.x, corner.y);
  await expect.poll(() => selected(page)).toEqual(['layer-av']);
  // The audio placeholder's colour is not on the canvas.
  const placeholder = await page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const { data } = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] === 0x3b && data[i + 1] === 0x70 && data[i + 2] === 0x68)
          count++;
      return count;
    });
  expect(placeholder).toBe(0);
  // Selecting the audio clip on the timeline draws no selection box.
  await clipEl(page, 'clip-tone').click({ position: { x: 30, y: 10 } });
  await expect.poll(() => selected(page)).toEqual(['layer-tone']);
  expect((await canvasDebug(page)).corners).toBeNull();
  await expect(page.locator('#selection-actions')).toBeHidden();
  // It is still in the Scene list.
  await page.locator('[data-category="Scene"]').click();
  await expect(
    page.locator('.scene-row[data-layer-id="layer-tone"]'),
  ).toBeVisible();
  // A marquee over the whole artboard selects the video only.
  const from = await screen(page, -20, -20);
  const to = await screen(page, 1300, 740);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => selected(page)).toEqual(['layer-av']);
});

test('[AUD-018][VID-006] after Detach audio the new audio layer stays off the canvas and the video is not heard twice', async ({
  page,
}) => {
  await clipEl(page, 'clip-av').click({
    button: 'right',
    position: { x: 20, y: 10 },
  });
  await page
    .locator('.timeline-menu [role^="menuitem"]')
    .filter({ hasText: /^Detach audio$/ })
    .click();
  const clips = (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  );
  const detached = clips.find(
    (clip) => clip.metadata.detachedFrom === 'clip-av',
  )!;
  const corner = await screen(page, 40, 30);
  await page.mouse.click(corner.x, corner.y);
  await expect.poll(() => selected(page)).toEqual(['layer-av']);
  // Playing: the detached clip sounds, the video clip's own audio does not.
  await page.locator('[data-action="play"]').click();
  await expect
    .poll(async () =>
      (await media(page)).audio.sources.map((s) => s.clipId).sort(),
    )
    .toEqual([detached.id, 'clip-tone'].sort());
  await page.locator('[data-action="play"]').click();
  // Scrubbing: the snippet under the playhead has no video audio either.
  const before = (await media(page)).audio.snippets;
  const ruler = await rulerBox(page);
  await page.mouse.click(ruler.x + 80, ruler.y + 8);
  await expect
    .poll(async () => (await media(page)).audio.snippets)
    .toBeGreaterThan(before);
  expect((await media(page)).audio.lastSnippet!.clipIds).not.toContain(
    'clip-av',
  );
});

test('[AUD-018] an audio file dropped on the canvas becomes a clip on an audio track, not a box on the canvas', async ({
  page,
}) => {
  await page
    .locator(`#media-panel .media-card[data-name="${TONE}"]`)
    .dragTo(page.locator('#composition-canvas'), {
      targetPosition: { x: 200, y: 150 },
    });
  const project = (await hook(page)).project;
  const layer = project.compositions[0]!.layers.at(-1)!;
  expect(layer.type).toBe('audio');
  const track = project.compositions[0]!.tracks.find((item) =>
    item.clips.some((clip) => clip.layerId === layer.id),
  )!;
  expect(track.type).toBe('audio');
  // The canvas keeps showing, and picking, the video.
  expect((await canvasDebug(page)).corners).toBeNull();
  const point = await screen(page, 300, 200);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => selected(page)).toEqual(['layer-av']);
});
