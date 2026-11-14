// ROUND-C1 proof videos (the heart of the round): four videos built through
// the Director flow in AI mode on the offline model with scripted answers
// and fake providers, with zero hand-editing; each is then edited layer by
// layer: a controller of a new graphic is dragged (one undo step), Undo.
import { test, expect, hook } from './fixtures';
import { selectLayer } from './round-b-helpers';
import {
  BAR_RISE,
  ORBIT_META,
  ORBIT_RING,
  SHOTS,
  canvasSum,
  directorBuild,
  evidence,
  stage,
} from './round-c1-helpers';

const scene = (
  id: string,
  title: string,
  narration: string,
  layers: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  title,
  narration,
  durationHint: 5,
  notes: 'method:motion-graphics;source:ai',
  layers,
  ...extra,
});

/** Drags a number controller of the selected code layer; one step; Undo restores. */
async function dragController(
  page: import('@playwright/test').Page,
  param: string,
  shot: string,
) {
  await page.locator('[data-ai-tab="controls"]').click();
  const own = page.locator('#ai-own-controls');
  await expect(own).toBeVisible();
  const code = async () => {
    const h = await hook(page);
    const id = h.session.selectedIds[0];
    return h.project.compositions
      .flatMap((s) => s.layers)
      .find((l) => l.id === id)!.code!;
  };
  const before = await code();
  const steps = (await hook(page)).history.labels.length;
  const pixels = await canvasSum(page);
  const slider = own.locator(`#code-setting-${param}-slider`);
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {
    steps: 6,
  });
  expect((await hook(page)).history.labels.length).toBe(steps);
  await page.mouse.up();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps + 1);
  expect((await code()).params[param]).not.toEqual(before.params[param]);
  await expect.poll(() => canvasSum(page)).not.toBe(pixels);
  await page
    .locator('.editor-shell')
    .screenshot({ path: `${SHOTS}/${shot}-controller.png` });
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await code()).params[param])
    .toEqual(before.params[param]);
}

