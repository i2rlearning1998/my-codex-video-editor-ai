import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// W4-C: audio playback, sync, mute and solo, scrub snippets and waveforms.
// av-sync.json: Video 1 holds clip-av (0..4 s) of video_av_sync_flash_beep_720p.webm,
// whose picture flashes white and whose sound beeps at 1 kHz for 0.1 s at each whole
// second. Audio 1 holds clip-tone (0..3 s), a constant 440 Hz tone.
const MEDIA = 'tests/fixtures/media';
const AV = 'video_av_sync_flash_beep_720p.webm';
const TONE = 'audio_tone_440hz_3s.wav';

interface MediaDebug {
  audio: {
    state: string;
    position: number | null;
    sources: { clipId: string; trackId: string; rate: number }[];
    level: number;
    snippets: number;
    lastSnippet: { time: number; clipIds: string[] } | null;
    decoded: number;
  };
  video: {
    key: string;
    currentTime: number;
    playbackRate: number;
    paused: boolean;
  }[];
  transport: number;
}
const media = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __AIVE__: { getMedia(): unknown } }
      ).__AIVE__.getMedia() as MediaDebug,
  );
const sourceIds = async (page: Page) =>
  (await media(page)).audio.sources.map((source) => source.clipId).sort();
const play = (page: Page) => page.locator('[data-action="play"]').click();
async function seek(page: Page, seconds: number) {
  const box = (await page.locator('.timeline-ruler').boundingBox())!;
  await page.mouse.click(box.x + seconds * 80, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
const clipEl = (page: Page, id: string) =>
  page.locator(`.timeline-clip[data-clip-id="${id}"]`);
async function clipMenu(page: Page, id: string, item: string) {
  await clipEl(page, id).click({ button: 'right', position: { x: 20, y: 10 } });
  await page
    .locator('.timeline-menu')
    .locator('[role^="menuitem"]')
    .filter({ hasText: new RegExp(`^${item}$`) })
    .click();
}

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('av-sync.json');
  // Restore this browser's media bytes for the fixture's references (D-052).
  await page.locator('[data-category="Media"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles([AV, TONE].map((name) => path.resolve(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
});

test('[AUD-005] playback sounds every audible clip from the playhead and stops on pause', async ({
  page,
}) => {
  await play(page);
  await expect.poll(() => sourceIds(page)).toEqual(['clip-av', 'clip-tone']);
  // The constant tone makes the master output measurably non-silent.
  await expect
    .poll(async () => (await media(page)).audio.level)
    .toBeGreaterThan(0.02);
  expect((await media(page)).audio.state).toBe('running');
  await play(page);
  await expect.poll(() => sourceIds(page)).toEqual([]);
  await expect
    .poll(async () => (await media(page)).audio.level)
    .toBeLessThan(0.001);
  // Playing again from 3.2 s: the tone (0..3 s) has ended; the video's sound plays on.
  await seek(page, 3.2);
  await play(page);
  await expect.poll(() => sourceIds(page)).toEqual(['clip-av']);
  const now = await media(page);
  expect(Math.abs(now.audio.position! - now.transport)).toBeLessThan(0.06);
  await play(page);
});

test('[PB-010] audio and picture stay within one frame during playback', async ({
  page,
}) => {
  await play(page);
  const gaps: number[] = [];
  await expect
    .poll(
      async () => {
        const now = await media(page);
        const video = now.video.find((item) => item.key === 'layer-av');
        // Settled: after 0.6 s, while both are running.
        if (
          video &&
          !video.paused &&
          now.audio.position !== null &&
          now.transport > 0.6
        )
          gaps.push(Math.abs(now.audio.position - video.currentTime));
        return now.transport;
      },
      { intervals: [50], timeout: 8000 },
    )
    .toBeGreaterThan(3.5);
  await play(page);
  expect(gaps.length).toBeGreaterThan(10);
  // One frame at 30 fps.
  expect(Math.max(...gaps)).toBeLessThanOrEqual(1 / 30);
});

test('[VID-006] detached audio plays from its own clip and the video clip goes silent', async ({
  page,
}) => {
  await clipMenu(page, 'clip-av', 'Detach audio');
  const detached = (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((clip) => clip.metadata.detachedFrom === 'clip-av')!;
  expect(detached).toBeTruthy();
  await play(page);
  await expect
    .poll(() => sourceIds(page))
    .toEqual([detached.id, 'clip-tone'].sort());
  await expect
    .poll(async () => (await media(page)).audio.level)
    .toBeGreaterThan(0.02);
  await play(page);
});

test('[AUD-007] track mute and solo change what is heard', async ({ page }) => {
  await page.locator('[data-action="track-mute"][data-id="audio-1"]').click();
  await play(page);
  await expect.poll(() => sourceIds(page)).toEqual(['clip-av']);
  // Muting is a project edit, and edits pause playback (existing behaviour).
  await page.locator('[data-action="track-mute"][data-id="audio-1"]').click();
  await expect.poll(() => sourceIds(page)).toEqual([]);
  await play(page);
  await expect.poll(() => sourceIds(page)).toEqual(['clip-av', 'clip-tone']);
  // Solo is session-only (D-034), so it changes what is heard while playing.
  await page.locator('[data-action="track-solo"][data-id="audio-1"]').click();
  await expect.poll(() => sourceIds(page)).toEqual(['clip-tone']);
  await page.locator('[data-action="track-solo"][data-id="audio-1"]').click();
  await expect.poll(() => sourceIds(page)).toEqual(['clip-av', 'clip-tone']);
  await play(page);
});

test('[PB-011] scrubbing a paused playhead plays a short snippet of the clips under it', async ({
  page,
}) => {
  // Audio starts on the first play (browsers need a user gesture); stop at once.
  await play(page);
  await play(page);
  await expect.poll(async () => (await media(page)).audio.decoded).toBe(2);
  const before = (await media(page)).audio.snippets;
  await seek(page, 1);
  await expect
    .poll(async () => (await media(page)).audio.snippets)
    .toBe(before + 1);
  expect((await media(page)).audio.lastSnippet).toEqual({
    time: 1,
    clipIds: ['clip-av', 'clip-tone'],
  });
  // Past the tone, only the video's sound is under the playhead.
  await seek(page, 3.5);
  await expect
    .poll(async () => (await media(page)).audio.lastSnippet?.clipIds)
    .toEqual(['clip-av']);
});

test('[MED-019] audio waveforms are made in the background and cached across reloads', async ({
  page,
}) => {
  const card = page.locator(`.media-card[data-name="${TONE}"]`);
  await expect(card).toHaveAttribute('data-waveform', 'ready');
  await expect(card.locator('canvas.media-waveform')).toBeVisible();
  const asset = (await hook(page)).project.assets.find(
    (item) => item.name === TONE,
  )!;
  const key = asset.source.reference.replace('media/', 'waves/');
  const stored = await page.evaluate(async (name) => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('aive-media');
    const [folder, file] = name.split('/');
    const handle = await (
      await root.getDirectoryHandle(folder!)
    ).getFileHandle(file!);
    return (await handle.getFile()).size;
  }, key);
  // 3 s at 100 peaks per second.
  expect(stored).toBe(300);
  // After a reload the waveform is read back: nothing is decoded.
  await page.addInitScript(() => {
    const counter = window as unknown as { __decodes: number };
    counter.__decodes = 0;
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (
      ...args: Parameters<typeof decode>
    ) {
      counter.__decodes++;
      return decode.apply(this, args);
    };
  });
  await page.reload();
  await page.locator('[data-category="Media"]').click();
  await expect(card).toHaveAttribute('data-waveform', 'ready');
  expect(
    await page.evaluate(
      () => (window as unknown as { __decodes: number }).__decodes,
    ),
  ).toBe(0);
});

test('[TL-047] an audio clip draws its waveform and it follows a trim', async ({
  page,
}, testInfo) => {
  await clipMenu(page, 'clip-av', 'Detach audio');
  const detached = (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((clip) => clip.metadata.detachedFrom === 'clip-av')!;
  const wave = clipEl(page, detached.id).locator('canvas.clip-waveform');
  await expect(wave).toBeVisible();
  // Bar height per pixel column, read from the waveform canvas.
  const heights = () =>
    clipEl(page, detached.id)
      .locator('canvas.clip-waveform')
      .evaluate((canvas: HTMLCanvasElement) => {
        const { data } = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height);
        return [...Array(canvas.width).keys()].map((x) => {
          let filled = 0;
          for (let y = 0; y < canvas.height; y++)
            if (data[(y * canvas.width + x) * 4 + 3]! > 0) filled++;
          return filled;
        });
      });
  // Beeps at 0-0.1 s, 1-1.1 s, ...: at 80 px/s, columns 0-7 and 80-87 are tall.
  let bars = await heights();
  expect(bars[4]).toBeGreaterThan(20);
  expect(bars[84]).toBeGreaterThan(20);
  expect(bars[40]).toBeLessThan(4);
  await page.screenshot({ path: testInfo.outputPath('waveform.png') });
  // Trim the start to 0.5 s: the beep at source 1 s is now 40 px in.
  await clipEl(page, detached.id).click({ position: { x: 60, y: 10 } });
  await seek(page, 0.5);
  await page.keyboard.press('[');
  await expect
    .poll(async () => {
      bars = await heights();
      return [bars[44]! > 20, bars[4]! < 4];
    })
    .toEqual([true, true]);
});
