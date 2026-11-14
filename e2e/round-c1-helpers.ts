// ROUND-C1: the proof videos' shared steps. Each video is made through the
// Director flow in AI mode on the offline model, with SCRIPTED answers (the
// plan the model would write) and FAKE providers: a REST stock provider the
// owner adds in Platform Config (no code change), whose files a test route
// serves. Everything after that (search, pick, import, build, controls) is
// the product's own code.
import { readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, hook } from './fixtures';
import { build, startAi, toAssets, toPlan } from './round-b-helpers';
import { defaultConfig, platformConfigSchema } from '../src/platform-config';
import type { MediaItem } from '../src/tools/media';

export const MEDIA_HOST = 'media.fake-provider.test';
export const SHOTS = 'reports/round-c1';
export const BAR_RISE = readFileSync(
  'tests/fixtures/round-c1/bar-rise.block.js',
  'utf8',
);
export const ORBIT_RING = readFileSync(
  'tests/fixtures/round-c1/orbit-ring.free.js',
  'utf8',
);
export const ORBIT_META = {
  id: 'orbit-ring',
  name: 'Orbit ring',
  version: '1.0.0',
  category: 'Motion',
  duration: 4,
  params: [
    { name: 'color', label: 'Colour', type: 'color', default: '#22cc88' },
    {
      name: 'count',
      label: 'Dots',
      type: 'number',
      min: 1,
      max: 40,
      step: 1,
      default: 8,
    },
  ],
};
type Item = Omit<
  MediaItem,
  'provider' | 'providerName' | 'key' | 'kind' | 'mediaType'
