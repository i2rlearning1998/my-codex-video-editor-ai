// FIX7-004: media shorter than the scene never make a clip run past its file.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectSchema, type Asset } from '../../src/core';
import {
  buildVideoFromPlan,
  type MediaCandidate,
  type PlanBuildDeps,
} from '../../src/video-plan';

const asset = (
  id: string,
  type: Asset['type'],
  extra: Partial<Asset> = {},
): Asset =>
  ({
    id,
    name: `${id}.bin`,
    type,
    source: { kind: 'local', reference: `media/${id}` },
    metadata: { mimeType: 'application/octet-stream', size: 10 },
    ...extra,
  }) as unknown as Asset;
const own = (query: string, type: string): MediaCandidate => ({
  key: `asset:${query.replace(/\W+/g, '-')}`,
  source: 'asset',
  kind: type === 'video' ? 'video' : 'image',
  title: query,
  tags: [],
  width: 1920,
  height: 1080,
});

describe('[FIX7-004] short media', () => {
  it('[FIX7-004] a 3 s music file and a 4 s video in a longer video give a valid project', async () => {
    const value: PlanBuildDeps = {
      resolve: {
        local: (query, type) => [own(query, type)],
        stock: async () => [],
      },
      importCandidate: async (candidate) =>
        asset(
          candidate.key.replace(/\W/g, ''),
          candidate.kind,
          candidate.kind === 'video'
            ? { width: 1920, height: 1080, duration: 4 }
            : { width: 1920, height: 1080 },
        ),
      voiceUnavailable: 'none',
      sound: async (query, kind) => ({
        asset: asset(`media-${kind}${query.length}`, 'audio', { duration: 3 }),
        duration: 3,
      }),
    };
    const result = await buildVideoFromPlan(
      readFileSync('tests/fixtures/plans/honey-en.json', 'utf8'),
      value,
    );
    expect(result.errors).toEqual([]);
    const checked = projectSchema.safeParse(result.project);
    expect(
      checked.success ? [] : checked.error.issues.map((i) => i.message),
    ).toEqual([]);
  });
});
