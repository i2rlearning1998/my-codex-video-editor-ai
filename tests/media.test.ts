import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  EditorEngine,
  createComposition,
  createLayer,
  createProject,
  serializeProject,
  vector2,
  type Asset,
  type Command,
} from '../src/core';
import {
  MemoryMediaStore,
  assetFingerprint,
  assetIdFor,
  classifyMedia,
  importMediaFiles,
  mediaFingerprint,
  mediaKey,
  type MediaKind,
} from '../src/media';

const DIR = 'tests/fixtures/media';
const PROJECT = 'tests/fixtures/projects/media-example.json';
const MIME: Record<string, string> = {
  webm: 'video/webm',
  wav: 'audio/wav',
  png: 'image/png',
  jpg: 'image/jpeg',
};
const fixtureFile = (name: string) =>
  new File([readFileSync(`${DIR}/${name}`)], name, {
    type: MIME[name.split('.').pop()!] ?? '',
    lastModified: 0,
  });

describe('[DEV-008] media fixture pack', () => {
  it('matches its manifest byte for byte, with no unlisted files', () => {
    const manifest = JSON.parse(readFileSync(`${DIR}/manifest.json`, 'utf8'));
    const listed = manifest.files.map((item: { file: string }) => item.file);
    expect(
      readdirSync(DIR)
        .filter((name) => name !== 'manifest.json')
        .sort(),
    ).toEqual([...listed].sort());
    for (const item of manifest.files) {
      const bytes = readFileSync(`${DIR}/${item.file}`);
      expect([item.file, bytes.length]).toEqual([item.file, item.bytes]);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        item.sha256,
      );
    }
    // D-017: keep the pack well under the 25 MB git budget.
    const total = manifest.files.reduce(
      (sum: number, item: { bytes: number }) => sum + item.bytes,
      0,
    );
    expect(total).toBeLessThan(5 * 1024 * 1024);
  });

  it('rebuilds the media project fixture through engine commands', async () => {
    // A fixed clock keeps metadata.updatedAt stable across rebuilds.
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-09-24T00:00:00Z'),
    });
    const project = createProject('Media Fixture', '2026-09-24T00:00:00.000Z');
    project.id = 'media-fixture-project';
    project.compositions = [
      createComposition({ id: 'media-main', name: 'Main composition' }),
    ];
    const engine = new EditorEngine(project);
    const media: [string, MediaKind, Partial<Asset>][] = [
      [
        'video_testsrc_720p_2s_vp9_opus.webm',
        'video',
        { width: 1280, height: 720, duration: 2 },
      ],
      ['audio_tone_440hz_3s.wav', 'audio', { duration: 3 }],
      ['image_gradient_1920x1080.png', 'image', { width: 1920, height: 1080 }],
      ['image_testsrc_1200x800.jpg', 'image', { width: 1200, height: 800 }],
    ];
    const assets: Asset[] = [];
    for (const [name, type, probe] of media) {
      const file = fixtureFile(name);
      const fingerprint = await mediaFingerprint(file);
      assets.push({
        id: assetIdFor(fingerprint),
        name,
        type,
        source: { kind: 'local', reference: mediaKey(fingerprint) },
        metadata: {
          mimeType: file.type,
          size: file.size,
          fileName: name,
          lastModified: 0,
          fingerprint,
        },
        ...probe,
      });
    }
    for (const asset of assets)
      engine.commands.transaction('Import media', [
        { type: 'ADD_ASSET', asset },
      ]);
    const compositionId = 'media-main';
    const commands: Command[] = [];
    const track = (
      id: string,
      name: string,
      type: 'video' | 'audio',
      order: number,
    ) =>
      commands.push({
        type: 'CREATE_TRACK',
        compositionId,
        track: {
          id,
          name,
          type,
          order,
          enabled: true,
          locked: false,
          muted: false,
          clips: [],
        },
      });
    track('video-1', 'Video 1', 'video', 0);
    track('audio-1', 'Audio 1', 'audio', 1);
    const place = (
      asset: Asset,
      trackId: string,
      startTime: number,
      duration: number,
    ) => {
      const layer = createLayer(
        `layer-${asset.id}`,
        asset.type as 'video',
        asset.name,
        duration,
      );
      layer.startTime = startTime;
      layer.assetId = asset.id;
      if (asset.width && asset.height) {
        const scale = Math.min(1, 1920 / asset.width, 1080 / asset.height);
        layer.transform.scale = vector2(scale, scale);
        layer.transform.position = vector2(
          (1920 - asset.width * scale) / 2,
          (1080 - asset.height * scale) / 2,
        );
      }
      commands.push(
        { type: 'CREATE_LAYER', compositionId, parentId: null, layer },
        {
          type: 'CREATE_CLIP',
          compositionId,
          trackId,
          clip: {
            id: `clip-${asset.id}`,
            name: asset.name,
            layerId: layer.id,
            assetId: asset.id,
            startTime,
            duration,
            sourceIn: 0,
            sourceOut: duration,
            enabled: true,
            speed: 1,
            transitionMetadata: {},
            effectMetadata: {},
            metadata: {},
          },
        },
      );
    };
    place(assets[0]!, 'video-1', 0, 2);
    place(assets[2]!, 'video-1', 2, 5);
    place(assets[1]!, 'audio-1', 0, 3);
    engine.commands.transaction('Build media fixture', commands);
    const text = `${serializeProject(engine.state)}\n`;
    vi.useRealTimers();
    if (process.env.UPDATE_FIXTURES) writeFileSync(PROJECT, text);
    expect(text).toBe(readFileSync(PROJECT, 'utf8'));
    // References only: no media bytes or data URIs in the project JSON.
    expect(text).not.toMatch(/data:|base64/);
    expect(assets.map(assetFingerprint)).toEqual(
      assets.map((asset) => asset.metadata.fingerprint),
    );
  });
});

