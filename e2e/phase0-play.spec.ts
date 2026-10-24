import { test, expect, hook, showCategory } from './fixtures';

// PHASE 0 (E3): the first Play press under the owner's real Chrome policy
// (sound only after a click). Runs in the `autoplay-policy` project.
// C7: the first Play press starts picture and sound together.
test('[FX5-016] first Play press under --autoplay-policy=document-user-activation-required: waits for the sound to decode (Preparing audio), then picture and sound start together; no console warnings', async ({
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
    (window as unknown as { __probe: string }).__probe =
      new AudioContext().state;
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
  // The policy is really on: a context made before any click was suspended.
  expect(
    await page.evaluate(
      () => (window as unknown as { __probe: string }).__probe,
    ),
  ).toBe('suspended');
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
