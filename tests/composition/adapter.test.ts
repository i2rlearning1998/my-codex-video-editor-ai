import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { libraryItemSchema, type LibraryItem } from '../../src/library/schema';
import {
  buildProjectFromComposition,
  compositionDataOf,
  createSlotFills,
  VOICE_OVER_SLOT,
  type BuildMissing,
} from '../../src/composition';
import { BUILT_IN_THEMES } from '../../src/themes/themes';
import { sceneTransitionOf } from '../../src/core';
import type { Asset } from '../../src/core';

const read = (name: string) =>
  JSON.parse(
    readFileSync(`tests/fixtures/compositions/${name}.json`, 'utf8'),
  ) as unknown;
const manifest = JSON.parse(
  readFileSync('public/library/index.json', 'utf8'),
) as { items: unknown[] };
const items = new Map<string, LibraryItem>();
for (const raw of manifest.items) {
  const parsed = libraryItemSchema.safeParse(raw);
  if (parsed.success) items.set(parsed.data.id, parsed.data);
}
const library = (id: string) => items.get(id);
const asset = (id: string, type: Asset['type'], extra: Partial<Asset> = {}) =>
  ({
    id,
    name: `${id}.${type === 'image' ? 'png' : type === 'video' ? 'webm' : 'wav'}`,
    type,
    source: { kind: 'local', reference: `media/${id}` },
    metadata: {},
    ...extra,
  }) as Asset;
const layersOf = (project: {
  compositions: {
    layers: { name: string; type: string; assetId: string | null }[];
  }[];
}) => project.compositions.flatMap((c) => c.layers);

