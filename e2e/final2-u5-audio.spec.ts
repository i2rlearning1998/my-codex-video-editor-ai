import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, openRight } from './fixtures';

// FINAL2 U5: the Mixer in the left Audio category and the clip Audio tab's
// fades, volume keyframes and Reduce noise. The noise model's download is
// mocked (no live network): it answers with a broken file, the failure state.
test.use({ viewport: { width: 1920, height: 1080 } });

const ready = (page: Page) =>
  expect.poll(async () => page.evaluate(() => '__AIVE__' in window)).toBe(true);
const audioClip = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions[0]!.tracks.flatMap((track) =>
    track.type === 'audio' ? track.clips.map((clip) => ({ track, clip })) : [],
  )[0];
};
const clipAudio = async (page: Page) =>
  (
    (await audioClip(page))?.clip.metadata as {
      audio?: Record<string, unknown>;
    }
  )?.audio ?? {};

test('[F2-020] [F2-021] [F2-022] [F2-023] [F2-024][PB-013][AUD-002] Audio: master volume is saved with the project and survives a reload, meters show while playing, lane mute and solo; the clip Audio tab sets fade presets, a volume keyframe and Reduce noise, and a failed noise download says so with Turn off', async ({
  page,
}) => {
  await page.route('https://cdn.jsdelivr.net/npm/@shiguredo/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      headers: { 'access-control-allow-origin': '*' },
      body: 'broken',
    }),
  );
  await page.goto('/');
  await ready(page);
  // FIX1 F5: the Mixer is the right panel's Project audio (nothing selected).
  const openMixer = async () => {
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await hook(page)).session.selectedIds.length)
      .toBe(0);
    const rail = page.locator('#rail-right [data-section="Audio"]');
    await expect(rail).toHaveAttribute('title', 'Project audio');
    if (!(await page.locator('#mixer-master').isVisible())) await rail.click();
    await expect(page.locator('#mixer-master')).toBeVisible();
  };
  await openMixer();
  const mixer = page.locator('#inspector-panel .audio-mixer');
  await expect(mixer.locator('.audio-mixer-empty')).toBeVisible();
  await showCategory(page, 'Audio');
  // A sound from the pack gets a lane row in the Mixer.
  await page
    .locator(
      '#library-audio .sound-tile[data-sound="riser"] [data-action="sound-add"]',
    )
    .click();
  await expect.poll(async () => !!(await audioClip(page))).toBe(true);
  await openMixer();
  const { track } = (await audioClip(page))!;
  const row = mixer.locator(`.audio-mixer-track[data-track="${track.id}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('.audio-mixer-name')).toHaveText('Audio 1');
  // Master volume: one undo step in the project.
  const master = page.locator('#mixer-master');
  await master.fill('150');
  await master.press('Enter');
  await expect
    .poll(async () => (await hook(page)).project.settings.masterVolume)
    .toBe(1.5);
  // Mute and solo reuse the lane's state.
  await row.locator('[data-action="mixer-mute"]').click();
  await expect
    .poll(async () => (await audioClip(page))!.track.muted)
    .toBe(true);
  await row.locator('[data-action="mixer-mute"]').click();
  await expect
    .poll(async () => (await audioClip(page))!.track.muted)
    .toBe(false);
  await row.locator('[data-action="mixer-solo"]').click();
  await expect
    .poll(async () => (await hook(page)).session.soloTrackIds)
    .toEqual([track.id]);
  await row.locator('[data-action="mixer-solo"]').click();
  // Meters while playing: the master meter rises above zero.
  await page.locator('#timeline-foundation [data-action="play"]').click();
  await expect.poll(async () => (await hook(page)).session.playing).toBe(true);
  const meterEl = mixer.locator('.audio-meter[data-meter="master"]');
  await expect(meterEl).toBeVisible();
  await expect
    .poll(async () => Number(await meterEl.getAttribute('aria-valuenow')), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await page.locator('#timeline-foundation [data-action="play"]').click();
  await expect.poll(async () => (await hook(page)).session.playing).toBe(false);
  // Saved with the project: a reload keeps it and shows it.
  await page.reload();
  await ready(page);
  expect((await hook(page)).project.settings.masterVolume).toBe(1.5);
  await openMixer();
  await expect(page.locator('#mixer-master')).toHaveValue('150');

  // The clip Audio tab.
  await page
    .locator('.timeline-clip[data-kind="audio"]')
    .first()
    .click({ position: { x: 30, y: 10 } });
  await openRight(page, 'Audio');
  const panel = page.locator('#right-section');
  await panel.locator('details[data-group="fades"] > summary').click();
  await panel
    .locator('[data-action="audio-fade-in"][data-seconds="1"]')
    .click();
  await expect.poll(async () => (await clipAudio(page)).fadeIn).toBe(1);
  await panel
    .locator('[data-action="audio-fade-out"][data-seconds="0.5"]')
    .click();
  await expect.poll(async () => (await clipAudio(page)).fadeOut).toBe(0.5);
  await panel.locator('details[data-group="keys"] > summary').click();
  await panel.locator('[data-action="audio-key-add"]').click();
  await expect
    .poll(async () => ((await clipAudio(page)).volumeKeys as unknown[])?.length)
    .toBe(1);
  await panel.locator('details[data-group="denoise"] > summary').click();
  await expect(panel.locator('[data-audio="denoise-note"]')).toContainText(
    'never uploaded',
  );
  await panel.locator('[data-denoise="low"]').click();
  await expect.poll(async () => (await clipAudio(page)).denoise).toBe('low');
  // Playing loads the noise model; the mocked download is broken.
  await page.locator('#timeline-foundation [data-action="play"]').click();
  const failed = panel.locator('.audio-denoise-error');
  await expect(failed).toBeVisible({ timeout: 15_000 });
  await page.locator('#timeline-foundation [data-action="play"]').click();
  await panel.locator('[data-action="audio-denoise-off"]').click();
  await expect
    .poll(async () => (await clipAudio(page)).denoise)
    .toBeUndefined();
  await panel.locator('details[data-group="denoise"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'reports/final-ui/u5-audio-tab.png' });
  await showCategory(page, 'Audio');
  await page.screenshot({ path: 'reports/final-ui/u5-audio.png' });
});
