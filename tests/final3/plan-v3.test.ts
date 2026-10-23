import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Asset } from '../../src/core';
import {
  buildVideoFromPlan,
  validatePlan,
  type MediaCandidate,
  type PlanBuildDeps,
} from '../../src/video-plan';

// V3: one timeline, overlays, a narration track, shapes, bubbles, poses.
const make = (id: string, type: Asset['type'], extra: Partial<Asset> = {}) =>
  ({
    id,
    name: id,
    type,
    source: { kind: 'local', reference: `media/${id}` },
    metadata: { mimeType: 'application/octet-stream', size: 10 },
    ...extra,
  }) as unknown as Asset;
const library: Asset[] = [
  make('library', 'image', { width: 1000, height: 1000 }),
  make('rider', 'image', { width: 800, height: 1000 }),
  make('rider-two', 'image', { width: 800, height: 1000 }),
  make('chrome', 'image', { width: 1080, height: 1920 }),
  make('narration', 'audio', { duration: 40 }),
];
const deps = (): PlanBuildDeps => ({
  resolve: {
    local: (query, type) =>
      library
        .filter((a) => (type === 'audio') === (a.type === 'audio'))
        .filter((a) =>
          query.split(' ').some((w) => a.id.split('-').includes(w)),
        )
        .map((a): MediaCandidate => ({
          key: `asset:${a.id}`,
          source: 'asset',
          kind: a.type === 'video' ? 'video' : 'image',
          title: a.id,
          tags: [],
          width: a.width ?? 0,
          height: a.height ?? 0,
        })),
    stock: async () => [],
  },
  importCandidate: async (c) => library.find((a) => `asset:${a.id}` === c.key)!,
});
const plan = (build: 'timeline' | 'scenes') => ({
  format: 'video-plan',
  version: 3,
  meta: { title: 'Test v3', aspect: '9:16', build },
  captions: { enabled: false },
  overlays: [
    {
      id: 'chrome',
      kind: 'media',
      size: 'full',
      enter: 'none',
      mediaIntent: { query: 'chrome' },
    },
    {
      id: 'tag',
      kind: 'title',
      text: 'Tag',
      anchor: 'top-left',
      enter: 'none',
    },
  ],
  narrationTrack: { query: 'narration', volume: 0.9 },
  scenes: [
    {
      id: 'a',
      durationHint: 10,
      layers: [
        {
          id: 'art',
          kind: 'media',
          size: 'full',
          mediaIntent: { query: 'library' },
          feather: 40,
          featherEdge: 'top',
        },
        {
          id: 'rider',
          kind: 'media',
          anchor: 'bottom',
          size: 'medium',
          mediaIntent: { query: 'rider' },
          poses: [{ query: 'rider two', start: 4 }],
          loop: 'float',
        },
        {
          id: 'ray',
          kind: 'shape',
          shape: 'arrow',
          from: { x: 10, y: 20 },
          to: { x: 60, y: 40 },
          stroke: '#ff0000',
          enter: 'wipe',
        },
        {
          id: 'arc',
          kind: 'shape',
          shape: 'arc',
          at: { x: 50, y: 50 },
          radius: 10,
          startAngle: 0,
          endAngle: 90,
        },
        {
          id: 'prot',
          kind: 'shape',
          shape: 'protractor',
          at: { x: 50, y: 70 },
          radius: 20,
        },
        {
          id: 'say',
          kind: 'bubble',
          bubble: 'thought',
          text: 'Hmm?',
          at: { x: 50, y: 30 },
        },
        {
          id: 'big',
          kind: 'text',
          text: 'Large',
          at: { x: 50, y: 80 },
          fontSize: 90,
          color: '#ffcc00',
          highlight: '#000000',
          enter: 'pop',
        },
      ],
    },
    {
      id: 'b',
      durationHint: 8,
      layers: [
        {
          id: 'art',
          kind: 'media',
          size: 'full',
          mediaIntent: { query: 'library' },
        },
        { id: 'x', kind: 'text', text: 'Again', start: 2, duration: 3 },
      ],
      cameras: [
        { controller: 'push-in', start: 0, duration: 4 },
        { controller: 'pull-out', start: 4, duration: 4 },
      ],
    },
  ],
});

