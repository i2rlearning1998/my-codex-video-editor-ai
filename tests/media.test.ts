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

  it('rebuilds the media project fixtures through engine commands', async () => {
    await buildFixture({
      file: PROJECT,
      name: 'Media Fixture',
      id: 'media-fixture-project',
      composition: {
        id: 'media-main',
        width: 1920,
        height: 1080,
        duration: 10,
      },
      media: [
        [
          'video_testsrc_720p_2s_vp9_opus.webm',
          'video',
          { width: 1280, height: 720, duration: 2 },
        ],
        ['audio_tone_440hz_3s.wav', 'audio', { duration: 3 }],
        [
          'image_gradient_1920x1080.png',
          'image',
          { width: 1920, height: 1080 },
        ],
        ['image_testsrc_1200x800.jpg', 'image', { width: 1200, height: 800 }],
      ],
      tracks: [
        ['video-1', 'Video 1', 'video'],
        ['audio-1', 'Audio 1', 'audio'],
      ],
      clips: [
        { asset: 0, track: 'video-1', start: 0, duration: 2, fit: true },
        { asset: 2, track: 'video-1', start: 2, duration: 5, fit: true },
        { asset: 1, track: 'audio-1', start: 0, duration: 3 },
      ],
    });
    // W4-B: the frame-code video fills a 1280x720 frame (scale 4) from 1 s to 4 s,
    // showing source 0.5..3.5 s; Video 2 is an empty overlay track.
    await buildFixture({
      file: 'tests/fixtures/projects/frame-code.json',
      name: 'Frame Code Fixture',
      id: 'frame-code-project',
      // The e2e artboard helper finds the composition by this background colour.
      background: '#f0eee7',
      composition: { id: 'code-main', width: 1280, height: 720, duration: 10 },
      media: [
        [
          'video_frame_code_320x180_4s.webm',
          'video',
          { width: 320, height: 180, duration: 4 },
        ],
      ],
      tracks: [
        ['video-1', 'Video 1', 'video'],
        ['video-2', 'Video 2', 'video'],
      ],
      clips: [
        {
          asset: 0,
          track: 'video-1',
          start: 1,
          duration: 3,
          sourceIn: 0.5,
          scale: 4,
          id: 'code',
        },
      ],
    });
    // W4-C: the A/V sync clip (flash and beep at each whole second) on Video 1 from
    // 0 to 4 s, and a 440 Hz tone on Audio 1 from 0 to 3 s.
    await buildFixture({
      file: 'tests/fixtures/projects/av-sync.json',
      name: 'AV Sync Fixture',
      id: 'av-sync-project',
      background: '#f0eee7',
      composition: { id: 'av-main', width: 1280, height: 720, duration: 10 },
      media: [
        [
          'video_av_sync_flash_beep_720p.webm',
          'video',
          { width: 1280, height: 720, duration: 4 },
        ],
        ['audio_tone_440hz_3s.wav', 'audio', { duration: 3 }],
      ],
      tracks: [
        ['video-1', 'Video 1', 'video'],
        ['audio-1', 'Audio 1', 'audio'],
      ],
      clips: [
        { asset: 0, track: 'video-1', start: 0, duration: 4, id: 'av' },
        { asset: 1, track: 'audio-1', start: 0, duration: 3, id: 'tone' },
      ],
    });
  });
});

