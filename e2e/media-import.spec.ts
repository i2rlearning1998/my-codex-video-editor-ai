import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, toScreen } from './fixtures';

// W4-A: media import, browser media storage and the Project Media tab.
// Fixtures come from tests/fixtures/media (DEV-008). The sandbox Chromium cannot
// decode H.264 or AAC, so MP4, MOV and M4A are not imported here (see MED-003).
const MEDIA = 'tests/fixtures/media';
const fixture = (name: string) => path.resolve(MEDIA, name);
const WEBM = 'video_testsrc_720p_2s_vp9_opus.webm';
const WAV = 'audio_tone_440hz_3s.wav';
const PNG = 'image_gradient_1920x1080.png';

const cards = (page: Page) => page.locator('#media-panel .media-card');
const card = (page: Page, name: string) =>
  page.locator(`#media-panel .media-card[data-name="${name}"]`);

async function openMediaTab(page: Page) {
  await page.locator('[data-category="Media"]').click();
  await expect(page.locator('#media-panel')).toBeVisible();
}
async function importWithPicker(page: Page, names: string[]) {
  await openMediaTab(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(names.map(fixture));
}
/** Drops real File objects (built from the fixture bytes) like an OS drag. */
async function dropFiles(page: Page, names: string[], selector: string) {
  const files = names.map((name) => ({
    name,
    bytes: readFileSync(fixture(name)).toString('base64'),
  }));
  const transfer = await page.evaluateHandle((items) => {
    const data = new DataTransfer();
    for (const item of items) {
      const binary = atob(item.bytes);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      data.items.add(new File([bytes], item.name));
    }
    return data;
  }, files);
  const target = page.locator(selector);
  await target.dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(page.locator('#drop-overlay')).toBeVisible();
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
}
async function opfsKeys(page: Page) {
  return page.evaluate(async () => {
    const keys: string[] = [];
    try {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('aive-media');
      for await (const [folder, handle] of (root as any).entries())
        for await (const [name] of (handle as any).entries())
          keys.push(`${folder}/${name}`);
    } catch {
      // No media folder yet.
    }
    return keys.sort();
  });
}
async function waitThumbnail(page: Page, name: string) {
  await expect(card(page, name)).toHaveAttribute('data-thumbnail', 'ready');
  expect(
    await card(page, name)
      .locator('img')
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
}
const assets = async (page: Page) =>
  (await hook(page)).project.assets.filter(
    (asset) => asset.source.kind === 'local' && asset.id.startsWith('media-'),
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[MED-001][MED-007][MED-018] Import button adds video, audio and image cards with thumbnails and badges', async ({
  page,
}, testInfo) => {
  await openMediaTab(page);
  // The empty state explains how to add media.
  await expect(page.locator('#media-state')).toHaveAttribute(
    'data-state',
    'empty',
  );
  await expect(page.locator('#media-state-title')).toHaveText('No media yet');
  await importWithPicker(page, [WEBM, WAV, PNG]);
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('#media-state')).toBeHidden();
  await expect(card(page, WEBM).locator('.media-badge')).toHaveText('00:02');
  await expect(card(page, WAV).locator('.media-badge')).toHaveText('00:03');
  await expect(card(page, PNG).locator('.media-badge')).toHaveText('Image');
  await waitThumbnail(page, WEBM);
  await waitThumbnail(page, PNG);
  // Audio has no picture: the card shows its waveform (MED-019, W4-C).
  await expect(card(page, WAV)).toHaveAttribute('data-thumbnail', 'none');
  await expect(card(page, WAV)).toHaveAttribute('data-waveform', 'ready');
  await expect(card(page, WAV).locator('canvas.media-waveform')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('media-tab.png') });
  const imported = await assets(page);
  expect(
    imported.map((asset) => [asset.name, asset.type, asset.width ?? null]),
  ).toEqual([
    [WEBM, 'video', 1280],
    [WAV, 'audio', null],
    [PNG, 'image', 1920],
  ]);
  expect(imported[0]!.duration).toBeCloseTo(2, 1);
  expect(imported[1]!.duration).toBeCloseTo(3, 1);
  expect((await hook(page)).history.labels).toEqual([
    'Import media',
    'Import media',
    'Import media',
  ]);
  // Each import is one undo step; undo removes the card, redo brings it back.
  await page.locator('#undo').click();
  await expect(cards(page)).toHaveCount(2);
  await page.locator('#redo').click();
  await expect(cards(page)).toHaveCount(3);
  await waitThumbnail(page, PNG);
});

