// ROUND-C1: shared v4 plans, defs and fake services for the unit tests.
import { readFileSync } from 'node:fs';
import type { Asset } from '../../src/core';
import type { MediaCandidate, PlanBuildDeps } from '../../src/video-plan';

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
const asset = (id: string, type: Asset['type'], extra: Partial<Asset> = {}) =>
  ({
    id,
    name: id,
    type,
    source: { kind: 'local', reference: `media/${id}` },
    metadata: { mimeType: 'application/octet-stream', size: 10 },
    ...extra,
  }) as unknown as Asset;
export interface StockEntry extends MediaCandidate {}
export const STOCK: StockEntry[] = [
  {
    key: 'fakestock:river-1',
    source: 'stock',
    kind: 'video',
    title: 'river delta aerial',
    tags: ['river', 'delta'],
    width: 1920,
    height: 1080,
    duration: 20,
    licence: 'free',
    attribution: 'Fake Stock / A. Person',
    provider: 'fakestock',
  },
  {
    key: 'fakestock:river-2',
    source: 'stock',
    kind: 'video',
    title: 'river short clip',
    tags: ['river'],
    width: 1920,
    height: 1080,
    duration: 2,
    licence: 'free',
    attribution: 'Fake Stock',
    provider: 'fakestock',
  },
  {
    key: 'fakestock:fort-1',
    source: 'stock',
    kind: 'image',
    title: 'old fort wall',
    tags: ['fort', 'history'],
    width: 2400,
    height: 1600,
    licence: 'free',
    attribution: 'Fake Stock / B. Person',
    provider: 'fakestock',
  },
  {
    key: 'fakestock:fort-2',
    source: 'stock',
    kind: 'image',
    title: 'fort gate',
    tags: ['fort'],
    width: 2400,
    height: 1600,
    licence: 'editorial',
    attribution: 'Fake Stock',
    provider: 'fakestock',
  },
  {
    key: 'icons:map-pin',
    source: 'stock',
    kind: 'image',
    title: 'map pin icon',
    tags: ['map', 'pin'],
    width: 512,
    height: 512,
    licence: 'free',
    attribution: 'Icons',
    provider: 'icons',
  },
];
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
export const v4Deps = (over: Partial<PlanBuildDeps> = {}): PlanBuildDeps => ({
  resolve: {
    local: () => [],
    stock: async (query, type) =>
      STOCK.filter((c) => (type === 'video') === (c.kind === 'video')).filter(
        (c) =>
          words(query).some((w) =>
            words(`${c.title} ${c.tags.join(' ')}`).includes(w),
          ),
      ),
  },
  importCandidate: async (c) =>
    asset(c.key.replace(':', '-'), c.kind === 'video' ? 'video' : 'image', {
      width: c.width,
      height: c.height,
      ...(c.duration ? { duration: c.duration } : {}),
    }),
  sound: async (query, kind) => ({
    asset: asset(`${kind}-${words(query).join('-')}`, 'audio', {
      duration: 90,
    }),
    duration: 90,
  }),
  assetRule: { licences: ['free'] },
  ...over,
});
export const v4Plan = (): Record<string, unknown> => ({
  format: 'video-plan',
  version: 4,
  meta: {
    title: 'Rivers and forts',
    aspect: '16:9',
    assets: { order: ['mine', 'library', 'stock'] },
  },
  captions: { enabled: false },
  defs: {
    blocks: [
      {
        id: 'bar-rise',
        tier: 'B',
        source: BAR_RISE,
        summary: 'Bars rise one by one.',
      },
      {
        id: 'orbit-ring',
        tier: 'C',
        source: ORBIT_RING,
        meta: ORBIT_META,
        summary: 'Dots orbit a ring.',
      },
    ],
  },
  scenes: [
    {
      id: 'river',
      durationHint: 6,
      layers: [
        {
          id: 'footage',
          kind: 'media',
          size: 'full',
          name: 'River footage',
          mediaIntent: { query: 'river', type: 'video' },
          sourceIn: 3,
          speed: 1.5,
          volume: 0.4,
          fadeIn: 0.5,
          fx: [{ id: 'filter.golden-hour' }],
          grade: { contrast: 20, saturation: -10 },
          duration: 5,
        },
        {
          id: 'bars',
          kind: 'block',
          block: 'bar-rise',
          params: { bars: 7, color: '#ff0000' },
          name: 'Bars',
        },
        {
          id: 'pin',
          kind: 'media',
          mediaIntent: { query: 'map pin', type: 'icon' },
          size: 'small',
          anchor: 'top-right',
          blend: 'screen',
        },
        {
          id: 'label',
          kind: 'text',
          text: 'The delta',
          font: 'Georgia',
          letterSpacing: 4,
          group: 'lower',
          keyframes: [
            { property: 'opacity', at: 0, value: 0 },
            { property: 'opacity', at: 1, value: 1 },
          ],
        },
        {
          id: 'sub',
          kind: 'text',
          text: 'Where rivers meet the sea',
          group: 'lower',
          locked: true,
        },
      ],
    },
    {
      id: 'fort',
      durationHint: 5,
      transitionOut: { type: 'transition.zoom', duration: 0.6 },
      layers: [
        {
          id: 'wall',
          kind: 'media',
          size: 'full',
          fit: 'fill',
          mediaIntent: { query: 'fort', type: 'photo' },
          mask: {
            shape: 'ellipse',
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            feather: 20,
          },
          chromaKey: { color: '#00ff00', similarity: 0.2 },
        },
        {
          id: 'ring',
          kind: 'block',
          block: 'orbit-ring',
          params: { count: 12 },
        },
        { id: 'ring-again', kind: 'block', block: 'bar-rise' },
      ],
    },
    {
      id: 'end',
      durationHint: 3,
      layers: [{ id: 'ring2', kind: 'block', block: 'orbit-ring' }],
    },
  ],
  music: { query: 'calm piano', volume: 0.3 },
});
