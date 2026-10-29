import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';
import { mockStock, GOOD_KEY } from './stock-mock';

// FINAL3 Part A: leftovers from FIX1. A2 the Pexels /v1/videos endpoint,
// A4 adding stock never restores media or triggers an undo.
const elements = (page: Page) => page.locator('#library-elements');
const panel = (page: Page) => elements(page).locator('.stock-panel');
const openTile = async (page: Page, tile: string) => {
  await showCategory(page, 'Elements');
  const back = elements(page).locator('[data-action="browse-back"]');
  while (await back.isVisible()) await back.click();
  await elements(page).locator(`[data-tile="${tile}"]`).click();
  // FIX7: Photos and Videos open on Mine; Stock is its own tab.
  if (tile === 'photos' || tile === 'videos')
    await elements(page).locator('.browse-chip[data-chip="stock"]').click();
};
const withKey = (page: Page, provider: string) =>
  page.addInitScript(
    ([provider, key]) =>
      localStorage.setItem(
        `aive.provider-key.${provider}.apiKey`,
        JSON.stringify(key),
      ),
    [provider, GOOD_KEY] as const,
  );

test('[FN3-001] Pexels video search uses the documented /v1/videos/search endpoint; the retired /videos/... path is never asked', async ({
  page,
}) => {
  const mock = await mockStock(page);
  await withKey(page, 'pexels');
  await page.goto('/');
  await openTile(page, 'videos');
  await expect(panel(page).locator('.stock-item')).toHaveCount(2);
  const paths = mock.requests
    .filter((url) => url.startsWith('https://api.pexels.com/'))
    .map((url) => new URL(url).pathname);
  expect(paths).toContain('/v1/videos/search');
  expect(paths.filter((path) => path.startsWith('/videos/'))).toEqual([]);
});

test('[FN3-002] adding stock photos, videos and icons never shows a Restored note and never undoes anything', async ({
  page,
}) => {
  const mock = await mockStock(page);
  await withKey(page, 'pexels');
  await page.goto('/');
  // A Restored note at any moment fails the test.
  let restored = 0;
  await page.exposeFunction('__restoredSeen', () => restored++);
  await page.evaluate(() =>
    new MutationObserver(() => {
      for (const toast of document.querySelectorAll('.toast'))
        if (/Restored/.test(toast.textContent ?? ''))
          (window as unknown as { __restoredSeen(): void }).__restoredSeen();
    }).observe(document.body, { childList: true, subtree: true }),
  );
  const undoLength = async () => (await hook(page)).history.labels.length;
  const add = async (tile: string) => {
    await openTile(page, tile);
    const card = panel(page).locator('.stock-item').first();
    await expect(card).toBeVisible();
    const before = (await hook(page)).project.assets.length;
    const steps = await undoLength();
    await card.hover();
    await card.locator('[data-action="stock-plus"]').click();
    await expect
      .poll(async () => (await hook(page)).project.assets.length)
      .toBeGreaterThan(before);
    await expect.poll(undoLength).toBeGreaterThanOrEqual(steps);
    expect((await hook(page)).history.canRedo).toBe(false);
  };
  await add('photos');
  await add('videos');
  await add('icons');
  // The same photo a second time is a quiet duplicate: a new layer, no
  // new asset and no note.
  await openTile(page, 'photos');
  const layers = async () =>
    (await hook(page)).project.compositions[0]!.layers.length;
  const count = await layers();
  const assetCount = (await hook(page)).project.assets.length;
  const card = panel(page).locator('.stock-item').first();
  await card.hover();
  await card.locator('[data-action="stock-plus"]').click();
  await expect.poll(layers).toBeGreaterThan(count);
  expect((await hook(page)).project.assets.length).toBe(assetCount);
  expect(mock.requests.length).toBeGreaterThan(0);
  expect(restored).toBe(0);
  await expect(page.locator('.toast', { hasText: 'Restored' })).toHaveCount(0);
});

const nestedClip = async (page: Page) => {
  const { project, session } = await hook(page);
  return project.compositions
    .find((c) => c.id === session.compositionId)!
    .tracks.flatMap((track) => track.clips)
    .find((clip) => (clip.metadata as { nested?: unknown }).nested)!;
};
const timelineClip = (page: Page, layerId: string) =>
  page.locator(
    `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layerId}"]`,
  );

