import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clipSourceDuration,
  clipTrimBounds,
  createProject,
  deserializeProject,
  EditorEngine,
  serializeProject,
  validateProject,
} from '../src/core';
import { compileBlock } from '../src/blocks/sandbox/compile';
import { CodeBaker } from '../src/code-layer/baker';
import { FrameCache, frameKey, type FrameCodec } from '../src/code-layer/cache';
import { codeLayerCommands, codeRecord } from '../src/code-layer/layer';
import {
  blockMeta,
  bakeKeyOf,
  cacheKeyOf,
  codeParams,
  frameAt,
  frameCount,
} from '../src/code-layer/meta';
import { MemoryMediaStore } from '../src/media/store';
import type { FreeCodeSession } from '../src/code-layer/runtime-types';

const PULSE = readFileSync('tests/fixtures/code/pulse-block.js', 'utf8');
const FILE = 'tests/fixtures/projects/code-layer.json';

const pulse = () => {
  const compiled = compileBlock(PULSE);
  if (!compiled.ok) throw new Error(compiled.error);
  return {
    tier: 'B' as const,
    source: PULSE,
    meta: blockMeta(compiled.value.info) as unknown as Record<string, unknown>,
    params: { color: '#ff3366', radius: 120 },
  };
};

/** Bitmaps stand-ins (jsdom has no ImageBitmap). */
const bitmap = (frame: number) =>
  ({ width: 4, height: 2, frame, close() {} }) as unknown as ImageBitmap;
const codec: FrameCodec = {
  encode: async (image) =>
    new Blob([String((image as unknown as { frame: number }).frame)]),
  decode: async (blob) => bitmap(Number(await blob.text())),
};

