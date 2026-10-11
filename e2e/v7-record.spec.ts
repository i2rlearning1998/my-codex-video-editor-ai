import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  seekKeep,
  settled,
} from './fixtures';

// V7 (Clipchamp clone spec 11.4, 11.5): Record & create. The voiceover
// flow runs on Chromium's fake microphone (playwright.config.ts); text to
// speech runs on the deterministic test voices (the sandbox cannot
// download voice models), registered by the dev/test-only hook.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_TTS__?: boolean }).__AIVE_E2E_TTS__ = true;
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
const record = (page: Page) => page.locator('#library-record');
const labels = async (page: Page) => (await hook(page)).history.labels;
const scene = async (page: Page) => (await hook(page)).project.compositions[0]!;

test('[AUD-022] Record & create: Screen and camera, Camera and Screen planned; Audio records with a countdown, level meter, Pause / Resume and Stop, then review (waveform, Play, Redo) and Add puts "Recording 1" on a new audio lane at the playhead, one step', async ({
  page,
}) => {
  await showCategory(page, 'Record');
  const cards = record(page).locator('.record-card');
  await expect(cards).toHaveCount(5);
  for (const id of ['screen-camera', 'camera', 'screen'])
    await expect(record(page).locator(`[data-record="${id}"]`)).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  await expect(
    record(page).locator('[data-record="audio"]'),
  ).not.toHaveAttribute('aria-disabled', 'true');
  await seekKeep(page, 1);
  await record(page).locator('[data-record="audio"]').click();
  await expect(record(page).locator('#record-device')).toBeVisible();
  await record(page).locator('[data-action="record-start"]').click();
  // 3, 2, 1.
  await expect(record(page).locator('.record-countdown')).toHaveText('3');
  await expect(record(page).locator('[data-action="record-stop"]')).toBeVisible(
    {
      timeout: 6000,
    },
  );
  // The fake microphone's tone moves the meter.
  await expect
    .poll(async () =>
      Number(
        await record(page)
          .locator('.record-meter')
          .getAttribute('aria-valuenow'),
      ),
    )
    .toBeGreaterThan(0);
  await record(page).locator('[data-action="record-pause"]').click();
  await expect(
    record(page).locator('[data-action="record-pause"]'),
  ).toContainText('Resume');
  await record(page).locator('[data-action="record-pause"]').click();
  await page.waitForTimeout(600);
  await record(page).locator('[data-action="record-stop"]').click();
  // Review.
  await expect(record(page).locator('.record-wave')).toHaveAttribute(
    'data-ready',
    'true',
  );
  for (const action of ['record-play', 'record-redo', 'record-add'])
    await expect(
      record(page).locator(`[data-action="${action}"]`),
    ).toBeVisible();
  const lanes = (await scene(page)).tracks.length;
  await record(page).locator('[data-action="record-add"]').click();
  await expect
    .poll(async () => (await scene(page)).tracks.length)
    .toBe(lanes + 1);
  const lane = (await scene(page)).tracks.find(
    (track) => track.name === 'Recording 1',
  )!;
  expect(lane.type).toBe('audio');
  const clip = lane.clips[0]!;
  expect(clip.startTime).toBeCloseTo(1, 6);
  const asset = (await hook(page)).project.assets.find(
    (item) => item.id === clip.assetId,
  )!;
  expect(asset.type).toBe('audio');
  expect((await labels(page)).at(-1)).toBe('Add timeline clip');
  await expect(record(page).locator('.record-card')).toHaveCount(5);
});

test('[AUD-022] a refused microphone is explained with Retry (no console error); leaving while recording asks Keep or Discard', async ({
  page,
}) => {
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    let refuse = true;
    (window as unknown as { __allowMic: () => void }).__allowMic = () => {
      refuse = false;
    };
    navigator.mediaDevices.getUserMedia = (constraints) =>
      refuse
        ? Promise.reject(new DOMException('Denied', 'NotAllowedError'))
        : original(constraints);
  });
  await showCategory(page, 'Record');
  await record(page).locator('[data-record="audio"]').click();
  await record(page).locator('[data-action="record-start"]').click();
  await expect(record(page).locator('.record-problem')).toContainText(
    'blocked',
  );
  await page.evaluate(() =>
    (window as unknown as { __allowMic: () => void }).__allowMic(),
  );
  await record(page).locator('[data-action="record-retry"]').click();
  await expect(record(page).locator('[data-action="record-stop"]')).toBeVisible(
    {
      timeout: 6000,
    },
  );
  // Leaving the category while recording asks; Discard drops the take.
  await showCategory(page, 'Media');
  const dialog = page.locator('.modal-dialog');
  await expect(dialog).toContainText('Keep this recording');
  await dialog.locator('[data-role="cancel"]').click();
  await showCategory(page, 'Record');
  await expect(record(page).locator('.record-card')).toHaveCount(5);
});

