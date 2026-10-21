import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  openRight,
  showCategory,
  seekKeep,
} from './fixtures';

// V7 (Clipchamp clone spec 11.3): the right Audio panel over the PR #14
// engine, Fade for sound, Detach audio keeping the fades, and the left
// Audio category's sound pack.
const MEDIA = 'tests/fixtures/media';
async function open(
  page: Page,
  openFixtureProject: (name: string) => Promise<void>,
) {
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
  ).setFiles(
    ['video_av_sync_flash_beep_720p.webm', 'audio_tone_440hz_3s.wav'].map(
      (name) => path.resolve(MEDIA, name),
    ),
  );
  await expect(page.locator('#media-import')).toBeHidden();
}
const clipOn = (page: Page, layer: string) =>
  page.locator(
    `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layer}"]`,
  );
const panel = (page: Page) => page.locator('#right-section');
const labels = async (page: Page) => (await hook(page)).history.labels;
const audioOf = async (page: Page, layer: string) =>
  ((await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((clip) => clip.layerId === layer)?.metadata.audio ?? null) as {
    gainDb: number;
    muted: boolean;
    pan: number;
    fadeIn: number;
    fadeOut: number;
    eq: { low: number; mid: number; high: number };
    compressor: { enabled: boolean };
    role: string;
    duck: { enabled: boolean };
    normalization: { measuredLufs: number; targetLufs: number } | null;
  } | null;
const rail = (page: Page) =>
  page
    .locator('#rail-right button[data-section]:not([hidden])')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.section),
    );
const openGroup = async (page: Page, id: string) => {
  const group = panel(page).locator(`[data-group="${id}"]`);
  if (!(await group.evaluate((item) => (item as HTMLDetailsElement).open)))
    await group.locator('> summary').click();
};
const setField = async (page: Page, id: string, value: string) => {
  const field = panel(page).locator(`#${id}`);
  await field.fill(value);
  await field.press('Enter');
};

test('[AUD-019][AUD-002][AUD-009][AUD-011][AUD-012] an audio clip shows Audio, Fade and Speed only; Volume 0 to 200 % and Mute on top; Pan, Equalizer, Compressor, Loudness and Voice / Music with ducking in closed groups with Reset; one step each; nothing planned', async ({
  page,
  openFixtureProject,
}) => {
  await open(page, openFixtureProject);
  await clipOn(page, 'layer-tone').click({ position: { x: 30, y: 10 } });
  await expect.poll(() => rail(page)).toEqual(['Audio', 'Fade', 'Speed']);
  await openRight(page, 'Audio');
  // No position, size, timing or details, and nothing "Planned".
  await expect(page.locator('#inspector-content')).toBeHidden();
  await expect(panel(page)).not.toContainText('Planned');
  // Volume (100 % = 0 dB) and Mute at the top.
  await expect(panel(page).locator('#right-volume')).toHaveValue('100');
  await setField(page, 'right-volume', '200');
  expect((await audioOf(page, 'layer-tone'))!.gainDb).toBeCloseTo(6.02, 1);
  await panel(page).locator('[data-action="right-clip-mute"]').click();
  expect((await audioOf(page, 'layer-tone'))!.muted).toBe(true);
  expect((await labels(page)).slice(-2)).toEqual(['Volume', 'Mute clip']);
  // Groups start closed.
  const groups = panel(page).locator('details.right-audio-group');
  await expect(groups).toHaveCount(8); // FINAL2 U5 adds Fades, Volume keyframes, Reduce noise
  for (const item of await groups.all())
    expect(
      await item.evaluate((element) => (element as HTMLDetailsElement).open),
    ).toBe(false);
  // Pan, with a detent at the centre.
  await openGroup(page, 'pan');
  await setField(page, 'right-audio-pan', '-60');
  expect((await audioOf(page, 'layer-tone'))!.pan).toBeCloseTo(-0.6, 6);
  await setField(page, 'right-audio-pan', '3');
  expect((await audioOf(page, 'layer-tone'))!.pan).toBe(0);
  // Equalizer and its Reset.
  await openGroup(page, 'eq');
  await setField(page, 'right-audio-eq-low', '6');
  expect((await audioOf(page, 'layer-tone'))!.eq.low).toBe(6);
  await panel(page).locator('[data-action="audio-reset-eq"]').click();
  expect((await audioOf(page, 'layer-tone'))!.eq).toEqual({
    low: 0,
    mid: 0,
    high: 0,
  });
  // Compressor on.
  await openGroup(page, 'compressor');
  await panel(page).locator('[data-action="audio-compressor"]').click();
  expect((await audioOf(page, 'layer-tone'))!.compressor.enabled).toBe(true);
  // Unmute, then Loudness: Analyze measures, Apply stores it.
  await panel(page).locator('[data-action="right-clip-mute"]').click();
  await openGroup(page, 'loudness');
  await panel(page).locator('[data-action="audio-analyze"]').click();
  await expect(
    panel(page).locator('[data-audio="loudness-status"]'),
  ).toContainText('LUFS', { timeout: 20_000 });
  await panel(page).locator('[data-action="audio-apply"]').click();
  expect((await audioOf(page, 'layer-tone'))!.normalization?.targetLufs).toBe(
    -16,
  );
  expect((await labels(page)).at(-1)).toBe('Normalize loudness');
  // A later change makes it stale (the panel says so).
  await openGroup(page, 'eq');
  await setField(page, 'right-audio-eq-mid', '3');
  await expect(
    panel(page).locator('[data-audio="loudness-status"]'),
  ).toContainText('Analyze again');
  // Music role with Auto ducking.
  await openGroup(page, 'role');
  await panel(page).locator('[data-role="music"]').click();
  await panel(page).locator('[data-action="audio-duck"]').click();
  const settings = (await audioOf(page, 'layer-tone'))!;
  expect([settings.role, settings.duck.enabled]).toEqual(['music', true]);
  // Undo steps back one control at a time.
  await page.locator('#undo').click();
  expect((await audioOf(page, 'layer-tone'))!.duck.enabled).toBe(false);
  // Speed explains the pitch.
  await page.locator('#rail-right [data-section="Speed"]').click();
  await expect(panel(page)).toContainText('pitch');
});