test('[RDC1-050] proof 1, explainer: two NEW code graphics (Tier B and Tier C) reused in two scenes, narration and captions, built by Director with no hand edits; a controller drag is one undo step', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const plan = {
    format: 'video-plan',
    version: 4,
    meta: {
      title: 'How rivers carve valleys',
      language: 'en',
      aspect: '16:9',
      videoType: 'explainer',
    },
    feel: {
      palette: { background: '#0e1b2c', text: '#ffffff', accent: '#ffb703' },
    },
    captions: { enabled: true, style: 'bold-box' },
    defs: {
      blocks: [
        {
          id: 'bar-rise',
          tier: 'B',
          source: BAR_RISE,
          summary: 'Bars rise one by one to compare erosion.',
        },
        {
          id: 'orbit-ring',
          tier: 'C',
          source: ORBIT_RING,
          meta: ORBIT_META,
          summary: 'Water droplets circling a ring.',
        },
      ],
    },
    scenes: [
      scene(
        'open',
        'Water moves',
        'Every river starts as a few drops of rain.',
        [
          {
            id: 'title',
            kind: 'title',
            text: 'How rivers carve valleys',
            anchor: 'top',
          },
          {
            id: 'drops',
            kind: 'block',
            block: 'orbit-ring',
            params: { count: 10, color: '#4cc9f0' },
          },
        ],
      ),
      scene(
        'erode',
        'Erosion',
        'Year after year the water cuts deeper into the rock.',
        [
          {
            id: 'bars',
            kind: 'block',
            block: 'bar-rise',
            params: { bars: 6 },
            name: 'Erosion bars',
          },
          {
            id: 'label',
            kind: 'text',
            text: 'Deeper every year',
            anchor: 'bottom',
          },
        ],
      ),
      scene('valley', 'The valley', 'Slowly, a whole valley appears.', [
        {
          id: 'bars2',
          kind: 'block',
          block: 'bar-rise',
          params: { bars: 10, color: '#06d6a0' },
        },
        { id: 'drops2', kind: 'block', block: 'orbit-ring' },
      ]),
    ],
  };
  await stage(page, plan);
  const graphics = await directorBuild(
    page,
    'Explain how rivers carve valleys, 1 minute, in English',
  );
  expect(graphics.join('\n')).toMatch(
    /New graphic\s*Rising bars\s*Bars rise one by one/,
  );
  expect(graphics.join('\n')).toMatch(/New graphic\s*Orbit ring/);
  const h = await hook(page);
  const all = h.project.compositions.flatMap((s) => s.layers);
  expect(all.filter((l) => l.code?.tier === 'B').length).toBe(2);
  expect(all.filter((l) => l.code?.tier === 'C').length).toBe(2);
  expect(all.some((l) => /caption/i.test(l.name))).toBe(true);
  await evidence(page, 'proof1-explainer');
  // The graphics are in the Project's AI library (kit) for reuse.
  await page.locator('#ai-ribbon .ai-scene').nth(1).click();
  await expect
    .poll(async () => (await hook(page)).session.compositionId)
    .toBe(h.project.compositions[1]!.id);
  await selectLayer(page, /Erosion bars/);
  await dragController(page, 'bars', 'proof1-explainer');
  // Offline: redrawing a graphic needs the real model, said in one sentence;
  // a change of its own settings still works as one proposal and one step.
  const { say, lastDirector, openProposal } = await import('./round-b-helpers');
  await say(page, 'make a new graphic here');
  await expect(lastDirector(page)).toContainText(
    'needs the real Director model',
  );
  const steps = (await hook(page)).history.labels.length;
  await say(page, 'make it faster');
  await expect(openProposal(page)).toBeVisible();
  await openProposal(page).locator('button.primary').first().click();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps + 1);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps);
  await page.keyboard.press('Control+y');
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps + 1);
});

const clipOf = async (page: import('@playwright/test').Page, layerId: string) =>
  (await hook(page)).project.compositions
    .flatMap((s) => s.tracks.flatMap((t) => t.clips))
    .find((c) => c.layerId === layerId)!;
const layersOf = async (page: import('@playwright/test').Page) =>
  (await hook(page)).project.compositions.flatMap((s) => s.layers);

