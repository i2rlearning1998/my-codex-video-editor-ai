import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, hook, showCategory, test, menuAction } from './fixtures';

// FIX3 2.7: offline captions run in a module worker. The fake model runs
// inside the real worker (`runner:<mode>`), so these prove the page stays
// free while it works, floods or stops answering.
const WAV = path.join('tests/fixtures/media', 'audio_tone_440hz_3s.wav');

async function start(page: Page, mode: string) {
  await page.addInitScript((mode) => {
    (window as { __AIVE_E2E_WHISPER__?: string }).__AIVE_E2E_WHISPER__ =
      `runner:${mode}`;
  }, mode);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
  await menuAction(page, '#open-settings');
  const settings = page.locator('.modal-dialog');
  await settings.locator('[data-settings-tab="offline"]').click();
  const whisper = settings.locator('[data-engine="local-whisper"]');
  await whisper.locator('[data-engine-action="download"]').click();
  await expect(whisper.locator('.key-state')).toHaveText('Ready');
  await settings.locator('#settings-done').click();
  await showCategory(page, 'Media');
  await page.locator('#import-media-input').setInputFiles(WAV);
  await page
    .locator(
      '.media-item:has(.media-card[data-name="audio_tone_440hz_3s.wav"]) .media-card',
    )
    .click({ button: 'right' });
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
  await dialog
    .locator(
      '.caption-engine[data-engine="local-whisper"] .caption-engine-pick',
    )
    .click();
  return dialog;
}

/** Starts counting the longest gap between animation frames (ms). */
const watchFrames = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __gap: number; __frames: number };
    w.__gap = 0;
    w.__frames = 0;
    let last = performance.now();
    const tick = (now: number) => {
      w.__gap = Math.max(w.__gap, now - last);
      w.__frames++;
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const frames = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __gap: number; __frames: number };
    return { gap: w.__gap, frames: w.__frames };
  });

async function responsive(page: Page, mode: 'cpu' | 'flood') {
  const dialog = await start(page, mode);
  await watchFrames(page);
  await dialog.locator('[data-action="captions-create"]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('.toast', { hasText: 'Found' })).toBeVisible();
  const { gap, frames: count } = await frames(page);
  // The CPU-bound model works for 1.5 s; the page keeps painting.
  if (mode === 'cpu') expect(count).toBeGreaterThan(20);
  expect(gap).toBeLessThan(200);
  const workers = page.workers().map((w) => w.url());
  expect(workers.some((url) => url.includes('whisper.worker'))).toBe(true);
  const { project, session } = await hook(page);
  const scene = project.compositions.find(
    (c) => c.id === session.compositionId,
  )!;
  expect(
    scene.tracks.find((t) => t.name === 'Captions')!.clips.length,
  ).toBeGreaterThan(0);
}

test('[FX3-002] offline captions keep the page responsive while a CPU-bound model works: no frame gap over 200 ms and the cues land', async ({
  page,
}) => responsive(page, 'cpu'));

test('[FX3-002] offline captions keep the page responsive through 20 000 progress events: no frame gap over 200 ms and the cues land', async ({
  page,
}) => responsive(page, 'flood'));

test('[FX3-003] a captions worker that stops answering is reported after 15 s with Copy diagnostics', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const dialog = await start(page, 'silent');
  await dialog.locator('[data-action="captions-create"]').click();
  const message = dialog.locator('.caption-message');
  await expect(message).toContainText('stopped responding', {
    timeout: 25_000,
  });
  await expect(
    message.locator('[data-action="copy-diagnostics"]'),
  ).toBeVisible();
  await page.screenshot({ path: 'reports/fix3/whisper-stalled.png' });
});

test('[FX3-003] Cancel terminates the captions worker mid-run', async ({
  page,
}) => {
  const dialog = await start(page, 'cpu');
  await dialog.locator('[data-action="captions-create"]').click();
  await expect
    .poll(() => page.workers().some((w) => w.url().includes('whisper.worker')))
    .toBe(true);
  await dialog.locator('[data-action="caption-cancel"]').click();
  await expect(dialog.locator('.caption-message')).toHaveText(
    'Stopped. Nothing was changed.',
  );
  await expect
    .poll(() => page.workers().some((w) => w.url().includes('whisper.worker')))
    .toBe(false);
});
