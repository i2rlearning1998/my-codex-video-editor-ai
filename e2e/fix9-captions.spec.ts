import path from 'node:path';
import { expect, hook, menuAction, showCategory, test } from './fixtures';

// FIX9: Auto captions just run. The person sees no engine list, no Whisper
// and no Deepgram (those are the owner's, set in the Admin app); the model
// is fetched by itself the first time, with its progress shown.
const WAV = path.join('tests/fixtures/media', 'audio_tone_440hz_3s.wav');

test('[FIX9-005] Auto captions need no engine setup: no Whisper or Deepgram anywhere for the person, the model comes down by itself and the captions land on the timeline', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('aive.developer', '0');
    (window as { __AIVE_E2E_WHISPER__?: string }).__AIVE_E2E_WHISPER__ =
      'runner:ok';
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
  // Settings: no keys and no offline-model screens for the person.
  await menuAction(page, '#open-settings');
  const settings = page.locator('.modal-dialog');
  await expect(settings.locator('[data-settings-tab="offline"]')).toHaveCount(
    0,
  );
  await expect(settings.locator('[data-settings-tab="keys"]')).toHaveCount(0);
  await settings.locator('#settings-done').click();
  // A sound on the timeline.
  await showCategory(page, 'Media');
  await page.locator('#import-media-input').setInputFiles(WAV);
  const card = page.locator(
    '.media-item:has(.media-card[data-name="audio_tone_440hz_3s.wav"]) .media-card',
  );
  await card.click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  const layer = (await hook(page)).session.selectedIds[0]!;
  await page
    .locator(
      `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layer}"]`,
    )
    .click({ button: 'right' });
  await page
    .locator('.timeline-menu [data-command="clip-auto-captions"]')
    .click();
  const dialog = page.locator('#captions-dialog');
  await expect(dialog).toBeVisible();
  // No engine list, and the words Whisper and Deepgram are nowhere in it.
  await expect(dialog.locator('.caption-engines')).toBeHidden();
  await expect(dialog.locator('.caption-engine')).toHaveCount(0);
  const shown = (await dialog.innerText()).toLowerCase();
  expect(shown).not.toContain('whisper');
  expect(shown).not.toContain('deepgram');
  // The button works at once (the model is not on this device yet).
  const create = dialog.locator('[data-action="captions-create"]');
  await expect(create).toBeEnabled();
  await page.screenshot({ path: 'reports/fix9/captions-dialog.png' });
  await create.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const { project, session } = await hook(page);
  const scene = project.compositions.find(
    (c) => c.id === session.compositionId,
  )!;
  const lane = scene.tracks.find((track) => track.name === 'Captions')!;
  expect(lane.clips.length).toBeGreaterThan(0);
});