test('[RDC1-051] proof 2, documentary: footage and photos from a REST provider the owner added in config, icons, a music bed, effects and a colour grade on footage, lower thirds and captions; all picked by Director', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const plan = {
    format: 'video-plan',
    version: 4,
    meta: {
      title: 'The old fort',
      language: 'en',
      aspect: '16:9',
      videoType: 'documentary',
      assets: { order: ['mine', 'library', 'stock'] },
    },
    captions: { enabled: true, style: 'lower-third' },
    music: { query: 'calm piano', volume: 0.3, ducking: true },
    scenes: [
      scene(
        'river',
        'The river',
        'The fort was built where the river meets the plain.',
        [
          {
            id: 'footage',
            kind: 'media',
            size: 'full',
            name: 'River footage',
            duration: 2,
            mediaIntent: { query: 'river delta', type: 'video' },
            fx: [{ id: 'filter.golden-hour' }],
            grade: { contrast: 25, saturation: -15 },
          },
          {
            id: 'who',
            kind: 'kit',
            kit: 'lower-third-1',
            text: 'The river|Lifeline of the fort',
            enter: 'slide-right',
          },
        ],
        { notes: 'method:stock;source:stock' },
      ),
      scene(
        'walls',
        'The walls',
        'Its stone walls have stood for four hundred years.',
        [
          {
            id: 'wall',
            kind: 'media',
            size: 'full',
            fit: 'fill',
            mediaIntent: { query: 'fort', type: 'photo' },
            grade: { exposure: -10, temperature: 20 },
          },
          {
            id: 'pin',
            kind: 'media',
            size: 'small',
            anchor: 'top-right',
            mediaIntent: { query: 'map pin', type: 'icon' },
          },
          {
            id: 'dust',
            kind: 'block',
            block: 'dust',
            params: { count: 40 },
            name: 'Dust in the light',
          },
        ],
        { notes: 'method:stock;source:stock' },
      ),
    ],
  };
  await stage(page, plan);
  await directorBuild(
    page,
    'Make a documentary about the old fort, 1 minute, in English',
  );
  const layers = await layersOf(page);
  const footage = layers.find((l) => l.name === 'River footage')!;
  expect(footage.type).toBe('video');
  const fx = (await clipOf(page, footage.id)).metadata.fx as {
    stack: { id: string }[];
  };
  expect(fx.stack.map((e) => e.id)).toEqual([
    'filter.golden-hour',
    'adjust.contrast',
    'adjust.saturation',
  ]);
  const assets = (await hook(page)).project.assets;
  // Picked by Director from the owner's REST provider; the editorial-only gate photo was not taken.
  expect(assets.map((a) => a.name).join('|')).toMatch(
    /river delta aerial footage/,
  );
  expect(assets.map((a) => a.name).join('|')).toMatch(/old stone fort history/);
  expect(assets.map((a) => a.name).join('|')).not.toMatch(/fort gate/);
  expect(
    assets.some((a) => a.type === 'audio' && /calm piano/.test(a.name)),
  ).toBe(true);
  expect(layers.some((l) => /caption/i.test(l.name))).toBe(true);
  await evidence(page, 'proof2-documentary');
  await page.locator('#ai-ribbon .ai-scene').nth(1).click();
  await selectLayer(page, /Dust in the light/);
  await dragController(page, 'count', 'proof2-documentary');
});

test('[RDC1-052] proof 3, reel: kinetic text, effects, a faster clip, a pixel transition and music, 9:16', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const plan = {
    format: 'video-plan',
    version: 4,
    meta: {
      title: 'City nights',
      language: 'en',
      aspect: '9:16',
      videoType: 'short',
    },
    captions: { enabled: false },
    music: { query: 'upbeat beat', volume: 0.5 },
    scenes: [
      scene(
        'hook',
        'Hook',
        'City nights.',
        [
          {
            id: 'city',
            kind: 'media',
            size: 'full',
            fit: 'fill',
            duration: 1,
            mediaIntent: { query: 'city night', type: 'video' },
            speed: 2,
            fx: [{ id: 'effect.glow' }, { id: 'filter.vibrant-vlogger' }],
          },
          {
            id: 'kinetic',
            kind: 'block',
            block: 'kinetic-letters',
            params: { text: 'CITY NIGHTS' },
            name: 'Kinetic title',
          },
        ],
        {
          transitionOut: { type: 'transition.zoom', duration: 0.5 },
          durationHint: 3,
        },
      ),
      scene(
        'star',
        'Star',
        'Tonight.',
        [
          {
            id: 'sticker',
            kind: 'media',
            size: 'small',
            anchor: 'center',
            mediaIntent: { query: 'star', type: 'sticker' },
            keyframes: [
              { property: 'rotation', at: 0, value: 0 },
              { property: 'rotation', at: 2, value: 180 },
            ],
          },
          {
            id: 'tag',
            kind: 'title',
            text: 'Tonight.',
            anchor: 'bottom',
            enter: 'pop',
          },
        ],
        { durationHint: 3 },
      ),
    ],
  };
  await stage(page, plan);
  await directorBuild(
    page,
    'Make a short reel about city nights, in English, 30 seconds',
  );
  const h = await hook(page);
  expect(h.project.compositions[0]!.height).toBeGreaterThan(
    h.project.compositions[0]!.width,
  );
  const city = h.project.compositions[0]!.layers.find(
    (l) => l.type === 'video' && !l.code,
  )!;
  const clip = await clipOf(page, city.id);
  expect(clip.speed).toBe(2);
  expect(
    (clip.metadata.fx as { stack: { id: string }[] }).stack.map((e) => e.id),
  ).toEqual(['effect.glow', 'filter.vibrant-vlogger']);
  expect(
    h.project.compositions[1]!.markers.some((m) =>
      /transition\.zoom/.test(m.label),
    ),
  ).toBe(true);
  expect(
    h.project.assets.some((a) => a.type === 'audio' && /upbeat/.test(a.name)),
  ).toBe(true);
  await evidence(page, 'proof3-reel');
  await selectLayer(page, /Kinetic title/);
  await dragController(page, 'stagger', 'proof3-reel');
});

