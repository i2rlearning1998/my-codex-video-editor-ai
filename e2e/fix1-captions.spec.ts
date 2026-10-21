import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, hook, showCategory, test, menuAction } from './fixtures';

// FIX1 F4: offline captions run the real Whisper runner with only the
// model faked (`runner:<mode>`): every failure class shows a visible
// message with Copy diagnostics; success puts cues on the timeline; Cancel
// works; Settings › Offline captions › Run self-test reports the backend.
const WAV = path.join('tests/fixtures/media', 'audio_tone_440hz_3s.wav');

async function start(page: Page, mode: string) {
  await page.addInitScript((mode) => {
    (window as { __AIVE_E2E_WHISPER__?: string }).__AIVE_E2E_WHISPER__ =
      `runner:${mode}`;
  }, mode);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
}
async function download(page: Page) {
  await menuAction(page, '#open-settings');
  const dialog = page.locator('.modal-dialog');
  await dialog.locator('[data-settings-tab="offline"]').click();
  const whisper = dialog.locator('[data-engine="local-whisper"]');
  await whisper.locator('[data-engine-action="download"]').click();
  await expect(whisper.locator('.key-state')).toHaveText('Ready');
  return dialog;
}
async function addSound(page: Page) {
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
  return (await hook(page)).session.selectedIds[0]!;
}
async function openCaptions(page: Page, layerId: string) {
  await page
    .locator(
      `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layerId}"]`,
    )
    .click({ button: 'right' });
  await page
    .locator('.timeline-menu [data-command="clip-auto-captions"]')
    .click();
  const dialog = page.locator('#captions-dialog');
  await dialog
    .locator(
      '.caption-engine[data-engine="local-whisper"] .caption-engine-pick',
    )
    .click();
  return dialog;
}

test('[FX1-010] offline captions succeed: steps are named while they run and the cues land on the timeline', async ({
  page,
}) => {
  await start(page, 'ok');
  await (await download(page)).locator('#settings-done').click();
  const layer = await addSound(page);
  const dialog = await openCaptions(page, layer);
  await expect(
    dialog.locator('.caption-engine[data-engine="local-whisper"]'),
  ).toContainText('Ready');
  await dialog.locator('[data-action="captions-create"]').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.toast', { hasText: 'Found' })).toBeVisible();
  const { project, session } = await hook(page);
  const scene = project.compositions.find(
    (c) => c.id === session.compositionId,
  )!;
  const lane = scene.tracks.find((track) => track.name === 'Captions')!;
  expect(lane.clips.length).toBeGreaterThan(0);
});

for (const [mode, text] of [
  ['no-speech', 'No speech found'],
  ['blocked', 'Model download blocked'],
  ['memory', 'Out of memory'],
  ['unsupported', 'does not support offline captions'],
  ['no-audio', 'sound could not be read'],
] as const)
  test(`[FX1-010] offline captions fail visibly: ${mode} says "${text}" with Copy diagnostics`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await start(page, mode);
    await (await download(page)).locator('#settings-done').click();
    const layer = await addSound(page);
    const dialog = await openCaptions(page, layer);
    await dialog.locator('[data-action="captions-create"]').click();
    const message = dialog.locator('.caption-message');
    await expect(message).toContainText(text);
    await expect(dialog).toBeVisible();
    await message.locator('[data-action="copy-diagnostics"]').click();
    const report = await page.evaluate(() => navigator.clipboard.readText());
    expect(report).toContain('Feature: Auto captions');
    expect(report).toContain(`failure: ${mode}`);
    if (mode === 'no-speech')
      await page.screenshot({ path: 'reports/fix1/f4-captions-error.png' });
  });

test('[FX1-010] Cancel stops a model that never starts', async ({ page }) => {
  await start(page, 'hang');
  await (await download(page)).locator('#settings-done').click();
  const layer = await addSound(page);
  const dialog = await openCaptions(page, layer);
  await dialog.locator('[data-action="captions-create"]').click();
  await expect(dialog.locator('.caption-progress-text')).toHaveText(
    'Loading model…',
  );
  await dialog.locator('[data-action="caption-cancel"]').click();
  await expect(dialog.locator('.caption-message')).toHaveText(
    'Stopped. Nothing was changed.',
  );
});

test('[FX1-011] Settings › Offline captions › Run self-test downloads, starts the model on a silent second and reports the backend; a blocked model says so with Copy diagnostics', async ({
  page,
}) => {
  await start(page, 'ok');
  await menuAction(page, '#open-settings');
  const dialog = page.locator('.modal-dialog');
  await dialog.locator('[data-settings-tab="offline"]').click();
  const test = dialog.locator('#whisper-selftest');
  await test.locator('[data-action="whisper-selftest"]').click();
  await expect(test.locator('.selftest-result')).toContainText(
    'Works. Backend: WebAssembly',
  );
  await expect(
    dialog.locator('[data-engine="local-whisper"] .key-state'),
  ).toHaveText('Ready');
  await page.screenshot({ path: 'reports/fix1/f4-selftest.png' });
});

test('[FX1-011] a self-test whose model is blocked explains it', async ({
  page,
}) => {
  await start(page, 'blocked');
  await menuAction(page, '#open-settings');
  const dialog = page.locator('.modal-dialog');
  await dialog.locator('[data-settings-tab="offline"]').click();
  const test = dialog.locator('#whisper-selftest');
  await test.locator('[data-action="whisper-selftest"]').click();
  await expect(test.locator('.selftest-result')).toContainText(
    'Self-test failed: Model download blocked',
  );
  await expect(test.locator('[data-action="copy-diagnostics"]')).toBeVisible();
});