describe('[MED-001][MED-003][MED-004][MED-006] import pipeline', () => {
  const probe = async (blob: Blob, kind: MediaKind) => {
    if ((await blob.text()).startsWith('bad')) throw new Error('unreadable');
    return kind === 'image' ? { width: 4, height: 3 } : { duration: 2 };
  };
  const setup = () => {
    const store = new MemoryMediaStore();
    const engine = new EditorEngine(createProject());
    const deps = {
      store,
      probe,
      hasAsset: (id: string) => engine.state.assets.some((a) => a.id === id),
      addAsset: (asset: Asset) =>
        engine.commands.transaction('Import media', [
          { type: 'ADD_ASSET', asset },
        ]),
    };
    return { store, engine, deps };
  };
  it('classifies by MIME type, then extension', () => {
    expect(classifyMedia({ name: 'a.bin', type: 'video/webm' })).toBe('video');
    expect(classifyMedia({ name: 'Clip.MOV', type: '' })).toBe('video');
    expect(classifyMedia({ name: 'song.m4a', type: '' })).toBe('audio');
    expect(classifyMedia({ name: 'logo.svg', type: '' })).toBe('image');
    expect(classifyMedia({ name: 'notes.txt', type: 'text/plain' })).toBe(null);
  });
  it('fingerprints content only: same bytes, same id; different bytes, different id', async () => {
    const a = await mediaFingerprint(
      new File(['abc'], 'x.png', { type: 'image/png' }),
    );
    const b = await mediaFingerprint(
      new File(['abc'], 'y.jpg', { type: 'image/jpeg' }),
    );
    const c = await mediaFingerprint(new File(['abd'], 'x.png'));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    // Samples only: a 3 MiB change in the unsampled region is not read.
    const big = new Uint8Array(8 * 1024 * 1024);
    const before = await mediaFingerprint(new Blob([big]));
    big[2 * 1024 * 1024] = 1;
    expect(await mediaFingerprint(new Blob([big]))).toBe(before);
  });
  it('stores bytes, adds references, skips duplicates and refuses non-media', async () => {
    const { store, engine, deps } = setup();
    const progress: number[] = [];
    const result = await importMediaFiles(
      [
        new File(['video'], 'clip.webm', { type: 'video/webm' }),
        new File(['image'], 'photo.png', { type: 'image/png' }),
        new File(['video'], 'copy.webm', { type: 'video/webm' }),
        new File(['text'], 'notes.txt', { type: 'text/plain' }),
        new File(['bad bytes'], 'broken.mp4', { type: 'video/mp4' }),
      ],
      { ...deps, onProgress: (p) => progress.push(p.index + p.fraction) },
    );
    expect(result.cancelled).toBe(false);
    expect(result.outcomes.map((o) => o.status)).toEqual([
      'imported',
      'imported',
      'duplicate',
      'unsupported',
      'unreadable',
    ]);
    const assets = engine.state.assets;
    expect(assets.map((a) => [a.name, a.type, a.duration ?? a.width])).toEqual([
      ['clip.webm', 'video', 2],
      ['photo.png', 'image', 4],
    ]);
    expect(assets[0]!.source.reference).toMatch(/^media\/[0-9a-f]{32}$/);
    // The unreadable file's bytes were removed; only the two imports remain.
    expect(await store.keys()).toEqual(
      assets.map((a) => a.source.reference).sort(),
    );
    expect(engine.history.undo.map((step) => step.label)).toEqual([
      'Import media',
      'Import media',
    ]);
    // Undo removes the reference but keeps the bytes, so redo works.
    engine.undo();
    expect(engine.state.assets).toHaveLength(1);
    expect(await store.keys()).toHaveLength(2);
    // Progress reached the last file of the batch.
    expect(Math.max(...progress)).toBeGreaterThanOrEqual(4);
  });
  it('cancel removes the current bytes and skips the rest', async () => {
    const { store, engine, deps } = setup();
    const controller = new AbortController();
    const result = await importMediaFiles(
      [
        new File(['one'], 'one.png', { type: 'image/png' }),
        new File(['two'], 'two.png', { type: 'image/png' }),
        new File(['three'], 'three.png', { type: 'image/png' }),
      ],
      {
        ...deps,
        signal: controller.signal,
        probe: async (blob, kind) => {
          if ((await blob.text()) === 'two') controller.abort();
          return probe(blob, kind);
        },
      },
    );
    expect(result.cancelled).toBe(true);
    expect(engine.state.assets.map((a) => a.name)).toEqual(['one.png']);
    expect(await store.keys()).toEqual([
      engine.state.assets[0]!.source.reference,
    ]);
  });
});