>;
const item = (
  id: string,
  title: string,
  file: string,
  w: number,
  h: number,
  duration = 0,
  licence = 'free',
): Item => ({
  id,
  title,
  tags: title.toLowerCase().split(' '),
  thumbnail: `https://${MEDIA_HOST}/thumb/${id}.jpg`,
  preview: `https://${MEDIA_HOST}/page/${id}`,
  download: `https://${MEDIA_HOST}/files/${file}`,
  width: w,
  height: h,
  duration,
  licence,
  attribution: `Fake Stock / photographer ${id}`,
});
/** What the fake REST provider answers (by provider id). */
export const FAKE_MEDIA: Record<string, Item[]> = {
  fakestock: [
    item('river-1', 'river delta aerial footage', 'river.webm', 1280, 720, 2),
    item('fort-1', 'old stone fort history', 'fort.jpg', 1200, 800),
    item('fort-2', 'fort gate history', 'gate.jpg', 1200, 800, 0, 'editorial'),
    item('map-1', 'old map history', 'map.png', 1920, 1080),
    item('city-1', 'city night skyline', 'city.webm', 1280, 720, 2),
  ],
  fakeicons: [
    item('pin', 'map pin icon', 'pin.png', 512, 512),
    item('star', 'star sticker', 'star.png', 512, 512),
  ],
  fakemusic: [
    item('calm', 'calm piano music', 'calm.wav', 0, 0, 3),
    item('beat', 'upbeat pop beat music', 'beat.wav', 0, 0, 3),
  ],
};
const FILES: Record<string, [string, string]> = {
  webm: [
    'tests/fixtures/media/video_testsrc_720p_2s_vp9_opus.webm',
    'video/webm',
  ],
  jpg: ['tests/fixtures/media/image_testsrc_1200x800.jpg', 'image/jpeg'],
  png: ['tests/fixtures/media/image_gradient_1920x1080.png', 'image/png'],
  wav: ['tests/fixtures/media/audio_tone_440hz_3s.wav', 'audio/wav'],
};
const rest = (id: string, name: string, kinds: string[], hint: string) => ({
  id,
  name,
  kinds,
  enabled: true,
  plans: [],
  costPerCall: 0,
  rateLimit: { perMinute: 60 },
  hint: { en: hint, hi: hint },
  licences: [],
  adapter: {
    type: 'rest',
    descriptor: {
      baseUrl: `https://api.${id}.test`,
      searchPath: '/search',
      auth: {
        style: 'header',
        name: 'x-key',
        prefix: '',
        keyRef: `${id.toUpperCase()}_KEY`,
      },
      request: {},
      response: {
        items: 'hits',
        id: 'id',
        title: 'title',
        thumbnail: 'thumb',
        download: 'file',
      },
    },
  },
});
/** The Platform Config the owner published: built-ins off, fake providers on. */
export function proofConfig(edit: (c: Record<string, any>) => void = () => {}) {
  const c = defaultConfig() as unknown as Record<string, any>;
  for (const p of c.mediaProviders) p.enabled = p.id === 'offline-captions';
  c.mediaProviders.push(
    rest(
      'fakestock',
      'Fake Stock',
      ['stock-photo', 'stock-video'],
      'Documentary footage and photos',
    ),
    rest('fakeicons', 'Fake Icons', ['icon', 'sticker'], 'Icons and stickers'),
    rest(
      'fakemusic',
      'Fake Music',
      ['music', 'sound-effect'],
      'Music beds and sounds',
    ),
  );
  c.director.assets.licences = ['free'];
  edit(c);
  return platformConfigSchema.parse(c);
}
/** Puts the config, the scripted answers and the fake files in place. */
export async function stage(page: Page, plan: unknown, config = proofConfig()) {
  const answer = JSON.stringify({ plan, upgrades: [] });
  await page.addInitScript(
    ([cfg, script, media]) => {
      localStorage.setItem(
        'aive.platformConfig',
        JSON.stringify({
          versions: [
            {
              version: 7,
              savedAt: '2026-11-14T00:00:00.000Z',
              note: 'owner',
              config: JSON.parse(cfg),
            },
          ],
          live: 7,
        }),
      );
      const w = window as {
        __AIVE_E2E_PLAN_SCRIPT__?: string[];
        __AIVE_E2E_MEDIA__?: unknown;
        __AIVE_E2E_FREECODE__?: string;
      };
      w.__AIVE_E2E_PLAN_SCRIPT__ = [script];
      w.__AIVE_E2E_MEDIA__ = JSON.parse(media);
      w.__AIVE_E2E_FREECODE__ = 'fake';
    },
    [JSON.stringify(config), answer, JSON.stringify(FAKE_MEDIA)] as const,
  );
  await page.route(`https://${MEDIA_HOST}/**`, (route) => {
    const ext = route.request().url().split('.').pop()!.replace(/\?.*$/, '');
    const [path, type] = FILES[ext] ?? FILES.png!;
    return route.fulfill({
      status: 200,
      contentType: type,
      body: readFileSync(path),
    });
  });
}
/** The whole Director flow: brief, plan (new graphics on the card), approve, build. */
export async function directorBuild(page: Page, message: string) {
  await startAi(page, message);
  await toPlan(page);
  const card = page.locator('#ai-plan-card');
  await expect(card).toBeVisible();
  await expect(card).not.toContainText('"format"'); // no plan JSON
  await expect(card).not.toContainText('render(ctx'); // no code
  const graphics = await card.locator('.ai-plan-graphic').allTextContents();
  await toAssets(page);
  await build(page);
  return graphics;
}
/** Seeks the open scene to a time by clicking the slim timeline. */
export async function seek(page: Page, fraction: number) {
  const track = page.locator('#ai-track');
  const box = (await track.boundingBox())!;
  const before = (await hook(page)).session.time;
  // The track's top padding (above the clips) seeks.
  await page.mouse.click(box.x + box.width * fraction, box.y + 2);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .not.toBe(before);
}
export const canvasSum = (page: Page) =>
  page.locator('#composition-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 53) sum += d[i]! * ((i % 7) + 1);
    return sum;
  });
/** Three screenshots of the open scene and the layer list (names) in a file. */
export async function evidence(page: Page, name: string) {
  const paths: string[] = [];
  for (const [i, f] of [0.15, 0.5, 0.85].entries()) {
    await seek(page, f);
    const p = `${SHOTS}/${name}-t${i + 1}.png`;
    await page.locator('.editor-shell').screenshot({ path: p });
    paths.push(p);
  }
  const h = await hook(page);
  const lines = h.project.compositions.map(
    (s, i) =>
      `Scene ${i + 1}: ${s.name}\n${s.layers.map((l) => `  - ${l.name} (${l.code ? `code, tier ${l.code.tier}` : l.type})`).join('\n')}`,
  );
  writeFileSync(`${SHOTS}/${name}-layers.txt`, `${lines.join('\n')}\n`);
  return paths;
}
