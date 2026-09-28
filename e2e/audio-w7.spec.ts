import path from 'node:path';
import { test, expect, hook } from './fixtures';

test('[AUD-002][AUD-003][AUD-009] Sound panel stores audio controls, undoes, reloads and changes audible level', async ({
  page,
  openFixtureProject,
}) => {
  await page.goto('/');
  await openFixtureProject('av-sync.json');
  await page.locator('[data-category="Media"]').click();
  await page
    .locator('#import-media-input')
    .setInputFiles(
      path.resolve('tests/fixtures/media/audio_tone_440hz_3s.wav'),
    );
  await expect(page.locator('#media-import')).toBeHidden();
  await page
    .locator('.timeline-clip[data-clip-id="clip-tone"]')
    .click({ position: { x: 30, y: 10 } });
  await page.locator('[data-category="Audio"]').click();
  const panel = page.locator('#sound-panel');
  const fill = async (name: string, value: string) => {
    const input = panel.getByRole('spinbutton', { name, exact: true });
    await input.fill(value);
    await input.press('Tab');
  };
  await fill('Gain (dB)', '-12');
  await fill('Pan (-1 left, +1 right)', '-1');
  await page.keyboard.press('Control+z');
  await expect(
    panel.getByRole('spinbutton', {
      name: 'Pan (-1 left, +1 right)',
      exact: true,
    }),
  ).toHaveValue('0');
  await fill('Fade in (seconds)', '0.2');
  await fill('Fade out (seconds)', '0.3');
  await panel
    .getByRole('button', { name: 'Set volume key at playhead', exact: true })
    .click();
  const settings = async () =>
    (await hook(page)).project.compositions[0]!.tracks[1]!.clips[0]!.metadata
      .audio;
  await expect.poll(settings).toMatchObject({
    gainDb: -12,
    fadeIn: 0.2,
    fadeOut: 0.3,
    volumeKeys: [{ db: -12 }],
  });
  await page.locator('[data-action="play"]').click();
  const level = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: { getMedia(): { audio: { level: number } } };
          }
        ).__AIVE__.getMedia().audio.level,
    );
  await expect.poll(level).toBeGreaterThan(0.005);
  expect(await level()).toBeLessThan(0.04);
  await page.locator('[data-action="play"]').click();
  await page.keyboard.press('Control+s');
  await page.reload();
  await expect.poll(settings).toMatchObject({ gainDb: -12, fadeIn: 0.2 });
});

test('[AUD-015][AUD-017][AUD-009][AUD-003] preview graph and export render identical stereo samples and measured downmix', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const graphPath = '/src/audio/graph.ts',
      settingsPath = '/src/audio/settings.ts',
      mixPath = '/src/export/mixdown.ts';
    const { scheduleAudioClip } = await import(graphPath);
    const { defaultAudioSettings } = await import(settingsPath);
    const { mixdown } = await import(mixPath);
    const rate = 48000,
      length = rate * 2;
    const buffer = new AudioBuffer({
      numberOfChannels: 6,
      length,
      sampleRate: rate,
    });
    // Constant independent channel values make the standard 5.1 matrix testable.
    [0.1, 0.2, 0.1, 0.8, 0.1, 0.2].forEach((v, c) =>
      buffer.getChannelData(c).fill(v),
    );
    const base = {
      clipId: 'a',
      trackId: 'a',
      sourceAssetId: 'a',
      startTime: 0,
      duration: 2,
      sourceIn: 0,
      sourceOut: 2,
      speed: 1,
      reversed: false,
    };
    const context = new OfflineAudioContext(2, length, rate);
    scheduleAudioClip(context, context.destination, base, buffer, 0, 0);
    const down = await context.startRendering();
    const clip = {
      ...base,
      audio: {
        ...defaultAudioSettings(),
        gainDb: -6,
        pan: 0.35,
        fadeIn: 0.2,
        fadeOut: 0.3,
        volumeKeys: [
          { time: 0, db: -12 },
          { time: 1, db: -6 },
        ],
      },
    };
    const preview = new OfflineAudioContext(2, length, rate);
    scheduleAudioClip(preview, preview.destination, clip, buffer, 0, 0);
    const rendered = await preview.startRendering();
    const exported = await mixdown(
      [clip],
      { decode: async () => buffer },
      0,
      2,
    );
    let max = 0,
      squared = 0;
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < length; i++) {
        const d = rendered.getChannelData(c)[i]! - exported.channels[c][i]!;
        max = Math.max(max, Math.abs(d));
        squared += d * d;
      }
    const channel = rendered.getChannelData(0);
    return {
      max,
      rmsError: Math.sqrt(squared / (2 * length)),
      left: down.getChannelData(0)[100],
      right: down.getChannelData(1)[100],
      start: channel[0],
      middle: channel[rate],
      end: channel[length - 1],
    };
  });
  expect(result.max).toBeLessThan(1e-6);
  expect(result.rmsError).toBeLessThan(1e-7);
  expect(result.left).toBeCloseTo(0.1 + Math.SQRT1_2 * 0.2, 5);
  expect(result.right).toBeCloseTo(0.2 + Math.SQRT1_2 * 0.3, 5);
  expect(result.start).toBe(0);
  expect(result.middle).toBeGreaterThan(0.01);
  expect(result.end).toBeLessThan(0.001);
});