interface FixturePlan {
  file: string;
  background?: string;
  name: string;
  id: string;
  composition: { id: string; width: number; height: number; duration: number };
  media: [string, MediaKind, Partial<Asset>][];
  tracks: [string, string, 'video' | 'audio'][];
  clips: {
    asset: number;
    track: string;
    start: number;
    duration: number;
    sourceIn?: number;
    fit?: boolean;
    scale?: number;
    id?: string;
  }[];
}
async function buildFixture(plan: FixturePlan) {
  // A fixed clock keeps metadata.updatedAt stable across rebuilds.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-24T00:00:00Z') });
  try {
    const project = createProject(plan.name, '2026-09-24T00:00:00.000Z');
    project.id = plan.id;
    if (plan.background) project.settings.backgroundColor = plan.background;
    project.compositions = [
      createComposition({ ...plan.composition, name: 'Main composition' }),
    ];
    const engine = new EditorEngine(project);
    const assets: Asset[] = [];
    for (const [name, type, probe] of plan.media) {
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
    const compositionId = plan.composition.id;
    const commands: Command[] = plan.tracks.map(([id, name, type], order) => ({
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
    }));
    const { width: W, height: H } = plan.composition;
    for (const item of plan.clips) {
      const asset = assets[item.asset]!;
      const key = item.id ?? asset.id;
      const layer = createLayer(
        `layer-${key}`,
        asset.type as 'video',
        asset.name,
        item.duration,
      );
      layer.startTime = item.start;
      layer.assetId = asset.id;
      if (asset.width && asset.height && (item.fit || item.scale)) {
        const scale =
          item.scale ?? Math.min(1, W / asset.width, H / asset.height);
        layer.transform.scale = vector2(scale, scale);
        layer.transform.position = vector2(
          (W - asset.width * scale) / 2,
          (H - asset.height * scale) / 2,
        );
      }
      const sourceIn = item.sourceIn ?? 0;
      commands.push(
        { type: 'CREATE_LAYER', compositionId, parentId: null, layer },
        {
          type: 'CREATE_CLIP',
          compositionId,
          trackId: item.track,
          clip: {
            id: `clip-${key}`,
            name: asset.name,
            layerId: layer.id,
            assetId: asset.id,
            startTime: item.start,
            duration: item.duration,
            sourceIn,
            sourceOut: sourceIn + item.duration,
            enabled: true,
            speed: 1,
            transitionMetadata: {},
            effectMetadata: {},
            metadata: {},
          },
        },
      );
    }
    engine.commands.transaction('Build media fixture', commands);
    const text = `${serializeProject(engine.state)}\n`;
    if (process.env.UPDATE_FIXTURES) writeFileSync(plan.file, text);
    expect(text).toBe(readFileSync(plan.file, 'utf8'));
    // References only: no media bytes or data URIs in the project JSON.
    expect(text).not.toMatch(/data:|base64/);
    expect(assets.map(assetFingerprint)).toEqual(
      assets.map((asset) => asset.metadata.fingerprint),
    );
  } finally {
    vi.useRealTimers();
  }
}

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

describe('[AUD-005][PB-010] audio scheduling maths', () => {
  const clip = {
    clipId: 'c',
    trackId: 't',
    sourceAssetId: 'a',
    startTime: 2,
    duration: 3,
    sourceIn: 1,
    sourceOut: 4,
    speed: 1,
    reversed: false,
  };
  it('starts later clips in the future and running clips at their offset', async () => {
    const { clipSchedule } = await import('../src/media');
    expect(clipSchedule(clip, 0, 10)).toEqual({
      delay: 2,
      offset: 1,
      length: 3,
    });
    expect(clipSchedule(clip, 3.5, 10)).toEqual({
      delay: 0,
      offset: 2.5,
      length: 1.5,
    });
    expect(clipSchedule(clip, 5, 10)).toBeNull();
  });
  it('reads reversed clips from a reversed buffer and scales by speed', async () => {
    const { clipSchedule } = await import('../src/media');
    // Reversed: at local 0 the source is 4 s, which is 10 - 4 = 6 s into the reversed copy.
    expect(clipSchedule({ ...clip, reversed: true }, 2, 10)).toEqual({
      delay: 0,
      offset: 6,
      length: 3,
    });
    // 2x: local 1 s reads source 1 + 2 = 3 s; 2 s of clip time = 4 s of source, capped by the buffer.
    expect(
      clipSchedule(
        { ...clip, speed: 2, duration: 1.5, sourceOut: 4 },
        2.5,
        3.5,
      ),
    ).toEqual({ delay: 0, offset: 2, length: 1.5 });
  });
  it('waveform peaks keep the loudest sample per 10 ms across channels', async () => {
    const { waveformPeaks } = await import('../src/media');
    const left = new Float32Array(200).fill(0.1);
    const right = new Float32Array(200);
    right[150] = -1;
    const peaks = waveformPeaks({
      duration: 0.02,
      sampleRate: 10_000,
      numberOfChannels: 2,
      getChannelData: (channel) => (channel ? right : left),
    });
    expect([...peaks]).toEqual([26, 255]);
  });
});