test('[MED-002] dropping files from the OS imports them and opens Project Media', async ({
  page,
}) => {
  await expect(page.locator('#media-panel')).toBeHidden();
  await dropFiles(page, [PNG, WAV], '#canvas-stage');
  await expect(page.locator('#drop-overlay')).toBeHidden();
  await expect(page.locator('#media-panel')).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator('[data-category="Media"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await waitThumbnail(page, PNG);
  // Dropping the same bytes again (another name) is recognised, not duplicated.
  await dropFiles(page, [PNG], '.timeline');
  await expect(
    page.locator('.toast', { hasText: 'already in Project Media' }),
  ).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
});

test('[MED-003] every browser-decodable format imports; other files get a clear message', async ({
  page,
}) => {
  const decodable = [
    WEBM,
    'video_alpha_circle_vp9.webm',
    'video_av_sync_flash_beep_720p.webm',
    WAV,
    'audio_tone_440hz_3s.mp3',
    'audio_tone_440hz_3s.ogg',
    PNG,
    'image_testsrc_1200x800.jpg',
    'image_testsrc_800x600.webp',
    'image_animated_320x240.gif',
    'image_vector_logo.svg',
  ];
  await importWithPicker(page, decodable);
  await expect(cards(page)).toHaveCount(decodable.length);
  const byName = new Map(
    (await assets(page)).map((asset) => [asset.name, asset]),
  );
  expect(byName.get('image_vector_logo.svg')).toMatchObject({
    type: 'image',
    width: 400,
    height: 300,
  });
  expect(byName.get('image_animated_320x240.gif')!.type).toBe('image');
  expect(byName.get('audio_tone_440hz_3s.ogg')!.duration).toBeCloseTo(3, 1);
  // Not media, and media this browser cannot read: a message, no card, no bytes.
  // Media bytes only: thumbnails and waveforms of the cards above are made one
  // at a time in the background (D-059) and may still land during this step.
  const bytes = async () =>
    (await opfsKeys(page)).filter((key) => key.startsWith('media/'));
  const before = await bytes();
  await importWithPicker(page, ['not_media.txt', 'corrupt_random_bytes.mp4']);
  await expect(
    page.locator('.toast', {
      hasText:
        "not_media.txt can't be imported: only video, audio and image files are supported",
    }),
  ).toBeVisible();
  await expect(
    page.locator('.toast', {
      hasText:
        "corrupt_random_bytes.mp4 can't be imported: this browser can't read this file or format",
    }),
  ).toBeVisible();
  await expect(cards(page)).toHaveCount(decodable.length);
  expect(await bytes()).toEqual(before);
});

test('[MED-004] import shows progress and Cancel leaves nothing behind', async ({
  page,
}) => {
  // Simulate a slow disk so the import is still running when Cancel is clicked.
  await page.addInitScript(() => {
    const write = FileSystemWritableFileStream.prototype.write;
    FileSystemWritableFileStream.prototype.write = async function (
      this: FileSystemWritableFileStream,
      ...args: Parameters<typeof write>
    ) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return write.apply(this, args);
    };
  });
  await page.reload();
  await importWithPicker(page, [PNG, WEBM]);
  const progress = page.locator('#media-import');
  await expect(progress).toBeVisible();
  await expect(page.locator('#media-import-label')).toHaveText(
    `Importing ${PNG} (1 of 2)`,
  );
  await expect(page.locator('#media-import-percent')).toHaveText(/^\d+%$/);
  await page.locator('#media-import-cancel').click();
  await expect(progress).toBeHidden();
  await expect(
    page.locator('.toast', { hasText: 'Import cancelled' }),
  ).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  expect(await assets(page)).toEqual([]);
  expect(
    (await opfsKeys(page)).filter((key) => key.startsWith('media/')),
  ).toEqual([]);
  expect((await hook(page)).history.labels).toEqual([]);
});