test('[FN3-004] a selected nested clip has Effects and Speed tabs: an effect applies to the whole nest, 2x halves its length; enter and leave still work', async ({
  page,
}) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
  const { project, session } = await hook(page);
  const scene = project.compositions.find(
    (c) => c.id === session.compositionId,
  )!;
  const top = new Set(scene.layers.map((layer) => layer.id));
  const picks = [...scene.tracks]
    .filter((track) => track.type !== 'audio' && !track.locked)
    .sort((a, b) => a.order - b.order)
    .map((track) => track.clips.find((clip) => top.has(clip.layerId)))
    .filter((clip) => !!clip)
    .slice(0, 2)
    .map((clip) => clip!.layerId);
  await timelineClip(page, picks[0]!).click();
  await timelineClip(page, picks[1]!).click({ modifiers: ['Shift'] });
  await timelineClip(page, picks[1]!).click({ button: 'right' });
  await page.locator('.timeline-menu [data-command="nest-clips"]').click();
  const nest = await nestedClip(page);
  await timelineClip(page, nest.layerId).click({ position: { x: 30, y: 8 } });
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([nest.layerId]);
  const rail = page.locator('#rail-right');
  await expect(rail.locator('[data-section="Effects"]')).toBeVisible();
  await expect(rail.locator('[data-section="Speed"]')).toBeVisible();
  // Effects: one tile applies to the nested clip (everything inside).
  await rail.locator('[data-section="Effects"]').click();
  const tile = page.locator('#right-section .fx-tile:not([data-tile="none"])');
  await tile.first().click();
  await expect
    .poll(async () => {
      const clip = await nestedClip(page);
      return (
        (clip.metadata as { fx?: { stack?: unknown[] } }).fx?.stack?.length ?? 0
      );
    })
    .toBe(1);
  // Speed: 2x halves the nested clip; reverse and freeze are not offered.
  await rail.locator('[data-section="Speed"]').click();
  await expect(page.locator('[data-action="right-reverse"]')).toHaveCount(0);
  const before = (await nestedClip(page)).duration;
  await page.locator('#right-section .right-speed [data-speed="2"]').click();
  await expect.poll(async () => (await nestedClip(page)).speed).toBe(2);
  expect((await nestedClip(page)).duration).toBeCloseTo(before / 2, 5);
  // Enter and leave still work.
  await timelineClip(page, nest.layerId).dblclick();
  await expect(page.locator('#nest-bar')).toBeVisible();
  await page.locator('#nest-bar [data-action="nest-exit"]').click();
  await expect(page.locator('#nest-bar')).toBeHidden();
  await page.screenshot({ path: 'reports/final3/a3-nest-speed.png' });
});

test('[FN3-003] an audio clip and a video with sound nest together and still sound while playing', async ({
  page,
  openFixtureProject,
}) => {
  await page.goto('/');
  await openFixtureProject('av-sync.json');
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles(
    ['video_av_sync_flash_beep_720p.webm', 'audio_tone_440hz_3s.wav'].map(
      (name) => path.resolve('tests/fixtures/media', name),
    ),
  );
  await expect(page.locator('#media-import')).toBeHidden();
  const byClip = (id: string) =>
    page.locator(`.timeline-clip[data-clip-id="${id}"]`);
  await byClip('clip-av').click({ position: { x: 30, y: 10 } });
  await byClip('clip-tone').click({
    position: { x: 30, y: 10 },
    modifiers: ['Shift'],
  });
  await byClip('clip-tone').click({
    button: 'right',
    position: { x: 30, y: 10 },
  });
  await page.locator('.timeline-menu [data-command="nest-clips"]').click();
  await expect
    .poll(async () => (await hook(page)).history.labels.at(-1))
    .toBe('Nest clips');
  const nest = await nestedClip(page);
  const inside = (
    nest.metadata as { nested: { clips: { clip: { id: string } }[] } }
  ).nested.clips.map((record) => record.clip.id);
  expect(inside.sort()).toEqual(['clip-av', 'clip-tone']);
  await page.locator('[data-action="play"]').click();
  await expect
    .poll(
      async () =>
        (
          (await page.evaluate(() =>
            (
              window as unknown as {
                __AIVE__: {
                  getMedia(): { audio: { sources: { clipId: string }[] } };
                };
              }
            ).__AIVE__.getMedia(),
          )) as { audio: { sources: { clipId: string }[] } }
        ).audio.sources
          .map((source) => source.clipId)
          .sort(),
      { timeout: 10_000 },
    )
    .toEqual(['clip-av', 'clip-tone']);
  await page.locator('[data-action="play"]').click();
});