test('[AUD-020][AUD-003] Fade: an audio clip fades its sound 0 to 5 s; a video Fade is one control for picture and sound; Detach audio gives the audio clip the fades, in one step', async ({
  page,
  openFixtureProject,
}) => {
  await open(page, openFixtureProject);
  await clipOn(page, 'layer-tone').click({ position: { x: 30, y: 10 } });
  await openRight(page, 'Fade');
  await setField(page, 'right-fade-out', '1.5');
  expect((await audioOf(page, 'layer-tone'))!.fadeOut).toBe(1.5);
  await expect(panel(page).locator('#right-fade-in')).toHaveAttribute(
    'aria-valuemax',
    '5',
  );
  // The video: one Fade for picture and sound.
  await clipOn(page, 'layer-av').click({ position: { x: 30, y: 10 } });
  await openRight(page, 'Fade');
  await setField(page, 'right-fade-in', '1');
  const clip = async () =>
    (await hook(page)).project.compositions[0]!.tracks.flatMap(
      (track) => track.clips,
    ).find((item) => item.layerId === 'layer-av')!;
  expect(
    ((await clip()).metadata.animation as { in: { preset: string } }).in.preset,
  ).toBe('fade');
  expect((await audioOf(page, 'layer-av'))!.fadeIn).toBe(1);
  expect((await labels(page)).at(-1)).toBe('Fade in');
  // Detach: the new audio clip has the fade; the video keeps its picture
  // fade; one step.
  const steps = (await labels(page)).length;
  await page.locator('#rail-right [data-section="Audio"]').click();
  await panel(page).locator('[data-action="right-detach-audio"]').click();
  expect((await labels(page)).length).toBe(steps + 1);
  const videoClipId = (await clip()).id;
  const detached = (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((item) => item.metadata.detachedFrom === videoClipId);
  expect(detached).toBeTruthy();
  expect(
    (detached!.metadata.audio as { fadeIn: number } | undefined)?.fadeIn,
  ).toBe(1);
  expect(
    ((await clip()).metadata.animation as { in: { preset: string } }).in.preset,
  ).toBe('fade');
  await page.locator('#undo').click();
  expect(
    (await hook(page)).project.compositions[0]!.tracks.flatMap(
      (track) => track.clips,
    ).some((item) => item.metadata.detachedFrom),
  ).toBe(false);
});

test('[AUD-021] the left Audio category is a sound pack: 12 sounds with length, hover preview, search, stock music in its own tab; a click adds a real audio clip at the playhead on a new audio lane', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await showCategory(page, 'Audio');
  const pack = page.locator('#library-audio');
  await expect(pack.locator('.sound-tile')).toHaveCount(12);
  await expect(pack.locator('.sound-tile-name')).toHaveText([
    'Click',
    'Pop',
    'Whoosh',
    'Swoosh up',
    'Swoosh down',
    'Ding',
    'Chime',
    'Beep',
    'Notification',
    'Thud',
    'Sparkle',
    'Riser',
  ]);
  // FIX1 F5 (D-291): stock music is its own library tab, not a planned tile.
  await expect(pack.locator('.sound-pack-stock')).toHaveCount(0);
  // Hover plays a preview; leaving stops it.
  const ding = pack.locator('.sound-tile[data-sound="ding"]');
  await ding.hover();
  await expect(ding.locator('.sound-tile-play')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.mouse.move(2, 2);
  await expect(ding.locator('.sound-tile-play')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // Search, and its empty state.
  await pack.locator('.sound-pack-search').fill('swoosh');
  await expect(pack.locator('.sound-tile:visible')).toHaveCount(2);
  await pack.locator('.sound-pack-search').fill('zzz');
  await expect(pack.locator('.sound-pack-empty')).toBeVisible();
  await pack.locator('.sound-pack-search').fill('');
  // Click: an audio asset (bytes in the media store) and a clip at the
  // playhead on a new audio lane, one step.
  await seekKeep(page, 2);
  const before = (await hook(page)).project.compositions[0]!.tracks.filter(
    (track) => track.type === 'audio',
  ).length;
  await ding.locator('[data-action="sound-add"]').click();
  await expect
    .poll(
      async () =>
        (await hook(page)).project.compositions[0]!.tracks.filter(
          (track) => track.type === 'audio',
        ).length,
    )
    .toBe(before + 1);
  const state = await hook(page);
  const asset = state.project.assets.find(
    (item) => item.metadata.fileName === 'Ding.wav',
  )!;
  expect(asset.type).toBe('audio');
  expect(asset.duration).toBeCloseTo(1.2, 2);
  const clip = state.project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((item) => item.assetId === asset.id)!;
  expect(clip.startTime).toBeCloseTo(2, 6);
  // A second click reuses the asset.
  await ding.locator('[data-action="sound-add"]').click();
  await expect
    .poll(
      async () =>
        (await hook(page)).project.compositions[0]!.tracks.flatMap(
          (track) => track.clips,
        ).filter((item) => item.assetId === asset.id).length,
    )
    .toBe(2);
  expect(
    (await hook(page)).project.assets.filter(
      (item) => item.metadata.fileName === 'Ding.wav',
    ),
  ).toHaveLength(1);
  // Drag: the press prepares the sound; dropped on the timeline it lands
  // there as a clip.
  const pop = pack.locator(
    '.sound-tile[data-sound="pop"] [data-action="sound-add"]',
  );
  const from = (await pop.boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await expect
    .poll(async () =>
      (await hook(page)).project.assets.some(
        (item) => item.metadata.fileName === 'Pop.wav',
      ),
    )
    .toBe(true);
  const lanes = (await page
    .locator('#timeline-foundation .timeline-scroll')
    .boundingBox())!;
  await page.mouse.move(
    lanes.x + lanes.width * 0.7,
    lanes.y + lanes.height - 30,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => {
      const state = await hook(page);
      const id = state.project.assets.find(
        (item) => item.metadata.fileName === 'Pop.wav',
      )!.id;
      return state.project.compositions[0]!.tracks.flatMap(
        (track) => track.clips,
      ).some((item) => item.assetId === id);
    })
    .toBe(true);
});