test("[RDC1-053] proof 4, recorded-video enhance: the person's own clip (by name), captions, zoom keyframes, a lower third and a chroma-keyed overlay", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const plan = {
    format: 'video-plan',
    version: 4,
    meta: {
      title: 'My talk, enhanced',
      language: 'en',
      aspect: '16:9',
      videoType: 'recording',
      assets: { order: ['mine', 'stock'] },
    },
    captions: { enabled: true, style: 'bold-box' },
    scenes: [
      scene(
        'talk',
        'The talk',
        'Welcome to my talk about rivers.',
        [
          {
            id: 'rec',
            kind: 'media',
            size: 'full',
            name: 'My recording',
            duration: 2,
            mediaIntent: { query: 'talk recording', type: 'video' },
            keyframes: [
              { property: 'scale', at: 0, value: 1 },
              { property: 'scale', at: 1.5, value: 1.2, easing: 'ease-in-out' },
            ],
          },
          {
            id: 'name',
            kind: 'kit',
            kit: 'lower-third-2',
            text: 'Asha Rao|River scientist',
          },
          {
            id: 'overlay',
            kind: 'media',
            size: 'small',
            anchor: 'top-left',
            name: 'Map overlay',
            mediaIntent: { query: 'old map', type: 'photo' },
            chromaKey: { color: '#00ff00', similarity: 0.3 },
          },
          {
            id: 'mark',
            kind: 'block',
            block: 'ink-mark',
            params: { kind: 'circle', size: 30 },
            name: 'Ink circle',
          },
        ],
        { notes: 'method:motion-graphics;source:mine' },
      ),
    ],
  };
  await stage(page, plan);
  const { startAi, toPlan, toAssets, build } =
    await import('./round-b-helpers');
  await startAi(
    page,
    'Enhance my recording of my talk with captions and a lower third, in English',
  );
  // The person attaches their own recording in the message box (the Brief asks for it).
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#ai-attach').click(),
  ]);
  await chooser.setFiles({
    name: 'talk-recording.webm',
    mimeType: 'video/webm',
    buffer: (await import('node:fs')).readFileSync(
      'tests/fixtures/media/video_testsrc_720p_2s_vp9_opus.webm',
    ),
  });
  await page.locator('#ai-send').click();
  await expect
    .poll(async () => (await hook(page)).project.assets.length)
    .toBeGreaterThan(0);
  await toPlan(page);
  await toAssets(page);
  await build(page);
  const layers = await layersOf(page);
  const rec = layers.find((l) => l.name === 'My recording')!;
  const asset = (await hook(page)).project.assets.find(
    (a) => a.id === rec.assetId,
  )!;
  expect(asset.name).toMatch(/talk-recording/);
  expect(rec.transform.scale.animated).toBe(true);
  expect(layers.find((l) => l.name === 'Map overlay')!.chromaKey?.color).toBe(
    '#00ff00',
  );
  expect(layers.some((l) => /caption/i.test(l.name))).toBe(true);
  await evidence(page, 'proof4-recording');
  await selectLayer(page, /Ink circle/);
  await dragController(page, 'size', 'proof4-recording');
});