describe('X1 code layers', () => {
  it('[DEV-008] schema 8: a v7 file migrates with nothing else changed', () => {
    const text = readFileSync(
      'tests/fixtures/projects/v7-rotated.json',
      'utf8',
    );
    const before = JSON.parse(text) as Record<string, unknown>;
    expect(before.schemaVersion).toBe(7);
    const migrated = deserializeProject(text);
    expect(migrated.schemaVersion).toBe(8);
    expect({ ...migrated, schemaVersion: 7 }).toEqual(before);
  });

  it('[DEV-008] the code field is validated and only a media-less video layer holds it', () => {
    const engine = new EditorEngine(createProject('Code'));
    const composition = engine.state.compositions[0]!;
    const built = codeLayerCommands(composition, pulse(), 1);
    engine.commands.transaction('Add code animation', built.commands);
    const layer = engine.state.compositions[0]!.layers.find(
      (item) => item.id === built.layerId,
    )!;
    expect(layer.type).toBe('video');
    expect(layer.assetId).toBeNull();
    expect(layer.code?.tier).toBe('B');
    expect(layer.code?.bakeKey).toMatch(/^[a-z0-9]{28}$/);
    // The clip sits on a new visual lane at the top of the visual group.
    const track = engine.state.compositions[0]!.tracks.find((item) =>
      item.clips.some((clip) => clip.layerId === built.layerId),
    )!;
    expect(track.type).toBe('video');
    expect(track.clips[0]!.startTime).toBe(1);
    expect(track.clips[0]!.duration).toBe(2);
    // One undo step removes everything.
    engine.undo();
    expect(engine.state.compositions[0]!.layers).toHaveLength(0);
    engine.redo();
    // A code field on an image layer, or with a bad key, is refused.
    const bad = structuredClone(engine.state) as unknown as {
      compositions: { layers: { type: string; code: { bakeKey: string } }[] }[];
    };
    bad.compositions[0]!.layers[0]!.type = 'image';
    expect(() => validateProject(bad)).toThrow();
    const badKey = structuredClone(engine.state) as unknown as typeof bad;
    badKey.compositions[0]!.layers[0]!.code.bakeKey = 'NOT A KEY';
    expect(() => validateProject(badKey)).toThrow();
  });

  it('[DEV-008] SET_LAYER_CODE changes params and the bake key in one step', () => {
    const engine = new EditorEngine(createProject('Code'));
    const composition = engine.state.compositions[0]!;
    const built = codeLayerCommands(composition, pulse(), 0);
    engine.commands.transaction('Add code animation', built.commands);
    const first = engine.state.compositions[0]!.layers[0]!.code!.bakeKey;
    const changed = codeRecord({
      ...pulse(),
      params: { color: '#00ff00', radius: 50 },
    });
    expect(changed.bakeKey).not.toBe(first);
    engine.commands.transaction('Animation settings', [
      {
        type: 'SET_LAYER_CODE',
        compositionId: composition.id,
        layerId: built.layerId,
        code: changed,
      },
    ]);
    expect(
      (engine.state.compositions[0]!.layers[0]!.code as { params: unknown })
        .params,
    ).toEqual({
      color: '#00ff00',
      radius: 50,
    });
    engine.undo();
    expect(engine.state.compositions[0]!.layers[0]!.code!.bakeKey).toBe(first);
    // Code on a layer with media is refused.
    expect(() =>
      engine.commands.transaction('x', [
        {
          type: 'SET_LAYER_CODE',
          compositionId: composition.id,
          layerId: 'missing',
          code: changed,
        },
      ]),
    ).toThrow();
  });

  it('[TL-018] a code clip trims no further than its animation', () => {
    const engine = new EditorEngine(createProject('Code'));
    const composition = engine.state.compositions[0]!;
    const built = codeLayerCommands(composition, pulse(), 0);
    engine.commands.transaction('Add code animation', built.commands);
    const state = engine.state.compositions[0]!;
    const clip = state.tracks.flatMap((track) => track.clips)[0]!;
    expect(clipSourceDuration(state, engine.state.assets, clip)).toBe(2);
    expect(
      clipTrimBounds(state, clip.id, clipSourceDuration(state, [], clip))
        .maxEnd,
    ).toBe(2);
  });

  it('[EXP-007] keys: params change the bake key; size, rate and quality the cache key', () => {
    const a = pulse();
    expect(bakeKeyOf(a)).toBe(bakeKeyOf(structuredClone(a)));
    expect(bakeKeyOf({ ...a, params: { ...a.params, radius: 121 } })).not.toBe(
      bakeKeyOf(a),
    );
    // A missing param reads as its default, so the key is the same.
    expect(bakeKeyOf({ ...a, params: { color: '#ff3366' } })).toBe(
      bakeKeyOf(a),
    );
    expect(codeParams({ ...a, params: {} })).toEqual({
      color: '#ff3366',
      radius: 120,
    });
    const key = bakeKeyOf(a);
    const full = cacheKeyOf(key, 1920, 1080, 30, 'full');
    expect(full).not.toBe(cacheKeyOf(key, 1920, 1080, 30, 'draft'));
    expect(full).not.toBe(cacheKeyOf(key, 1280, 720, 30, 'full'));
    expect(full).not.toBe(cacheKeyOf(key, 1920, 1080, 25, 'full'));
    expect(frameKey(full, 299)).toMatch(/^codeframes\/[a-z0-9]+-299$/);
    expect(frameCount(2, 30)).toBe(60);
    expect(frameAt(1.999, 30, 60)).toBe(59);
    expect(frameAt(5, 30, 60)).toBe(59);
    expect(frameAt(1 / 30, 30, 60)).toBe(1);
  });

  it('[EXP-007] the frame cache stores frames in order, survives a reload and evicts LRU', async () => {
    const store = new MemoryMediaStore();
    let clock = 0;
    const cache = new FrameCache(Promise.resolve(store), codec, {
      memoryBudget: 4 * 2 * 4 * 3, // three frames
      diskBudget: 4,
      now: () => clock,
    });
    for (let frame = 0; frame < 5; frame++)
      await cache.put('keya', frame, bitmap(frame), 5);
    expect(cache.complete('keya')).toBe(true);
    expect(cache.memoryBytes).toBe(4 * 2 * 4 * 3);
    // Frame 0 left memory but loads back from the store.
    expect(cache.get('keya', 0)).toBeNull();
    const loaded = await cache.load('keya', 0);
    expect((loaded as unknown as { frame: number }).frame).toBe(0);
    clock = 10;
    await cache.put('keyb', 0, bitmap(7), 2);
    // A new cache over the same store reads the index.
    const again = new FrameCache(Promise.resolve(store), codec, {
      diskBudget: 4,
      now: () => clock,
    });
    await again.ready();
    expect(again.stored('keya')).toBe(5);
    expect(again.stored('keyb')).toBe(1);
    // Over budget (4 bytes): the least recently used key goes, unless kept.
    expect(await again.evict(new Set(['keya']))).toEqual(['keyb']);
    expect(await again.evict()).toEqual(['keya']);
    expect(await store.has(frameKey('keya', 0))).toBe(false);
  });

  it('[EXP-007] the baker renders frames in order, cancels, resumes and reports errors', async () => {
    const store = new MemoryMediaStore();
    const cache = new FrameCache(Promise.resolve(store), codec);
    const asked: number[] = [];
    let fail = false;
    let gate: (() => void) | null = null;
    const opener = async (): Promise<FreeCodeSession> => ({
      meta: { seekable: false } as FreeCodeSession['meta'],
      async renderFrame(frame) {
        asked.push(frame);
        if (fail) throw new Error('boom at frame ' + frame);
        if (frame === 2 && gate === null)
          await new Promise<void>((resolve) => (gate = resolve));
        return bitmap(frame);
      },
      thumbnail: async () => bitmap(0),
      dispose() {},
    });
    const baker = new CodeBaker(cache, opener);
    const spec = {
      cacheKey: 'keyc',
      tier: 'C' as const,
      source: 'x',
      frames: 4,
      width: 4,
      height: 2,
      fps: 30,
      duration: 4 / 30,
      params: {},
      seed: 1,
    };
    baker.ensure(spec);
    await expect.poll(() => asked.length).toBe(3);
    baker.cancel('keyc');
    gate!();
    await expect.poll(() => baker.job('keyc')?.state).toBe('cancelled');
    expect(cache.stored('keyc')).toBe(2);
    // A cancelled key stays put unless resumed; a stateful bake replays from 0.
    expect(baker.ensure(spec).state).toBe('cancelled');
    asked.length = 0;
    await baker.complete(spec);
    expect(asked).toEqual([0, 1, 2, 3]);
    expect(cache.complete('keyc')).toBe(true);
    // A failure keeps its message.
    fail = true;
    baker.ensure({ ...spec, cacheKey: 'keyd' });
    await expect.poll(() => baker.job('keyd')?.state).toBe('error');
    expect(baker.job('keyd')?.error).toBe('boom at frame 0');
  });

  it('[DEV-008] code-layer.json is the validated schema 8 project built here', () => {
    const engine = new EditorEngine(createProject('Code layer'));
    const composition = engine.state.compositions[0]!;
    const built = codeLayerCommands(composition, pulse(), 0, {
      layer: 'code-layer',
      clip: 'code-clip',
      track: 'code-track',
    });
    engine.commands.transaction('Add code animation', built.commands);
    const project = {
      ...engine.state,
      id: 'code-layer-fixture',
      metadata: {
        name: 'Code layer',
        createdAt: '2026-10-12T00:00:00.000Z',
        updatedAt: '2026-10-12T00:00:00.000Z',
      },
      compositions: engine.state.compositions.map((item) => ({
        ...item,
        id: 'code-scene',
      })),
    };
    const text = serializeProject(validateProject(project)) + '\n';
    if (process.env.UPDATE_FIXTURES) writeFileSync(FILE, text);
    expect(text).toBe(readFileSync(FILE, 'utf8'));
    expect(deserializeProject(text).schemaVersion).toBe(8);
  });

  it('[DEV-008] code-layer-free.json holds a Tier C layer (for the fake runtime)', async () => {
    const source = readFileSync('tests/fixtures/code/slow-free.js', 'utf8');
    const { FakeRuntime } = await import('../src/code-layer/fake-runtime');
    const checked = new FakeRuntime().validate(source);
    if (!checked.ok) throw new Error(checked.errors[0]!.message);
    const engine = new EditorEngine(createProject('Free code layer'));
    const built = codeLayerCommands(
      engine.state.compositions[0]!,
      {
        tier: 'C',
        source,
        meta: checked.meta as unknown as Record<string, unknown>,
        params: { color: '#3366ff' },
      },
      0,
      { layer: 'free-layer', clip: 'free-clip', track: 'free-track' },
    );
    engine.commands.transaction('Add code animation', built.commands);
    const project = {
      ...engine.state,
      id: 'code-free-fixture',
      metadata: {
        name: 'Free code layer',
        createdAt: '2026-10-12T00:00:00.000Z',
        updatedAt: '2026-10-12T00:00:00.000Z',
      },
      compositions: engine.state.compositions.map((item) => ({
        ...item,
        id: 'free-scene',
      })),
    };
    const file = 'tests/fixtures/projects/code-layer-free.json';
    const text = serializeProject(validateProject(project)) + '\n';
    if (process.env.UPDATE_FIXTURES) writeFileSync(file, text);
    expect(text).toBe(readFileSync(file, 'utf8'));
  });
});
