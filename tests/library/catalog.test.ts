// Phase 1 library, Part B (P1-04 to P1-10): catalog format, signing, the
// publish gate's reasons, idempotent publish, rollback, the seed and ETags.
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CATALOG_CATEGORIES,
  INLINE_LIMIT,
  categoryIndexSchema,
  signedManifestSchema,
  type CategoryIndex,
} from '../../src/library-client/format';
import { verifyManifest } from '../../src/library-client/verify';
import { generateKeys, sha256Hex, verifyBytes } from '../../owner/catalog/keys';
import { seedCatalog, SEED_TIME } from '../../owner/catalog/seed';
import { defaultSeedSources, fxCatalog } from '../../owner/catalog/sources';
import {
  buildCatalog,
  listVersions,
  readManifest,
  rollbackCatalog,
} from '../../owner/catalog/build';
import { ItemStore } from '../../owner/catalog/store';
import { NO_BROWSER, type GateBrowser } from '../../owner/catalog/gate';
import { publish } from '../../owner/catalog/publish';
import { catalogResponse } from '../../owner/catalog/serve';
import { writeZip } from '../../owner/catalog/zip';

const temps: string[] = [];
const temp = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aive-lib-'));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const sources = defaultSeedSources();
function seeded() {
  const root = temp();
  const keys = generateKeys(path.join(root, 'keys'));
  const dataDir = path.join(root, 'data');
  const outDir = path.join(root, 'out');
  const result = seedCatalog(sources, { dataDir, outDir, keys });
  return { root, keys, dataDir, outDir, result };
}
const index = (outDir: string, category: string): CategoryIndex => {
  const { manifest } = readManifest(outDir);
  const ref = manifest.categories[category as 'elements'];
  return categoryIndexSchema.parse(
    JSON.parse(readFileSync(path.join(outDir, ref.url), 'utf8')),
  );
};
const pack = (name: string) => ({
  name,
  bytes: readFileSync(path.join('examples/creator-packs', name)),
});
/** A stand-in for the headless page: every item and file passes. */
const fakeBrowser = (): Promise<GateBrowser> =>
  Promise.resolve({
    checkItems: (items) =>
      Promise.resolve(
        items.map(() => ({ status: 'ok' as const, reasons: [] })),
      ),
    probeMedia: (_bytes, mime) =>
      Promise.resolve(
        mime.startsWith('audio/')
          ? { ok: true, kind: 'sound' as const, duration: 3 }
          : { ok: false, reason: 'It could not be opened in Chrome (test).' },
      ),
    close: () => Promise.resolve(),
  });