test('[MED-006][MED-018] imported media and thumbnails survive a reload; the project keeps references only', async ({
  page,
}) => {
  await importWithPicker(page, [WEBM, PNG]);
  await waitThumbnail(page, WEBM);
  await waitThumbnail(page, PNG);
  const imported = await assets(page);
  const references = imported.map((asset) => asset.source.reference);
  expect(references.every((ref) => /^media\/[0-9a-f]{32}$/.test(ref))).toBe(
    true,
  );
  // Autosave writes the project JSON: references, never bytes or data URIs.
  await expect
    .poll(() =>
      page.evaluate(
        () => localStorage.getItem('ai-native-editor:project') ?? '',
      ),
    )
    .toContain(references[1]!);
  const saved = await page.evaluate(() =>
    localStorage.getItem('ai-native-editor:project')!,
  );
  expect(saved).not.toMatch(/data:|base64/);
  expect(saved.length).toBeLessThan(100_000);
  const keys = await opfsKeys(page);
  for (const ref of references) {
    expect(keys).toContain(ref);
    expect(keys).toContain(ref.replace('media/', 'thumbs/'));
  }
  // After a reload the cached thumbnails are read back, not decoded again.
  await page.addInitScript(() => {
    const counter = window as unknown as { __thumbnailEncodes: number };
    counter.__thumbnailEncodes = 0;
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      counter.__thumbnailEncodes++;
      return toBlob.apply(this, args);
    };
  });
  await page.reload();
  await openMediaTab(page);
  await expect(cards(page)).toHaveCount(2);
  await waitThumbnail(page, WEBM);
  await waitThumbnail(page, PNG);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __thumbnailEncodes: number })
          .__thumbnailEncodes,
    ),
  ).toBe(0);
});

test('[MED-006] without OPFS the media store falls back to IndexedDB and still survives a reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Simulate a browser without the Origin Private File System.
    Object.defineProperty(StorageManager.prototype, 'getDirectory', {
      value: undefined,
    });
  });
  await page.reload();
  await importWithPicker(page, [PNG]);
  await waitThumbnail(page, PNG);
  await page.reload();
  await openMediaTab(page);
  await waitThumbnail(page, PNG);
  const keys = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('aive-media');
        open.onsuccess = () => {
          const request = open.result
            .transaction('blobs')
            .objectStore('blobs')
            .getAllKeys();
          request.onsuccess = () => resolve(request.result.map(String).sort());
          request.onerror = () => reject(request.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  const [asset] = await assets(page);
  expect(keys).toEqual([
    asset!.source.reference,
    asset!.source.reference.replace('media/', 'thumbs/'),
  ]);
});

test('[MED-009] the search box filters media cards by name', async ({
  page,
}) => {
  await importWithPicker(page, [WEBM, WAV, PNG]);
  await expect(cards(page)).toHaveCount(3);
  const search = page.locator('#asset-search');
  await search.fill('TONE');
  await expect(cards(page).locator('visible=true')).toHaveCount(1);
  await expect(card(page, WAV)).toBeVisible();
  await search.fill('nothing-like-this');
  await expect(cards(page).locator('visible=true')).toHaveCount(0);
  await expect(page.locator('#media-state-title')).toHaveText(
    'No matching media',
  );
  await search.fill('');
  await expect(cards(page).locator('visible=true')).toHaveCount(3);
});