describe('[J] composition adapter', () => {
  it('builds the documentary mini with every slot filled', async () => {
    const data = compositionDataOf(read('documentary-mini'));
    const fills = createSlotFills(data);
    expect(fills.slots.map((s) => [s.id, s.type, s.required])).toEqual([
      ['archive', 'image', true],
      ['interview', 'video', true],
      ['music', 'audio', false],
      [VOICE_OVER_SLOT, 'audio', true],
    ]);
    expect(
      fills.fillSlot('archive', {
        kind: 'file',
        asset: asset('hive', 'image', { width: 1920, height: 1080 }),
      }),
    ).toEqual({ ok: true });
    expect(
      fills.fillSlot('interview', {
        kind: 'stock',
        asset: asset('keeper', 'video', {
          width: 1920,
          height: 1080,
          duration: 20,
        }),
        provider: 'pexels',
        itemId: '123',
      }),
    ).toEqual({ ok: true });
    expect(
      fills.fillSlot('music', {
        kind: 'file',
        asset: asset('bed', 'audio', { duration: 30 }),
      }),
    ).toEqual({ ok: true });
    expect(
      fills.fillSlot(VOICE_OVER_SLOT, {
        kind: 'file',
        asset: asset('narration', 'audio', { duration: 12 }),
      }),
    ).toEqual({ ok: true });
    expect(fills.listUnfilledSlots()).toEqual([]);
    const result = await buildProjectFromComposition(data, {
      slotFills: fills,
      library,
    });
    expect(result.errors).toEqual([]);
    const project = result.project!;
    expect(project.compositions.map((c) => c.name)).toEqual([
      'Cold open',
      'Chapter 1',
      'Close',
    ]);
    const layers = layersOf(project);
    expect(layers.find((l) => l.name === 'Archive photo')).toMatchObject({
      type: 'image',
      assetId: 'hive',
    });
    expect(layers.find((l) => l.name === 'Beekeeper')).toMatchObject({
      type: 'video',
      assetId: 'keeper',
    });
    expect(layers.filter((l) => l.name === 'Voice-over')).toHaveLength(3);
    expect(
      project.assets.find((a) => a.id === 'keeper')!.metadata,
    ).toMatchObject({
      stock: { provider: 'pexels', itemId: '123' },
    });
    // Effects, scene transitions, camera (missing), captions (missing).
    const photoClip = project.compositions[0]!.tracks.flatMap(
      (t) => t.clips,
    ).find((c) => c.name === 'Archive photo')!;
    expect(photoClip.metadata.fx).toEqual({
      version: 1,
      stack: [{ id: 'effect.filmic', params: expect.any(Object) }],
    });
    expect(sceneTransitionOf(project.compositions[1]!)).toMatchObject({
      type: 'crossfade',
      duration: 1,
    });
    expect(sceneTransitionOf(project.compositions[2]!)).toMatchObject({
      type: 'fade-black',
    });
    expect(result.missing.map((m) => m.kind)).toEqual(['feature', 'captions']);
    // The library background was expanded in the last scene.
    expect(project.compositions[2]!.layers.length).toBeGreaterThan(1);
  });

  it('reports empty slots, draws a frame for a required one, and never throws', async () => {
    const result = await buildProjectFromComposition(read('documentary-mini'), {
      library,
    });
    expect(result.project).not.toBeNull();
    const kinds = result.missing.map((m: BuildMissing) =>
      m.kind === 'slot' ? `slot:${m.slot.id}` : m.kind,
    );
    expect(kinds).toEqual([
      'slot:archive',
      'slot:interview',
      'voice-over',
      'feature',
      'captions',
    ]);
    const voice = result.missing.find((m) => m.kind === 'voice-over');
    expect(voice).toMatchObject({
      request: { text: expect.stringContaining('honey'), lang: 'en' },
    });
    expect(result.warnings.map((w) => w.code)).toContain('slot-optional-empty');
    const frame = layersOf(result.project!).find(
      (l) => l.name === 'Archive photo',
    )!;
    expect(frame).toMatchObject({ type: 'shape', assetId: null });
    expect(
      (frame as unknown as { properties: Record<string, { value: unknown }> })
        .properties.compositionSlot!.value,
    ).toBe('archive');
    expect(layersOf(result.project!).some((l) => l.type === 'audio')).toBe(
      false,
    );
  });

  it('warns with the name of a missing library item and rejects a wrong fill', async () => {
    const data = compositionDataOf(read('logo-reveal'));
    const fills = createSlotFills(data);
    expect(fills.slots[0]).toMatchObject({
      id: 'logo',
      type: 'logo',
      required: true,
    });
    expect(
      fills.fillSlot('logo', { kind: 'file', asset: asset('clip', 'video') }),
    ).toMatchObject({ ok: false });
    expect(fills.fillSlot('nope', { kind: 'library', id: 'x' })).toMatchObject({
      ok: false,
    });
    const result = await buildProjectFromComposition(data, {
      slotFills: {
        logo: { kind: 'file', asset: asset('brand', 'image') },
        ghost: { kind: 'library', id: 'x' },
      },
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'library-missing',
          message: expect.stringContaining('shape-polygon-6'),
        }),
        expect.objectContaining({ code: 'slot-fill-rejected' }),
      ]),
    );
    expect(
      layersOf(result.project!).find((l) => l.name === 'Logo'),
    ).toMatchObject({ type: 'image', assetId: 'brand' });
  });

  it('fills a logo slot from the library and applies a theme and style checks', async () => {
    const style = JSON.parse(
      readFileSync('examples/creator-packs/style-logo-reveal-2d.json', 'utf8'),
    ).items[0].data;
    const theme = BUILT_IN_THEMES[0]!;
    const result = await buildProjectFromComposition(read('logo-reveal'), {
      slotFills: { logo: { kind: 'library', id: 'shape-polygon-5' } },
      library,
      style,
      theme,
    });
    expect(result.missing).toEqual([]);
    const project = result.project!;
    expect(project.compositions[0]!.backgroundColor).toBe(
      theme.palette.background,
    );
    expect(layersOf(project).some((l) => l.name === 'Logo')).toBe(false);
    expect(result.warnings.filter((w) => w.code === 'style-mismatch')).toEqual(
      [],
    );
  });

  it('is deterministic and an invalid composition gives errors, not a throw', async () => {
    const options = {
      slotFills: {
        logo: { kind: 'file' as const, asset: asset('brand', 'image') },
      },
      library,
    };
    const a = await buildProjectFromComposition(read('logo-reveal'), options);
    const b = await buildProjectFromComposition(read('logo-reveal'), options);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toMatchSnapshot();
    const bad = await buildProjectFromComposition({
      spec: { version: 1, id: 'x' },
    });
    expect(bad.project).toBeNull();
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});
