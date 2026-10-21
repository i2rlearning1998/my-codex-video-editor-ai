import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, hook, showCategory, test } from './fixtures';

// FINAL2 U9: Transcribe, Auto captions (with a dev/test-only fake STT
// engine, window.__AIVE_E2E_STT__) and nested clips.
test.use({ viewport: { width: 1920, height: 1080 } });

const WAV = path.join('tests/fixtures/media', 'audio_tone_440hz_3s.wav');
const scene = async (page: Page) => {
  const { project, session } = await hook(page);
  return project.compositions.find((c) => c.id === session.compositionId)!;
};
const labels = async (page: Page) => (await hook(page)).history.labels;
const clipEl = (page: Page, layerId: string) =>
  page.locator(
    `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layerId}"]`,
  );
const menuEntry = (page: Page, command: string) =>
  page.locator(`.timeline-menu [data-command="${command}"]`);

async function addSound(page: Page) {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles([WAV]);
  await expect(page.locator('#media-import')).toBeHidden();
  const card = page.locator(
    '.media-item:has(.media-card[data-name="audio_tone_440hz_3s.wav"]) .media-card',
  );
  await card.click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  return (await hook(page)).session.selectedIds[0]!;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_STT__?: boolean }).__AIVE_E2E_STT__ = true;
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[F2-060] Transcribe from the clip menu: engines show their status (Deepgram needs a key) and the transcript can be copied', async ({
  page,
}) => {
  const tone = await addSound(page);
  await clipEl(page, tone).click({ button: 'right' });
  await menuEntry(page, 'clip-transcribe').click();
  const dialog = page.locator('#transcribe-dialog');
  await expect(dialog).toBeVisible();
  // Failure state: Deepgram has no key, so it says so and offers Add key.
  const deepgram = dialog.locator('.caption-engine[data-engine="deepgram"]');
  await expect(deepgram).toHaveAttribute('data-ready', 'false');
  await expect(deepgram).toContainText('Needs a key');
  await deepgram.locator('.caption-engine-pick').click();
  await expect(
    dialog.locator('[data-action="transcribe-start"]'),
  ).toBeDisabled();
  await expect(dialog.locator('.caption-message')).toContainText(
    'Pick an engine that is ready',
  );
  // Whisper shows the offline engine's status.
  await expect(
    dialog.locator('.caption-engine[data-engine="local-whisper"]'),
  ).toContainText('Needs download');
  // Happy path with the test engine, in Hindi.
  await dialog
    .locator('.caption-engine[data-engine="e2e-fake-stt"] .caption-engine-pick')
    .click();
  await dialog.locator('[data-field="language"] [data-value="hi"]').click();
  await dialog.locator('[data-action="transcribe-start"]').click();
  await expect(dialog.locator('#transcript-text')).toHaveValue(
    /Welcome to the editor/,
  );
  await expect(dialog.locator('[data-action="transcript-copy"]')).toBeVisible();
  // Transcribing changes nothing in the project.
  expect(await labels(page)).not.toContain('Add captions');
});

