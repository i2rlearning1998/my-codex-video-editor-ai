import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { test, expect, hook, rulerBox } from './fixtures';

// W5-A: export v1. The sandbox Chromium has no H.264/AAC encoder, so exports here are
// WebM (VP9 + Opus). The CI "export-mp4" job sets REQUIRE_H264=1 and runs the same
// tests in Google Chrome, where they must produce MP4 (H.264 + AAC).
const REQUIRE_H264 = process.env.REQUIRE_H264 === '1';
const MEDIA = 'tests/fixtures/media';
const CODE = 'video_frame_code_320x180_4s.webm';

/**
 * Test-side decoding of exported files. The whole file is buffered before use
 * (preload 'auto' plus a wait on `buffered`), so no media request is still in flight
 * when the test ends; an in-flight blob request would be aborted and trip the
 * error guard (the same mechanism as D-056 in the app).
 */
async function installVideoLoader(page: Page) {
  await page.addInitScript(() => {
    (
      window as unknown as {
        __loadVideo(data: Uint8Array, type: string): Promise<HTMLVideoElement>;
      }
    ).__loadVideo = async (data, type) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      video.src = URL.createObjectURL(new Blob([data], { type }));
      await new Promise((resolve) => (video.onloadeddata = resolve));
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const check = () => {
          const buffered = video.buffered;
          if (
            (buffered.length &&
              buffered.end(buffered.length - 1) >= video.duration - 0.05) ||
            performance.now() - started > 10_000
          )
            resolve();
          else setTimeout(check, 20);
        };
        check();
      });
      return video;
    };
  });
}
async function openWithMedia(
  page: Page,
  project: string,
  files: string[],
  open: (name: string) => Promise<void>,
) {
  await installVideoLoader(page);
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await open(project);
  if (!files.length) return;
  await page.locator('[data-category="Media"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles(files.map((name) => path.resolve(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden();
}
const dialog = (page: Page) => page.locator('.modal-dialog');
async function openExport(page: Page) {
  await page.locator('#export').click();
  await expect(dialog(page).locator('#export-form')).toBeVisible();
  await expect(dialog(page).locator('#export-format')).not.toHaveText(
    /Checking/,
  );
}
/** Runs the export and returns the downloaded file's bytes and name. */
async function runExport(page: Page, testInfo: TestInfo) {
  const downloading = page.waitForEvent('download', { timeout: 120_000 });
  await dialog(page).locator('#export-start-button').click();
  const download = await downloading;
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  return { name: download.suggestedFilename(), bytes: readFileSync(file) };
}
/** EXP-005: independent container read-back (Mediabunny, in Node). */
async function readBack(bytes: Buffer) {
  const input = new Input({
    source: new BufferSource(new Uint8Array(bytes)),
    formats: ALL_FORMATS,
  });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  const stats = await video!.computePacketStats();
  const result = {
    mime: await input.getMimeType(),
    duration: await input.computeDuration(),
    video: {
      codec: video!.codec,
      width: video!.displayWidth,
      height: video!.displayHeight,
      fps: stats.averagePacketRate,
      frames: stats.packetCount,
    },
    audio: audio
      ? {
          codec: audio.codec,
          sampleRate: audio.sampleRate,
          channels: audio.numberOfChannels,
        }
      : null,
  };
  input.dispose();
  return result;
}
const expectedCodecs = (container: 'mp4' | 'webm') =>
  container === 'mp4'
    ? { video: 'avc', audio: 'aac', mime: /video\/mp4/, type: 'video/mp4' }
    : { video: 'vp9', audio: 'opus', mime: /video\/webm/, type: 'video/webm' };
const container = () => (REQUIRE_H264 ? 'mp4' : 'webm') as 'mp4' | 'webm';

/**
 * Decodes frames of an exported file in the page and reads the frame-code blocks
 * (the frame-code layer fills a 1280x720 frame: block b is centred at x = 160 b + 80).
 */
async function exportedCodes(
  page: Page,
  bytes: Buffer,
  mime: string,
  frames: number[],
) {
  return page.evaluate(
    async ({ base64, mime, frames }) => {
      const binary = atob(base64);
      const data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
      const video = await (
        window as unknown as {
          __loadVideo(
            data: Uint8Array,
            type: string,
          ): Promise<HTMLVideoElement>;
        }
      ).__loadVideo(data, mime);
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      const codes: (number | null)[] = [];
      for (const frame of frames) {
        await new Promise((resolve) => {
          video.onseeked = resolve;
          video.currentTime = (frame + 0.5) / 30;
        });
        context.drawImage(video, 0, 0, 1280, 720);
        const pixel = (x: number) => context.getImageData(x, 360, 1, 1).data;
        const grey = pixel(1200);
        if (!(grey[0]! > 90 && grey[0]! < 170)) {
          codes.push(null);
          continue;
        }
        let code = 0;
        for (let bit = 0; bit < 7; bit++)
          if (pixel(160 * bit + 80)[0]! > 128) code += 1 << bit;
        codes.push(code);
      }
      URL.revokeObjectURL(video.src);
      return codes;
    },
    { base64: bytes.toString('base64'), mime, frames },
  );
}

test.describe('frame code', () => {
  test.beforeEach(async ({ page, openFixtureProject }) => {
    await openWithMedia(page, 'frame-code.json', [CODE], openFixtureProject);
  });

  test('[EXP-001][APP-015][EXP-003][EXP-005] Export writes a frame-exact video file named as asked', async ({
    page,
  }, testInfo) => {
    await expect(page.locator('#export')).toHaveText('Export');
    await openExport(page);
    for (const id of [
      'preset',
      'width',
      'height',
      'fps',
      'quality',
      'start',
      'end',
      'name',
    ])
      await expect(dialog(page).locator(`#export-${id}`)).toBeVisible();
    await expect(dialog(page).locator('#export-format')).toHaveAttribute(
      'data-container',
      container(),
    );
    if (container() === 'webm')
      await expect(dialog(page).locator('#export-format')).toContainText(
        'cannot encode H.264 and AAC',
      );
    await dialog(page).locator('#export-name').fill('frame code test');
    await page.screenshot({ path: testInfo.outputPath('export-dialog.png') });
    const { name, bytes } = await runExport(page, testInfo);
    expect(name).toBe(`frame code test.${container()}`);
    await expect(
      page.locator('.toast', { hasText: `Exported ${name}` }),
    ).toBeVisible();
    // EXP-005: container read-back.
    const info = await readBack(bytes);
    const codecs = expectedCodecs(container());
    expect(info.mime).toMatch(codecs.mime);
    expect(info.video).toMatchObject({
      codec: codecs.video,
      width: 1280,
      height: 720,
      frames: 120,
    });
    expect(info.video.fps).toBeCloseTo(30, 0);
    expect(info.duration).toBeCloseTo(4, 1);
    expect(info.audio).toBeNull(); // the frame-code video has no sound
    // EXP-003: every frame of the clip (frames 30..119) shows exactly its source frame.
    const frames = [...Array(90).keys()].map((index) => index + 30);
    const codes = await exportedCodes(page, bytes, codecs.type, frames);
    expect(codes).toEqual(frames.map((frame) => frame - 15));
    // Before the clip: background only.
    expect(await exportedCodes(page, bytes, codecs.type, [0, 29])).toEqual([
      null,
      null,
    ]);
  });

  test('[EXP-002] progress shows percent, frames and time left; the editor stays responsive; Cancel stops cleanly', async ({
    page,
  }) => {
    await openExport(page);
    // 4K makes the export long enough to watch.
    await dialog(page).locator('#export-preset').selectOption('youtube-4k');
    await page.evaluate(() => {
      const probe = window as unknown as {
        __gap: number;
        __last: number;
        __watch: boolean;
      };
      probe.__gap = 0;
      probe.__last = performance.now();
      probe.__watch = true;
      const tick = (now: number) => {
        probe.__gap = Math.max(probe.__gap, now - probe.__last);
        probe.__last = now;
        if (probe.__watch) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await dialog(page).locator('#export-start-button').click();
    const status = dialog(page).locator('#export-status');
    await expect(status).toHaveText(
      /^\d+% · frame \d+ of 120 · about \S+ left$/,
      { timeout: 60_000 },
    );
    await expect(status).toHaveText(/^([1-9]\d*)% · frame/, {
      timeout: 60_000,
    });
    await expect(dialog(page).locator('#export-bar')).not.toHaveAttribute(
      'value',
      '0',
    );
    // The page keeps painting while the worker encodes.
    const gap = await page.evaluate(() => {
      const probe = window as unknown as { __gap: number; __watch: boolean };
      probe.__watch = false;
      return probe.__gap;
    });
    expect(gap).toBeLessThan(250);
    await dialog(page).locator('#export-cancel').click();
    await expect(
      page.locator('.toast', { hasText: 'Export cancelled' }),
    ).toBeVisible();
    await expect(dialog(page).locator('#export-cancel')).toBeHidden();
    // Nothing is left in storage.
    const leftovers = await page.evaluate(async () => {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('aive-media');
      const names: string[] = [];
      try {
        const folder = await root.getDirectoryHandle('exports');
        for await (const [name] of (
          folder as unknown as { entries(): AsyncIterable<[string]> }
        ).entries())
          names.push(name);
      } catch {
        // No exports folder.
      }
      return names;
    });
    expect(leftovers).toEqual([]);
  });

  test('[EXP-006] presets fill the dialog, and a Shorts export is 1080x1920 with the frame letterboxed', async ({
    page,
  }, testInfo) => {
    await openExport(page);
    const expected: [string, string, string, string][] = [
      ['youtube-1080', '1920', '1080', 'high'],
      ['youtube-4k', '3840', '2160', 'high'],
      ['vertical', '1080', '1920', 'high'],
      ['square', '1080', '1080', 'high'],
      ['portrait', '1080', '1350', 'high'],
      ['whatsapp', '854', '480', 'low'],
    ];
    for (const [preset, width, height, quality] of expected) {
      await dialog(page).locator('#export-preset').selectOption(preset);
      await expect(dialog(page).locator('#export-width')).toHaveValue(width);
      await expect(dialog(page).locator('#export-height')).toHaveValue(height);
      await expect(dialog(page).locator('#export-quality')).toHaveValue(
        quality,
      );
    }
    // Typing a size switches the preset to Custom and keeps sizes even.
    await dialog(page).locator('#export-width').fill('641');
    await dialog(page).locator('#export-width').press('Tab');
    await expect(dialog(page).locator('#export-preset')).toHaveValue('custom');
    await expect(dialog(page).locator('#export-width')).toHaveValue('640');
    await dialog(page).locator('#export-preset').selectOption('vertical');
    // Only the clip's first second, to keep the test quick.
    await dialog(page).locator('#export-start').fill('1');
    await dialog(page).locator('#export-start').press('Tab');
    await dialog(page).locator('#export-end').fill('2');
    await dialog(page).locator('#export-end').press('Tab');
    const { bytes } = await runExport(page, testInfo);
    const info = await readBack(bytes);
    expect(info.video).toMatchObject({ width: 1080, height: 1920, frames: 30 });
    // Letterboxed: black above the 16:9 frame; the frame-code grey block inside it.
    const pixels = await page.evaluate(
      async ({ base64, type }) => {
        const binary = atob(base64);
        const data = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
        const video = await (
          window as unknown as {
            __loadVideo(
              data: Uint8Array,
              type: string,
            ): Promise<HTMLVideoElement>;
          }
        ).__loadVideo(data, type);
        await new Promise((resolve) => {
          video.onseeked = resolve;
          video.currentTime = 0.5 / 30;
        });
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1920;
        const context = canvas.getContext('2d')!;
        context.drawImage(video, 0, 0);
        const at = (x: number, y: number) => [
          ...context.getImageData(x, y, 1, 1).data,
        ];
        // The composition (1280x720 scaled by 1080/1280) spans y 656..1264.
        return { top: at(540, 100), grey: at(1012, 960) };
      },
      {
        base64: bytes.toString('base64'),
        type: expectedCodecs(container()).type,
      },
    );
    expect(Math.max(...pixels.top.slice(0, 3))).toBeLessThan(20);
    expect(pixels.grey[0]).toBeGreaterThan(90);
    expect(pixels.grey[0]).toBeLessThan(170);
  });

  test('[EXP-007][EXP-009] the exported frames match the preview render; Export frame saves the playhead frame as PNG', async ({
    page,
  }, testInfo) => {
    await page
      .locator('.timeline-ruler')
      .click({ position: { x: 1.5 * 80, y: 8 } });
    await expect
      .poll(async () => (await hook(page)).session.time)
      .toBeCloseTo(1.5, 2);
    await openExport(page);
    // EXP-009: the PNG of the playhead frame, at composition size.
    const saving = page.waitForEvent('download');
    await dialog(page).locator('#export-png').click();
    const png = await saving;
    const pngFile = testInfo.outputPath('frame.png');
    await png.saveAs(pngFile);
    const pngBytes = readFileSync(pngFile);
    expect([pngBytes.readUInt32BE(16), pngBytes.readUInt32BE(20)]).toEqual([
      1280, 720,
    ]);
    const { bytes } = await runExport(page, testInfo);
    const mime = expectedCodecs(container()).type;
    // EXP-007: compare the exported frame at 1.5 s with the PNG render, pixel by pixel.
    const difference = await page.evaluate(
      async ({ video64, png64, mime }) => {
        const decode = (base64: string) => {
          const binary = atob(base64);
          const data = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++)
            data[i] = binary.charCodeAt(i);
          return data;
        };
        const draw = (source: CanvasImageSource) => {
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const context = canvas.getContext('2d')!;
          context.drawImage(source, 0, 0, 1280, 720);
          return context.getImageData(0, 0, 1280, 720).data;
        };
        const video = await (
          window as unknown as {
            __loadVideo(
              data: Uint8Array,
              type: string,
            ): Promise<HTMLVideoElement>;
          }
        ).__loadVideo(decode(video64), mime);
        await new Promise((resolve) => {
          video.onseeked = resolve;
          video.currentTime = 45.5 / 30;
        });
        const exported = draw(video);
        const image = await createImageBitmap(
          new Blob([decode(png64)], { type: 'image/png' }),
        );
        const preview = draw(image);
        let total = 0,
          worst = 0;
        for (let i = 0; i < exported.length; i += 4)
          for (let c = 0; c < 3; c++) {
            const delta = Math.abs(exported[i + c]! - preview[i + c]!);
            total += delta;
            worst = Math.max(worst, delta);
          }
        return { mean: total / ((exported.length / 4) * 3), worst };
      },
      {
        video64: bytes.toString('base64'),
        png64: pngBytes.toString('base64'),
        mime,
      },
    );
    // Lossy video: a small mean difference; hard edges may differ locally.
    expect(difference.mean).toBeLessThan(4);
    expect(await exportedCodes(page, bytes, mime, [45])).toEqual([30]);
  });
});

test('[EXP-004] the audio mix is in the file and in sync with the picture', async ({
  page,
  openFixtureProject,
}, testInfo) => {
  test.setTimeout(120_000);
  await openWithMedia(
    page,
    'av-sync.json',
    ['video_av_sync_flash_beep_720p.webm', 'audio_tone_440hz_3s.wav'],
    openFixtureProject,
  );
  await openExport(page);
  const { bytes } = await runExport(page, testInfo);
  const info = await readBack(bytes);
  expect(info.audio).toMatchObject({
    codec: expectedCodecs(container()).audio,
    sampleRate: 48_000,
    channels: 2,
  });
  const mime = expectedCodecs(container()).type;
  const result = await page.evaluate(
    async ({ base64, mime }) => {
      const binary = atob(base64);
      const data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
      const audio = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(
        data.buffer.slice(0),
      );
      const samples = audio.getChannelData(0);
      const rate = audio.sampleRate;
      const rms = (from: number, to: number) => {
        let sum = 0;
        for (let i = Math.floor(from * rate); i < to * rate; i++)
          sum += samples[i]! ** 2;
        return Math.sqrt(sum / ((to - from) * rate));
      };
      // Tone (≤ 0.125) plus beep (≤ 0.125) exceeds 0.18 only while the beep sounds.
      const onset = (second: number) => {
        for (
          let i = Math.floor((second - 0.2) * rate);
          i < (second + 0.2) * rate;
          i++
        )
          if (Math.abs(samples[i]!) > 0.18) return i / rate;
        return null;
      };
      const video = await (
        window as unknown as {
          __loadVideo(
            data: Uint8Array,
            type: string,
          ): Promise<HTMLVideoElement>;
        }
      ).__loadVideo(data, mime);
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      // The first frame (at 30 fps) that shows the white flash near a whole second.
      const flash = async (second: number) => {
        for (
          let frame = Math.round((second - 0.2) * 30);
          frame < (second + 0.2) * 30;
          frame++
        ) {
          await new Promise((resolve) => {
            video.onseeked = resolve;
            video.currentTime = (frame + 0.5) / 30;
          });
          context.drawImage(video, 0, 0, 64, 36);
          if (context.getImageData(32, 18, 1, 1).data[0]! > 200)
            return frame / 30;
        }
        return null;
      };
      return {
        toneEarly: rms(0.3, 0.9),
        silenceLate: rms(3.3, 3.9),
        onsets: [onset(1), onset(2)],
        flashes: [await flash(1), await flash(2)],
      };
    },
    { base64: bytes.toString('base64'), mime },
  );
  expect(result.toneEarly).toBeGreaterThan(0.05);
  expect(result.silenceLate).toBeLessThan(0.02);
  for (const [index, onset] of result.onsets.entries()) {
    expect(onset).not.toBeNull();
    expect(result.flashes[index]).not.toBeNull();
    expect(Math.abs(onset! - result.flashes[index]!)).toBeLessThanOrEqual(
      1 / 30,
    );
  }
});

test('[EXP-008] media missing from this browser is listed and blocks the export', async ({
  page,
  openFixtureProject,
}) => {
  await openWithMedia(page, 'frame-code.json', [], openFixtureProject);
  await openExport(page);
  await expect(dialog(page).locator('#export-missing')).toContainText(
    `These media files are not in this browser's storage, so the export cannot start: ${CODE}`,
  );
  await expect(dialog(page).locator('#export-start-button')).toBeDisabled();
  // A range with no clip needs no media.
  await dialog(page).locator('#export-end').fill('0.5');
  await dialog(page).locator('#export-end').press('Tab');
  await expect(dialog(page).locator('#export-missing')).toBeHidden();
  await expect(dialog(page).locator('#export-start-button')).toBeEnabled();
});

test('[APP-005] project JSON export moved to the File menu and still downloads the project', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#menu-trigger').click();
  const downloading = page.waitForEvent('download');
  await page.locator('#export-json').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('project.json');
});

test('[ANI-003] an exported animated frame matches the preview at the same time', async ({
  page,
}, testInfo) => {
  await installVideoLoader(page);
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  const seek = async (seconds: number) => {
    const box = await rulerBox(page);
    await page.mouse.click(box.x + seconds * 80, box.y + 8);
    await expect
      .poll(async () => (await hook(page)).session.time)
      .toBeCloseTo(seconds, 2);
  };
  // The badge (x 76, 224 wide) moves to x 276 between 0 s and 2 s.
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  await seek(0);
  await page
    .locator(
      '#animation-panel [data-property="position"] [data-action="stopwatch"]',
    )
    .click();
  await seek(2);
  const x = page.locator('#inspector-content input[aria-label="Position X"]');
  await x.fill('276');
  await x.press('Enter');
  await seek(1);
  await openExport(page);
  await dialog(page).locator('#export-end').fill('2');
  await dialog(page).locator('#export-end').press('Tab');
  const saving = page.waitForEvent('download');
  await dialog(page).locator('#export-png').click();
  const pngFile = testInfo.outputPath('preview-1s.png');
  await (await saving).saveAs(pngFile);
  const { bytes } = await runExport(page, testInfo);
  const result = await page.evaluate(
    async ({ video64, png64, mime }) => {
      const decode = (base64: string) =>
        Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const draw = (source: CanvasImageSource) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext('2d')!;
        context.drawImage(source, 0, 0, 1280, 720);
        return context.getImageData(0, 0, 1280, 720).data;
      };
      const video = await (
        window as unknown as {
          __loadVideo(
            data: Uint8Array,
            type: string,
          ): Promise<HTMLVideoElement>;
        }
      ).__loadVideo(decode(video64), mime);
      const frameAt = async (time: number) => {
        await new Promise((resolve) => {
          video.onseeked = resolve;
          video.currentTime = time;
        });
        return draw(video);
      };
      const first = await frameAt(0.5 / 30);
      const middle = await frameAt(30.5 / 30);
      const preview = draw(
        await createImageBitmap(
          new Blob([decode(png64)], { type: 'image/png' }),
        ),
      );
      let total = 0;
      for (let i = 0; i < middle.length; i += 4)
        for (let c = 0; c < 3; c++)
          total += Math.abs(middle[i + c]! - preview[i + c]!);
      // x 360, y 480: background at 0 s, the moving badge at 1 s.
      const at = (data: Uint8ClampedArray) => {
        const i = (480 * 1280 + 360) * 4;
        return [data[i]!, data[i + 1]!, data[i + 2]!];
      };
      return {
        mean: total / ((middle.length / 4) * 3),
        first: at(first),
        middle: at(middle),
      };
    },
    {
      video64: bytes.toString('base64'),
      png64: readFileSync(pngFile).toString('base64'),
      mime: expectedCodecs(container()).type,
    },
  );
  // Same drawing and evaluation code: only lossy encoding differs.
  expect(result.mean).toBeLessThan(4);
  // The animation is really in the file: the badge reached x 360 by 1 s.
  expect(Math.abs(result.middle[2]! - 0xed)).toBeLessThan(20);
  expect(Math.abs(result.first[2]! - 0xe7)).toBeLessThan(20);
  expect(result.middle[0]! - result.first[0]!).toBeLessThan(-15);
});

test('[ANI-007] an exported frame with an animation preset matches the preview', async ({
  page,
}, testInfo) => {
  await installVideoLoader(page);
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  // Fade the badge in over 1 s, then compare 0.5 s in the file and the preview.
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  await page.locator('#context-toolbar [data-control="animate"]').click();
  await page.locator('#animate-panel [data-preset="fade"]').click();
  await page.locator('#animate-duration').fill('1');
  await page.locator('#animate-duration').press('Enter');
  await page.keyboard.press('Escape');
  const box = await rulerBox(page);
  await page.mouse.click(box.x + 0.5 * 80, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(0.5, 2);
  await openExport(page);
  await dialog(page).locator('#export-end').fill('1');
  await dialog(page).locator('#export-end').press('Tab');
  const saving = page.waitForEvent('download');
  await dialog(page).locator('#export-png').click();
  const pngFile = testInfo.outputPath('preview-fade.png');
  await (await saving).saveAs(pngFile);
  const { bytes } = await runExport(page, testInfo);
  const result = await page.evaluate(
    async ({ video64, png64, mime }) => {
      const decode = (base64: string) =>
        Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const draw = (source: CanvasImageSource) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext('2d')!;
        context.drawImage(source, 0, 0, 1280, 720);
        return context.getImageData(0, 0, 1280, 720).data;
      };
      const video = await (
        window as unknown as {
          __loadVideo(
            data: Uint8Array,
            type: string,
          ): Promise<HTMLVideoElement>;
        }
      ).__loadVideo(decode(video64), mime);
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = 15.5 / 30;
      });
      const exported = draw(video);
      const preview = draw(
        await createImageBitmap(
          new Blob([decode(png64)], { type: 'image/png' }),
        ),
      );
      let total = 0;
      for (let i = 0; i < exported.length; i += 4)
        for (let c = 0; c < 3; c++)
          total += Math.abs(exported[i + c]! - preview[i + c]!);
      const i = (462 * 1280 + 200) * 4;
      return {
        mean: total / ((exported.length / 4) * 3),
        badge: [exported[i]!, exported[i + 1]!, exported[i + 2]!],
      };
    },
    {
      video64: bytes.toString('base64'),
      png64: readFileSync(pngFile).toString('base64'),
      mime: expectedCodecs(container()).type,
    },
  );
  expect(result.mean).toBeLessThan(4);
  // Half-faded: neither the paper (0xf0) nor the solid badge red (0xcb).
  expect(result.badge[0]).toBeGreaterThan(0xcb + 5);
  expect(result.badge[0]).toBeLessThan(0xf0 - 5);
});