test('[AUD-023] Text to speech: language with search, voices with descriptions, Advanced speed, text with count and Add pause; Save adds the speech on a new lane, opens Media and selects it; edits show "unsaved changes" with Discard; the clip reopens the panel and Save replaces its audio in one step', async ({
  page,
}) => {
  await showCategory(page, 'Record');
  await record(page).locator('[data-record="tts"]').click();
  await settled(page);
  const panel = page.locator('#right-section');
  await expect(page.locator('#right-panel-title')).toHaveText('Text to speech');
  await expect(
    page.locator('#rail-right [data-section="Speech"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  // Languages, with a search; a new language reloads the voices.
  await expect(panel.locator('#tts-voice option').first()).toContainText(
    'Warm, friendly',
  );
  await panel.locator('#tts-language-search').fill('hindi');
  await expect(panel.locator('#tts-language option')).toContainText(['Hindi']);
  await panel.locator('#tts-language').selectOption('hi-IN');
  await expect(panel.locator('#tts-voice option')).toHaveText([
    'Asha · Calm, clear',
  ]);
  await panel.locator('#tts-language').selectOption('en-US');
  await panel.locator('#tts-voice').selectOption('test-ava');
  // Empty text: Preview and Save are off.
  await expect(panel.locator('[data-action="tts-preview"]')).toBeDisabled();
  await expect(panel.locator('[data-action="tts-save"]')).toBeDisabled();
  const text = panel.locator('#tts-text');
  await text.fill('Hello there friend');
  await panel.locator('[data-action="tts-pause"]').click();
  await page.keyboard.type('again');
  await expect(text).toHaveValue('Hello there friend [pause] again');
  await expect(panel.locator('.tts-count')).toHaveText('32 / 5,000');
  await seekKeep(page, 2);
  await panel.locator('[data-action="tts-save"]').click();
  // A new lane with the clip named from the first words; Media opens; the
  // clip is selected; the rail has Text to speech; Save is off.
  await expect
    .poll(async () =>
      (await scene(page)).tracks.some(
        (track) => track.clips[0]?.name === 'Hello there friend again',
      ),
    )
    .toBe(true);
  const clipOf = async () =>
    (await scene(page)).tracks
      .flatMap((track) => track.clips)
      .find((item) => item.name === 'Hello there friend again')!;
  const saved = await clipOf();
  expect(saved.startTime).toBeCloseTo(2, 6);
  // 4 * 0.06 per letter... the fake voice is 0.06 s a character plus 1 s.
  expect(saved.duration).toBeCloseTo(
    ('Hello there friend'.length + 'again'.length) * 0.06 + 1,
    1,
  );
  expect((saved.metadata.tts as { text: string }).text).toBe(
    'Hello there friend [pause] again',
  );
  await expect(page.locator('[data-category="Media"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await hook(page)).session.selectedIds).toEqual([saved.layerId]);
  await expect(
    page.locator('#rail-right [data-section="Speech"]'),
  ).toBeVisible();
  await expect(panel.locator('[data-action="tts-save"]')).toBeDisabled();
  // Unsaved changes, and Discard.
  await expect(panel.locator('.tts-banner')).toBeHidden();
  await panel.locator('#tts-text').fill('Something else');
  await expect(panel.locator('.tts-banner')).toContainText(
    'You have unsaved changes',
  );
  await panel.locator('[data-action="tts-discard"]').click();
  await expect(panel.locator('#tts-text')).toHaveValue(
    'Hello there friend [pause] again',
  );
  await expect(panel.locator('.tts-banner')).toBeHidden();
  // Replace: slower speech, one step; the clip keeps its place.
  await panel.locator('.tts-advanced > summary').click();
  const speed = panel.locator('#tts-speed');
  await speed.fill('0.5');
  await speed.press('Enter');
  const steps = (await labels(page)).length;
  await panel.locator('[data-action="tts-save"]').click();
  await expect
    .poll(async () => (await clipOf()).duration)
    .toBeCloseTo(saved.duration * 2, 1);
  expect((await clipOf()).id).toBe(saved.id);
  expect((await labels(page)).length).toBe(steps + 1);
  expect((await labels(page)).at(-1)).toBe('Replace text to speech');
  await page.locator('#undo').click();
  await expect
    .poll(async () => (await clipOf()).duration)
    .toBeCloseTo(saved.duration, 2);
});