describe('Phase 1 library catalog', () => {
  it('[LIB-004] the seeded catalog has a signed manifest, one index per category, and content-hashed immutable files', () => {
    const { outDir, result } = seeded();
    expect(result.catalogVersion).toBe(1);
    const { signed, manifest } = readManifest(outDir);
    expect(signedManifestSchema.safeParse(signed).success).toBe(true);
    expect(Object.keys(manifest.categories).sort()).toEqual(
      [...CATALOG_CATEGORIES].sort(),
    );
    let total = 0;
    for (const category of CATALOG_CATEGORIES) {
      const ref = manifest.categories[category];
      const text = readFileSync(path.join(outDir, ref.url), 'utf8');
      expect(sha256Hex(text)).toBe(ref.sha256);
      const parsed = index(outDir, category);
      expect(parsed.entries.length).toBe(ref.count);
      total += ref.count;
      for (const entry of parsed.entries) {
        expect(entry.name.en && entry.name.hi).toBeTruthy();
        expect(entry.license.name).toBeTruthy();
        expect(entry.planKey).toBeNull();
        expect(entry.blur).toMatch(/^data:image\//);
        expect(entry.thumbUrl).toMatch(/^files\/[0-9a-f]{64}\.svg$/);
      }
    }
    expect(total).toBe(247);
    // Every file is named by the SHA-256 of its bytes.
    for (const name of readdirSync(path.join(outDir, 'files')))
      expect(sha256Hex(readFileSync(path.join(outDir, 'files', name)))).toBe(
        name.split('.')[0],
      );
    expect(index(outDir, 'templates').taxonomy?.length).toBe(5);
  });

  it('[LIB-005] small items are inlined; sounds carry a waveform poster, a small proxy and the full file', () => {
    const { outDir } = seeded();
    for (const category of ['elements', 'draw', 'text', 'templates', 'styles'])
      for (const entry of index(outDir, category).entries) {
        expect('inline' in entry.payload).toBe(true);
        expect(
          Buffer.byteLength(
            JSON.stringify((entry.payload as { inline: unknown }).inline),
          ),
        ).toBeLessThan(INLINE_LIMIT);
      }
    const sounds = index(outDir, 'audio').entries;
    expect(sounds).toHaveLength(12);
    for (const sound of sounds) {
      expect(sound.kind).toBe('sound');
      expect(sound.media!.poster!.mime).toBe('image/svg+xml');
      expect(sound.media!.proxy!.size).toBeLessThan(sound.media!.full.size);
      expect(sound.media!.full.mime).toBe('audio/wav');
      expect(sound.size).toBe(sound.media!.full.size);
    }
  });

  it('[LIB-006] Ed25519: a good signature is accepted; a wrong byte, a wrong signature or another key is rejected', async () => {
    const { outDir, keys } = seeded();
    const text = readFileSync(path.join(outDir, 'manifest.json'), 'utf8');
    const { signed } = readManifest(outDir);
    expect(verifyBytes(keys.publicKey, signed.signed, signed.signature)).toBe(
      true,
    );
    const manifest = await verifyManifest(text, keys.publicKey);
    expect(manifest.catalogVersion).toBe(1);
    const tampered = JSON.stringify({
      ...signed,
      signed: signed.signed.replace('"catalogVersion":1', '"catalogVersion":9'),
    });
    await expect(verifyManifest(tampered, keys.publicKey)).rejects.toThrow(
      /signature is wrong/,
    );
    const other = generateKeys(path.join(temp(), 'k2'));
    await expect(verifyManifest(text, other.publicKey)).rejects.toThrow(
      /key this editor does not know/,
    );
    await expect(
      verifyManifest(JSON.stringify({ signed: signed.signed }), keys.publicKey),
    ).rejects.toThrow(/no valid signature/);
    await expect(verifyManifest(text, '')).rejects.toThrow(/no catalog key/);
  });

  it('[LIB-007] the gate rejects with one plain sentence per reason, fails closed without a browser, and a second publish is skipped', async () => {
    const { dataDir, outDir, keys } = seeded();
    const base = {
      dataDir,
      outDir,
      keys,
      fxCatalog: fxCatalog(),
      knownLibraryIds: [],
    };
    const first = await publish(
      [
        pack('shape.json'),
        pack('bad-nan.json'),
        pack('bad-missing-field.json'),
        { name: 'notes.pdf', bytes: Buffer.from('%PDF') },
      ],
      { ...base, openBrowser: fakeBrowser },
    );
    expect(first.added).toEqual(
      expect.arrayContaining(['shape-pack-shape-kite']),
    );
    expect(first.gate.rejected.map((r) => r.file)).toEqual(
      expect.arrayContaining([
        'bad-nan.json',
        'bad-missing-field.json',
        'notes.pdf',
      ]),
    );
    for (const rejected of first.gate.rejected) {
      expect(rejected.reason).toMatch(/^[A-Z0-9].*[.)]$/);
      expect(
        rejected.reason.split(/(?<=\.)\s+(?=[A-Z])/).length,
      ).toBeLessThanOrEqual(2);
    }
    expect(first.build?.catalogVersion).toBe(2);
    // Same item, same content: skipped, and no new version.
    const again = await publish([pack('shape.json')], {
      ...base,
      openBrowser: fakeBrowser,
    });
    expect(again.unchanged).toEqual(
      expect.arrayContaining(['shape-pack-shape-kite']),
    );
    expect(again.build?.changed).toBe(false);
    expect(readManifest(outDir).manifest.catalogVersion).toBe(2);
    // No headless browser: nothing is published, with the reason.
    const closed = await publish([pack('text.json')], {
      ...base,
      openBrowser: () => Promise.reject(new Error('no chromium')),
    });
    expect(closed.build).toBeNull();
    expect(closed.gate.rejected.at(-1)!.reason).toBe(NO_BROWSER);
    // Media needs a licence; a zip is unpacked.
    const zip = writeZip([
      {
        name: 'tone.wav',
        bytes: readFileSync('tests/fixtures/media/audio_tone_440hz_3s.wav'),
      },
    ]);
    const media = await publish([{ name: 'upload.zip', bytes: zip }], {
      ...base,
      openBrowser: fakeBrowser,
    });
    expect(media.gate.rejected[0]!.reason).toMatch(/has no licence/);
  });

  it('[LIB-008] rollback re-points the manifest to an older version; old versions stay readable', async () => {
    const { dataDir, outDir, keys } = seeded();
    const store = new ItemStore(dataDir);
    store.find('shape-star-5')!.published = false;
    store.save();
    expect(
      buildCatalog(store, outDir, keys, { now: SEED_TIME }).catalogVersion,
    ).toBe(2);
    expect(
      index(outDir, 'elements').entries.some((e) => e.id === 'shape-star-5'),
    ).toBe(false);
    const result = rollbackCatalog(
      new ItemStore(dataDir),
      outDir,
      keys,
      1,
      SEED_TIME,
    );
    expect(result.catalogVersion).toBe(3);
    const { manifest } = readManifest(outDir);
    expect(manifest.rolledBackTo).toBe(1);
    // It points to version 1's own index files.
    expect(manifest.categories).toEqual(
      readManifest(outDir, 'versions/1.json').manifest.categories,
    );
    expect(listVersions(outDir)).toEqual([1, 2, 3]);
    expect(
      readManifest(outDir, 'versions/2.json').manifest.catalogVersion,
    ).toBe(2);
  });

  it('[LIB-009] the seed is deterministic: two fresh seeds write the same manifest bytes and files', () => {
    const a = seeded();
    const b = temp();
    writeFileSync(path.join(b, 'x'), '');
    const keysDir = path.join(a.root, 'keys');
    const again = seedCatalog(sources, {
      dataDir: path.join(b, 'data'),
      outDir: path.join(b, 'out'),
      keys: { ...a.keys, privateKey: a.keys.privateKey },
    });
    expect(keysDir).toBeTruthy();
    expect(again.catalogVersion).toBe(1);
    expect(readFileSync(path.join(b, 'out/manifest.json'), 'utf8')).toBe(
      readFileSync(path.join(a.outDir, 'manifest.json'), 'utf8'),
    );
    expect(readdirSync(path.join(b, 'out/files')).sort()).toEqual(
      readdirSync(path.join(a.outDir, 'files')).sort(),
    );
  });

  it('[LIB-010][LIB-015] the catalog server: ETag and 304 on manifest.json, immutable files, ranges, GET only, nothing outside the catalog', () => {
    const { outDir } = seeded();
    const first = catalogResponse(outDir, 'GET', '/manifest.json', {});
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-cache');
    const etag = first.headers.etag!;
    expect(
      catalogResponse(outDir, 'GET', '/manifest.json', {
        'if-none-match': etag,
      }).status,
    ).toBe(304);
    const ref = readManifest(outDir).manifest.categories.audio.url;
    const file = catalogResponse(outDir, 'GET', `/${ref}`, {});
    expect(file.headers['cache-control']).toContain('immutable');
    const sound = index(outDir, 'audio').entries[0]!.media!.full;
    const part = catalogResponse(outDir, 'GET', `/${sound.url}`, {
      range: 'bytes=0-43',
    });
    expect(part.status).toBe(206);
    expect(part.body!.length).toBe(44);
    expect(catalogResponse(outDir, 'POST', '/manifest.json', {}).status).toBe(
      405,
    );
    expect(
      catalogResponse(outDir, 'GET', '/../data/items.json', {}).status,
    ).toBe(404);
    expect(
      catalogResponse(outDir, 'GET', '/files/%2e%2e%2fitems.json', {}).status,
    ).toBe(404);
  });
});
