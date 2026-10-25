import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, hook, showCategory, test } from './fixtures';

test.use({ viewport: { width: 1920, height: 1080 } });

const VIDEO_ID = 'media-36bca395291051be';
const VIDEO_KEY = 'media/36bca395291051be3476a7b8694b6325';
const MEDIA = path.resolve('tests/fixtures/media');

test('[F2-050] [F2-051][MED-020][F2-052] a project whose media are not in this browser asks to reconnect them: a wrong file is refused in plain words, Pick folder finds every file by name and size, Reconnect restores the references and keeps clips; Details shows the probe', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  // This test is the one that wants the automatic check (the fixture turns it off).
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_RELINK__?: string }).__AIVE_E2E_RELINK__ = 'on';
  });
  // The media fixture project, with the video pointing at bytes that never existed.
  const project = JSON.parse(
    readFileSync(
      path.resolve('tests/fixtures/projects/media-example.json'),
      'utf8',
    ),
  ) as {
    assets: {
      id: string;
      source: { reference: string };
      metadata: { fingerprint: string };
    }[];
  };
  const video = project.assets.find((asset) => asset.id === VIDEO_ID)!;
  video.source.reference = `media/${'f'.repeat(32)}`;
  video.metadata.fingerprint = 'f'.repeat(32);
  const file = testInfo.outputPath('missing-media.json');
  writeFileSync(file, JSON.stringify(project));

  await page.goto('/');
  await page.locator('#menu-trigger').click();
  await page.locator('#import').setInputFiles(file);
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#project-name')).toHaveText('Media Fixture');
  const before = await hook(page);
  const clips = () =>
    before.project.compositions[0]!.tracks.flatMap((track) => track.clips);

  const dialog = page.locator('.relink-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.relink-row')).toHaveCount(4);
  const row = dialog.locator(`.relink-row[data-asset-id="${VIDEO_ID}"]`);
  await expect(row).toContainText('video_testsrc_720p_2s_vp9_opus.webm');

  // Failure state: a sound file for the video is refused, nothing changes.
  const chooser = page.waitForEvent('filechooser');
  await row.locator('.relink-pick').click();
  await (await chooser).setFiles(path.join(MEDIA, 'audio_tone_440hz_3s.wav'));
  await expect(row).toHaveAttribute('data-state', 'error');
  await expect(row.locator('.relink-note')).toContainText(
    'this one needs a video file',
  );
  await expect(dialog.locator('[data-role="apply"]')).toBeDisabled();

  // Pick folder: every missing file is found by name and size.
  await dialog.locator('.relink-folder-input').setInputFiles(MEDIA);
  await expect(dialog.locator('.relink-row[data-state="ready"]')).toHaveCount(
    4,
  );
  await expect(row.locator('.relink-note')).toContainText('same name, size');
  await expect(dialog.locator('.relink-status')).toContainText('Found 4 of 4');
  await page.screenshot({ path: 'reports/final-ui/u8-relink.png' });
  await dialog.locator('[data-role="apply"]').click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(
      async () =>
        (await hook(page)).project.assets.find((asset) => asset.id === VIDEO_ID)
          ?.source.reference,
    )
    .toBe(VIDEO_KEY);
  const after = await hook(page);
  // Same ids and references for the others; the clips and history are unchanged.
  expect(after.project.assets.map((asset) => asset.id)).toEqual(
    before.project.assets.map((asset) => asset.id),
  );
  for (const asset of after.project.assets)
    expect(asset.source.reference).toBe(
      `media/${(asset.metadata as { fingerprint: string }).fingerprint}`,
    );
  expect(
    after.project.compositions[0]!.tracks.flatMap((track) => track.clips),
  ).toEqual(clips());
  expect(after.history.labels).toEqual(before.history.labels);
  await expect(page.locator('.toast-success')).toContainText(
    'Reconnected 4 media files',
  );

  // Media › Details shows what the probe read.
  await showCategory(page, 'Media');
  await page
    .locator(`[data-item-id="${VIDEO_ID}"]`)
    .first()
    .click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-details"]').click();
  const details = page.locator('.media-details');
  await expect(details).toContainText('Video codec');
  await expect(details).toContainText('vp9');
  await expect(details).toContainText('Variable frame rate');
  await expect(details).toContainText('1,280 × 720');
  await page.screenshot({ path: 'reports/final-ui/u8-details.png' });
});