test.describe('NLE fixture', () => {
  test.beforeEach(async ({ openFixtureProject }) => {
    await openFixtureProject('nle-example.json');
  });

  test('[MED-035] the Media tab lists the project media cards and other tabs do not', async ({
    page,
  }) => {
    await openMediaTab(page);
    await expect(card(page, 'Footage 1080p')).toBeVisible();
    await page.locator('[data-category="Graphics"]').click();
    await expect(page.locator('#media-panel')).toBeHidden();
    await expect(page.locator('.media-card').first()).toBeHidden();
  });

  test('[MED-013][MED-014] dragging an imported card onto a track creates a clip at the drop time', async ({
    page,
  }) => {
    await importWithPicker(page, [WEBM, WAV]);
    // The fixture's three media cards plus the two imports.
    await expect(cards(page)).toHaveCount(5);
    const video = (await assets(page)).find((asset) => asset.name === WEBM)!;
    // Video 3 is empty; 80 px per second, so 80 px in is 1 s.
    await card(page, WEBM).dragTo(
      page.locator('.timeline-track[data-track-id="video-3"]'),
      { targetPosition: { x: 80, y: 12 } },
    );
    const track = async (id: string) =>
      (await hook(page)).project.compositions[0]!.tracks.find(
        (item) => item.id === id,
      )!;
    const [clip] = (await track('video-3')).clips;
    expect(clip!.assetId).toBe(video.id);
    expect(clip!.startTime).toBeCloseTo(1, 1);
    expect(clip!.duration).toBeCloseTo(video.duration!, 6);
    expect((await hook(page)).history.labels.at(-1)).toBe('Add timeline clip');
    // An audio card on a video track is refused with a message.
    await card(page, WAV).dragTo(
      page.locator('.timeline-track[data-track-id="video-2"]'),
      { targetPosition: { x: 400, y: 12 } },
    );
    await expect(
      page.locator('.toast', {
        hasText: `${WAV} is not compatible with Video 2`,
      }),
    ).toBeVisible();
    // A locked track refuses too.
    await page.locator('[data-action="track-lock"][data-id="video-3"]').click();
    await card(page, WEBM).dragTo(
      page.locator('.timeline-track[data-track-id="video-3"]'),
      { targetPosition: { x: 400, y: 12 } },
    );
    await expect(
      page.locator('.toast', { hasText: 'Video 3 is locked' }),
    ).toBeVisible();
    expect((await track('video-3')).clips).toHaveLength(1);
  });

  test('[MED-015] dragging an imported image onto the canvas centres a layer on the drop point', async ({
    page,
  }) => {
    await importWithPicker(page, [PNG]);
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const point = await toScreen(page, 640, 360);
    await card(page, PNG).dragTo(canvas, {
      targetPosition: { x: point.x - box.x, y: point.y - box.y },
    });
    const image = (await assets(page))[0]!;
    const layer = (await hook(page)).project.compositions[0]!.layers.find(
      (item) => item.assetId === image.id,
    )!;
    // 1920x1080 is scaled down to fit the 1280x720 composition.
    const [sx, sy] = layer.transform.scale.value as number[];
    expect(sx).toBeCloseTo(1280 / 1920, 6);
    expect(sy).toBeCloseTo(sx!, 9);
    const [x, y] = layer.transform.position.value as number[];
    expect(x! + (1920 * sx!) / 2).toBeCloseTo(640, -0.5);
    expect(y! + (1080 * sy!) / 2).toBeCloseTo(360, -0.5);
    expect((await hook(page)).history.labels.at(-1)).toBe('Add asset layer');
  });

  test('[MED-015] a card dropped on the canvas refers to the stored media even when the drag also carries file data', async ({
    page,
  }) => {
    await importWithPicker(page, [PNG]);
    await waitThumbnail(page, PNG);
    const before = await opfsKeys(page);
    const asset = (await assets(page))[0]!;
    // Leave the Media tab: a file import would switch back to it.
    await page.locator('[data-category="Text"]').first().click();
    const transfer = await page.evaluateHandle(
      ({ id, name }) => {
        const data = new DataTransfer();
        data.setData('application/x-editor-asset', id);
        data.items.add(new File([new Uint8Array([137, 80, 78, 71])], name));
        return data;
      },
      { id: asset.id, name: PNG },
    );
    const canvas = page.locator('canvas');
    await canvas.dispatchEvent('dragenter', { dataTransfer: transfer });
    await expect(page.locator('#drop-overlay')).toBeHidden();
    await canvas.dispatchEvent('dragover', { dataTransfer: transfer });
    await canvas.dispatchEvent('drop', { dataTransfer: transfer });
    await expect
      .poll(async () => (await hook(page)).history.labels)
      .toEqual(['Import media', 'Add asset layer']);
    // No import started: the Media tab did not reopen, no asset or bytes were added.
    await expect(
      page.locator('[data-category="Text"]').first(),
    ).toHaveAttribute('aria-pressed', 'true');
    expect((await assets(page)).map((item) => item.id)).toEqual([asset.id]);
    expect(await opfsKeys(page)).toEqual(before);
  });
});

test('[DEV-008] the media fixture project resolves its references once its files are imported', async ({
  page,
  openFixtureProject,
}) => {
  await openFixtureProject('media-example.json');
  await openMediaTab(page);
  await expect(cards(page)).toHaveCount(4);
  // A fresh browser has no bytes yet: no thumbnail.
  await expect(card(page, PNG)).toHaveAttribute('data-thumbnail', 'none');
  // Importing the same files restores the bytes without duplicating assets.
  await importWithPicker(page, [WEBM, WAV, PNG, 'image_testsrc_1200x800.jpg']);
  await expect(cards(page)).toHaveCount(4);
  await waitThumbnail(page, PNG);
  await waitThumbnail(page, WEBM);
  expect((await hook(page)).history.labels).toEqual([]);
});