test('[F2-061] Auto captions: style gallery, captions on a new lane in one step, inline edit keeps the cue, SRT download', async ({
  page,
}, testInfo) => {
  const tone = await addSound(page);
  await clipEl(page, tone).click({ button: 'right' });
  await menuEntry(page, 'clip-auto-captions').click();
  const dialog = page.locator('#captions-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.caption-style')).toHaveCount(5);
  await dialog.locator('.caption-style[data-style="minimal"]').click();
  await expect(
    dialog.locator('.caption-style[data-style="minimal"]'),
  ).toHaveAttribute('aria-checked', 'true');
  await dialog.locator('[data-field="position"] [data-value="top"]').click();
  await expect(dialog.locator('.caption-preview.pos-top')).toHaveCount(5);
  // Nothing to export yet.
  await expect(
    dialog.locator('[data-action="captions-export-srt"]'),
  ).toBeDisabled();
  await page.screenshot({ path: 'reports/final-ui/u9-captions.png' });
  await testInfo.attach('captions', {
    path: 'reports/final-ui/u9-captions.png',
  });
  const before = (await labels(page)).length;
  await dialog.locator('[data-action="captions-create"]').click();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator('.toast', { hasText: 'Captions lane' }),
  ).toBeVisible();
  const history = await labels(page);
  expect(history.length).toBe(before + 1);
  expect(history.at(-1)).toBe('Add captions');
  const current = await scene(page);
  const lane = current.tracks.find((track) => track.name === 'Captions')!;
  expect(lane.clips.length).toBeGreaterThan(0);
  const captions = current.layers.filter(
    (layer) => layer.properties.captionCue,
  );
  expect(captions.length).toBe(lane.clips.length);
  // Cues follow the clip on the timeline (it starts at the playhead).
  const toneClip = current.tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.layerId === tone)!;
  expect(lane.clips[0]!.startTime).toBeCloseTo(toneClip.startTime, 3);

  // Inline edit through the text editor keeps the cue's words in step.
  const first = captions.sort((a, b) => a.startTime - b.startTime)[0]!;
  await clipEl(page, first.id).click();
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hello there friends');
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await labels(page)).at(-1))
    .toBe('Edit caption');
  const edited = (await scene(page)).layers.find((l) => l.id === first.id)!;
  const cue = JSON.parse(
    (edited.properties.captionCue as { value: string }).value,
  ) as { words: { text: string }[] };
  expect(cue.words.map((word) => word.text).join(' ')).toBe(
    'Hello there friends',
  );

  // SRT download of the scene's captions, from the right rail's Auto
  // Caption (nothing selected).
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(0);
  await page.locator('#rail-right [data-section="Captions"]').click();
  const reopened = page.locator('#captions-dialog');
  await expect(reopened).toBeVisible();
  const download = page.waitForEvent('download');
  await reopened.locator('[data-action="captions-export-srt"]').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.srt$/);
  const text = await (
    await import('node:fs/promises')
  ).readFile((await file.path())!, 'utf8');
  expect(text).toContain('Hello there friends');
  expect(text).toMatch(/00:00:\d\d,\d{3} --> /);
});

test('[F2-062] Nest two clips, open the nested clip and leave by the breadcrumb, then Un-nest (never Ungroup)', async ({
  page,
}) => {
  const current = await scene(page);
  const tracks = [...current.tracks]
    .filter((track) => track.type !== 'audio' && !track.locked)
    .sort((a, b) => a.order - b.order);
  const top = new Set(current.layers.map((layer) => layer.id));
  const picks = tracks
    .flatMap((track) => track.clips)
    .filter((clip) => top.has(clip.layerId))
    .slice(0, 2)
    .map((clip) => clip.layerId);
  expect(picks.length).toBe(2);
  // One clip: no Nest entry.
  await clipEl(page, picks[0]!).click();
  await clipEl(page, picks[0]!).click({ button: 'right' });
  await expect(menuEntry(page, 'nest-clips')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await clipEl(page, picks[1]!).click({ modifiers: ['Shift'] });
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(2);
  await clipEl(page, picks[1]!).click({ button: 'right' });
  await menuEntry(page, 'nest-clips').click();
  await expect.poll(async () => (await labels(page)).at(-1)).toBe('Nest clips');
  const nestedClip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((clip) => (clip.metadata as { nested?: unknown }).nested)!;
  expect(nestedClip).toBeTruthy();
  const groupId = nestedClip.layerId;
  expect((await hook(page)).session.selectedIds).toEqual([groupId]);
  // The nested clip offers Open and Un-nest, never Ungroup.
  await clipEl(page, groupId).click({ button: 'right' });
  await expect(menuEntry(page, 'unnest-clip')).toBeVisible();
  await expect(menuEntry(page, 'ungroup')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Double-click enters: FIX1 F6 shows its two clips on their own lanes.
  await clipEl(page, groupId).dblclick();
  const bar = page.locator('#nest-bar');
  await expect(bar).toBeVisible();
  await expect(
    page.locator('#timeline-foundation .timeline-clip.nle-clip'),
  ).toHaveCount(2);
  await page.screenshot({ path: 'reports/final-ui/u9-nesting.png' });
  await bar.locator('.nest-crumb', { hasText: 'Main timeline' }).click();
  await expect(bar).toBeHidden();
  // Un-nest: the two clips come back as they were (one step).
  await clipEl(page, groupId).click({ button: 'right' });
  await menuEntry(page, 'unnest-clip').click();
  await expect
    .poll(async () => (await labels(page)).at(-1))
    .toBe('Flatten nested clip');
  const after = await scene(page);
  expect(
    after.tracks
      .flatMap((track) => track.clips)
      .some((clip) => (clip.metadata as { nested?: unknown }).nested),
  ).toBe(false);
  expect(after.layers.map((layer) => layer.id)).toEqual(
    expect.arrayContaining(picks),
  );
});
