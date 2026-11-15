// ROUND-C1: the existing plans (docs/samples, tests/fixtures, the Round A
// and B v2 and v3 shapes) and one fixed set of fake services, so their
// built projects can be compared with the snapshots taken before Round C1.
import { readFileSync } from 'node:fs';
import type { Asset } from '../../src/core';
import type { MediaCandidate, PlanBuildDeps } from '../../src/video-plan';

const make = (id: string, type: Asset['type'], extra: Partial<Asset> = {}) =>
  ({
    id,
    name: id,
    type,
    source: { kind: 'local', reference: `media/${id}` },
    metadata: { mimeType: 'application/octet-stream', size: 10 },
    ...extra,
  }) as unknown as Asset;
/** The person's own files: some plan queries match them by name. */
export const OWN: Asset[] = [
  make('bee-flower-macro', 'image', { width: 1920, height: 1080 }),
  make('beehive-bees-working', 'video', {
    width: 1920,
    height: 1080,
    duration: 12,
  }),
  make('tea-garden-assam', 'image', { width: 1080, height: 1920 }),
  make('library', 'image', { width: 1000, height: 1000 }),
  make('narration', 'audio', { duration: 40 }),
];
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
export const oldDeps = (): PlanBuildDeps => ({
  resolve: {
    local: (query, type) =>
      OWN.filter((a) => (type === 'audio') === (a.type === 'audio'))
        .filter((a) => words(query).every((w) => a.id.split('-').includes(w)))
        .map((a): MediaCandidate => ({
          key: `asset:${a.id}`,
          source: 'asset',
          kind:
            a.type === 'video'
              ? 'video'
              : a.type === 'audio'
                ? 'audio'
                : 'image',
          title: a.id,
          tags: [],
          width: a.width ?? 0,
          height: a.height ?? 0,
        })),
    // Stock answers, which a v2/v3 build must never use on its own (FIX7).
    stock: async (query) => [
      {
        key: `stock:${words(query).join('-')}`,
        source: 'stock',
        kind: 'image',
        title: query,
        tags: words(query),
        width: 1920,
        height: 1080,
      },
    ],
  },
  importCandidate: async (c) =>
    OWN.find((a) => `asset:${a.id}` === c.key) ??
    make(c.key.replace(/[^a-z0-9-]/gi, '-'), 'image', {
      width: 1920,
      height: 1080,
    }),
  voice: async (text) => ({
    asset: make(`voice-${text.length}`, 'audio', {
      duration: Math.min(9, 1 + text.length / 15),
    }),
    duration: Math.min(9, 1 + text.length / 15),
  }),
  sound: async (query, kind) => ({
    asset: make(`${kind}-${words(query).join('-')}`, 'audio', {
      duration: kind === 'music' ? 60 : 2,
    }),
    duration: kind === 'music' ? 60 : 2,
  }),
});
const read = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as unknown;
export const OLD_PLANS: Record<string, unknown> = {
  'sample-en-honey': read('docs/samples/plan-en-honey.json'),
  'sample-hi-honey': read('docs/samples/plan-hi-honey.json'),
  'sample-v3-diagram': read('docs/samples/plan-v3-diagram.json'),
  'fixture-chai-hi': read('tests/fixtures/plans/chai-hi.json'),
  'fixture-honey-en': read('tests/fixtures/plans/honey-en.json'),
};
/** A built project without the parts that change with the clock. */
export const stable = (project: unknown) =>
  JSON.parse(
    JSON.stringify(project, (key, value) =>
      key === 'createdAt' || key === 'updatedAt' ? '<time>' : value,
    ),
  ) as unknown;
