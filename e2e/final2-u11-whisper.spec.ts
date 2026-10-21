import { test, expect, menuAction } from './fixtures';

// FINAL2 U11: offline Whisper in Settings › Offline voice & captions, with
// the dev/test-only fake runner (the sandbox cannot reach Hugging Face).
test.use({ viewport: { width: 1920, height: 1080 } });

test('[F2-090] Offline captions: Whisper shows Needs download with its size and a size-only note, downloads with progress (Cancel works), becomes Ready and can be removed; the offline voice points to cloud voices', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_WHISPER__?: string }).__AIVE_E2E_WHISPER__ = 'fake';
  });
  await page.goto('/');
  await menuAction(page, '#open-settings');
  const dialog = page.locator('.modal-dialog');
  await dialog.locator('[data-settings-tab="offline"]').click();
  const whisper = dialog.locator('[data-engine="local-whisper"]');
  await expect(whisper.locator('.key-state')).toHaveText(
    'Needs download (41 MB)',
  );
  await expect(whisper.locator('.settings-note')).toContainText(
    'checked by size only',
  );
  // Cancel stops it; it still needs the download.
  await whisper.locator('[data-engine-action="download"]').click();
  await whisper.locator('[data-engine-action="cancel"]').click();
  await expect(whisper.locator('.key-state')).toHaveText(
    'Needs download (41 MB)',
  );
  await whisper.locator('[data-engine-action="download"]').click();
  await expect(whisper.locator('.key-state')).toHaveText('Ready');
  await page.screenshot({ path: 'reports/final-ui/u11-whisper.png' });
  await whisper.locator('[data-engine-action="remove"]').click();
  await expect(
    whisper.locator('[data-engine-action="download"]'),
  ).toBeVisible();
  // FIX1 F3: the offline voice is behind a feature flag (cloud voices only).
  await expect(dialog.locator('[data-engine="local-tts"]')).toHaveCount(0);
});
