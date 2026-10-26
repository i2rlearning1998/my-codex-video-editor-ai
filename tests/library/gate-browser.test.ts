// Phase 1 library (P1-07): the publish gate with its real headless browser
// (Playwright's Chromium and the editor's own render checks), not a stand-in.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generateKeys } from '../../owner/catalog/keys';
import { publish } from '../../owner/catalog/publish';
import { openGateBrowser } from '../../owner/catalog/browser';
import { fxCatalog } from '../../owner/catalog/sources';
import { readManifest } from '../../owner/catalog/build';
import { categoryIndexSchema } from '../../src/library-client/format';

const root = mkdtempSync(path.join(tmpdir(), 'aive-gate-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const file = (dir: string, name: string) => ({
  name,
  bytes: readFileSync(path.join(dir, name)),
});
const meta = (name: string, id: string) => ({
  name: `${name}.meta.json`,
  bytes: Buffer.from(
    JSON.stringify({
      id,
      name: { en: id, hi: id },
      tags: ['test'],
      license: { name: 'CC0', credit: 'Test fixture' },
    }),
  ),
});

describe('Phase 1 publish gate in headless Chromium', () => {
  it('[LIB-007] render checks pass a good pack and reject a bad one; media get a poster, a proxy and their size', async () => {
    const keys = generateKeys(path.join(root, 'keys'));
    const packs = 'examples/creator-packs';
    const media = 'tests/fixtures/media';
    const result = await publish(
      [
        file(packs, 'shape.json'),
        file(packs, 'theme-sunny.json'),
        file(packs, 'bad-theme-contrast.json'),
        file(media, 'audio_tone_440hz_3s.wav'),
        meta('audio_tone_440hz_3s.wav', 'tone-440'),
        file(media, 'image_testsrc_1200x800.jpg'),
        meta('image_testsrc_1200x800.jpg', 'test-card'),
        file(media, 'video_testsrc_720p_2s_vp9_opus.webm'),
        meta('video_testsrc_720p_2s_vp9_opus.webm', 'test-clip'),
      ],
      {
        dataDir: path.join(root, 'data'),
        outDir: path.join(root, 'out'),
        keys,
        openBrowser: openGateBrowser,
        fxCatalog: fxCatalog(),
        knownLibraryIds: [],
      },
    );
    expect(result.gate.rejected.map((r) => r.file)).toEqual([
      'bad-theme-contrast.json',
    ]);
    expect(result.gate.rejected[0]!.reason).toMatch(/contrast/i);
    expect(result.added.sort()).toEqual(
      [
        'shape-pack-shape-kite',
        'test-card',
        'test-clip',
        'theme-pack-sunny-theme-sunny',
        'tone-440',
      ].sort(),
    );
    const out = path.join(root, 'out');
    const { manifest } = readManifest(out);
    const entries = Object.values(manifest.categories).flatMap(
      (ref) =>
        categoryIndexSchema.parse(
          JSON.parse(readFileSync(path.join(out, ref.url), 'utf8')),
        ).entries,
    );
    const clip = entries.find((e) => e.id === 'test-clip')!;
    expect(clip.media).toMatchObject({ width: 1280, height: 720 });
    expect(clip.media!.poster!.mime).toBe('image/png');
    expect(clip.media!.proxy!.mime).toBe('video/webm');
    expect(clip.media!.proxy!.size).toBeLessThan(clip.media!.full.size);
    const tone = entries.find((e) => e.id === 'tone-440')!;
    expect(tone.media!.duration).toBeCloseTo(3, 1);
    expect(tone.media!.proxy!.mime).toBe('audio/wav');
    const card = entries.find((e) => e.id === 'test-card')!;
    expect(card.media).toMatchObject({ width: 1200, height: 800 });
    expect(card.blur).toMatch(/^data:image\/png;base64,/);
    expect(card.license).toEqual({ name: 'CC0', credit: 'Test fixture' });
  }, 240_000);
});