describe('Video Plan v3', () => {
  it('reads v2 and v3, and checks the new layer kinds', () => {
    expect(validatePlan(plan('timeline')).ok).toBe(true);
    const bad = plan('timeline') as any;
    bad.scenes[0].layers[2] = { id: 'ray', kind: 'shape', shape: 'line' };
    expect(validatePlan(bad).errors.join(' ')).toMatch(/needs "from" and "to"/);
    const v2 = { ...plan('timeline'), version: 2 };
    expect(validatePlan(v2).ok).toBe(true);
  });
  it('allows long videos and many layers', () => {
    const long = plan('timeline') as any;
    long.scenes[0].durationHint = 1700;
    expect(validatePlan(long).ok).toBe(true);
    long.scenes[0].durationHint = 1900;
    expect(validatePlan(long).ok).toBe(false);
  });
  it('builds a whole video as ONE scene, with shared slots', async () => {
    const result = await buildVideoFromPlan(plan('timeline'), deps());
    expect(result.errors).toEqual([]);
    const project = result.project!;
    expect(project.compositions).toHaveLength(1);
    const scene = project.compositions[0]!;
    expect(scene.duration).toBeCloseTo(40.4, 0);
    // chrome + library + rider + rider-two + narration: each added once.
    expect(project.assets.map((a) => a.id).sort()).toEqual(
      ['chrome', 'library', 'narration', 'rider', 'rider-two'].sort(),
    );
    const refs = scene.layers.map(
      (l) => (l.properties.planRef as { value: string } | undefined)?.value,
    );
    expect(refs).toContain('overlay/chrome');
    expect(refs).toContain('a/rider#p0');
    expect(refs).toContain('narration');
    const arrow = scene.layers.find(
      (l) => (l.properties.planRef as any)?.value === 'a/ray',
    )!;
    expect((arrow.properties.shapeKind as any).value).toBe('arrow');
    expect((arrow.properties.stroke as any).value).toBe('#ff0000');
    const art = scene.layers.find(
      (l) => (l.properties.planRef as any)?.value === 'a/art',
    )!;
    expect(art.masks?.[0]?.feather).toBeGreaterThan(0);
    const big = scene.layers.find(
      (l) => (l.properties.planRef as any)?.value === 'a/big',
    )!;
    expect(JSON.parse((big.properties.textEffect as any).value).type).toBe(
      'background',
    );
  });
  it('can still build one scene per plan scene, overlays on each', async () => {
    const result = await buildVideoFromPlan(plan('scenes'), deps());
    expect(result.errors).toEqual([]);
    expect(result.project!.compositions).toHaveLength(2);
    for (const composition of result.project!.compositions)
      expect(
        composition.layers.some(
          (l) => (l.properties.planRef as any)?.value === 'overlay/chrome',
        ),
      ).toBe(true);
  });
  it('the v3 sample plan is valid, warning-free and builds one scene', async () => {
    const text = readFileSync('docs/samples/plan-v3-diagram.json', 'utf8');
    const check = validatePlan(text);
    expect(check.errors).toEqual([]);
    expect(check.warnings).toEqual([]);
    const result = await buildVideoFromPlan(text, deps());
    expect(result.errors).toEqual([]);
    expect(result.project!.compositions).toHaveLength(1);
    // The protractor is one path layer plus seven labels.
    expect(
      result.project!.compositions[0]!.layers.filter((l) =>
        String((l.properties.planRef as any)?.value).startsWith(
          'protractor/tool#',
        ),
      ),
    ).toHaveLength(7);
  });
  it('stacks text over media over kit backgrounds, overlays on top', async () => {
    const result = await buildVideoFromPlan(plan('timeline'), deps());
    const layers = result.project!.compositions[0]!.layers;
    const at = (ref: string) =>
      layers.findIndex((l) => (l.properties.planRef as any)?.value === ref);
    // The layer list runs bottom to top: the last layer is drawn on top.
    expect(at('overlay/tag')).toBeGreaterThan(at('a/big'));
    expect(at('a/big')).toBeGreaterThan(at('a/art'));
    expect(at('a/rider')).toBeGreaterThan(at('a/art'));
    expect(at('overlay/chrome')).toBeGreaterThan(at('b/x'));
  });
});
