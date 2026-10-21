import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Asset } from '../../src/core';
import {
  buildVideoFromPlan,
  KIT_IDS,
  kitItems,
  validatePlan,
  type MediaCandidate,
  type PlanBuildDeps,
} from '../../src/video-plan';
import { cameraShotsOf } from '../../src/camera/shots';
import { readAudioSettings } from '../../src/audio/settings';

// FINAL3 Part D: Video Plan v2, the validator, the starter kit and the
// auto-builder with mocked media, voice and sound.
const read = (name: string) =>
  readFileSync(`tests/fixtures/plans/${name}.json`, 'utf8');
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
const stockFor = (query: string, type: string): MediaCandidate[] =>
  [1, 2, 3, 4, 5].map((n) => ({
    key: `mock:${query.replace(/\W+/g, '-')}-${n}`,
    source: 'stock' as const,
    kind: type === 'video' ? ('video' as const) : ('image' as const),
    title: n === 3 ? query : `other ${n}`,
    tags: n === 3 ? query.split(' ') : [],
    width: 1920,
    height: 1080,
  }));
function deps(options: { stockDown?: boolean; voice?: boolean } = {}) {
  const imported: string[] = [];
  const value: PlanBuildDeps = {
    resolve: {
      local: () => [],
      stock: async (query, type) => {
        if (options.stockDown)
          throw new Error('The stock service could not be reached.');
        return stockFor(query, type);
      },
    },
    importCandidate: async (candidate) => {
      imported.push(candidate.key);
      return asset(
        `media-${candidate.key.replace(/\W+/g, '').slice(-24)}`,
        candidate.kind,
        candidate.kind === 'video'
          ? { width: 1920, height: 1080, duration: 20 }
          : { width: 1920, height: 1080 },
      );
    },
    ...(options.voice === false
      ? { voiceUnavailable: 'No Text to speech key is saved.' }
      : {
          voice: async (text: string) => {
            const words = text.split(/\s+/);
            return {
              asset: asset(`media-voice${text.length}`, 'audio', {
                duration: words.length * 0.5,
              }),
              duration: words.length * 0.5,
              words: words.map((word, i) => ({
                text: word,
                start: i * 0.5,
                end: i * 0.5 + 0.45,
              })),
            };
          },
        }),
    sound: async (query, kind) => ({
      asset: asset(`media-${kind}${query.length}`, 'audio', { duration: 30 }),
      duration: 30,
    }),
  };
  return { value, imported };
}
type Built = {
  id: string;
  type: string;
  properties: Record<string, { value: unknown }>;
  children?: Built[];
};
const layersOf = (project: { compositions: { layers: unknown[] }[] }) => {
  const all: Built[] = [];
  const visit = (list: Built[]) =>
    list.forEach((layer) => {
      all.push(layer);
      visit(layer.children ?? []);
    });
  project.compositions.forEach((c) => visit(c.layers as Built[]));
  return all;
};

describe('[FN3-019] Video Plan v2 validator and starter kit', () => {
  it('accepts the English and Hindi examples; warns for unknown fields and kit ids; errors are plain sentences', () => {
    expect(validatePlan(read('honey-en')).ok).toBe(true);
    expect(validatePlan(read('chai-hi')).ok).toBe(true);
    const plan = JSON.parse(read('honey-en'));
    plan.mood = 'warm';
    plan.scenes[1].layers[1].kit = 'lower-third-9';
    const warned = validatePlan(plan);
    expect(warned.ok).toBe(true);
    expect(warned.warnings.join('\n')).toContain('unknown field "mood"');
    expect(warned.warnings.join('\n')).toContain(
      'Scene 2 (hive), layer "name": the starter kit has no "lower-third-9"',
    );
    delete plan.scenes[0].layers[0].mediaIntent;
    plan.scenes[2].layers[0].kind = 'sticker';
    const failed = validatePlan(plan);
    expect(failed.ok).toBe(false);
    expect(failed.errors[0]).toBe(
      'Scene 3 (close), layer "bg", "kind" must be one of title, text, media, kit (it is "sticker").',
    );
    plan.scenes[2].layers[0].kind = 'kit';
    expect(validatePlan(plan).errors).toEqual([
      'Scene 1 (open), layer "flower" is media without "mediaIntent" (what to look for).',
    ]);
    expect(
      validatePlan('{"format": "video-plan",\n "version": 2,,}').errors[0],
    ).toMatch(/^The plan is not valid JSON/);
  });
  it('has every starter kit item (13 items, 4 backgrounds) and each builds inside the canvas', () => {
    expect(KIT_IDS).toHaveLength(17);
    for (const id of KIT_IDS) {
      const items = kitItems(id, {
        width: 1080,
        height: 1920,
        palette: { background: '#ffffff', text: '#111111', accent: '#7c5cff' },
        text: 'Main|Second line',
        start: 0,
        duration: 4,
        idPrefix: 'k',
      })!;
      expect(items.length, id).toBeGreaterThan(0);
      for (const item of items) {
        const t = item.transform as { x: number; y: number };
        expect(t.x, id).toBeGreaterThanOrEqual(-1);
        expect(t.x + (item.width as number), id).toBeLessThanOrEqual(1081);
      }
    }
    expect(kitItems('nope', {} as never)).toBeNull();
  });
});

describe('[FN3-020] the auto-builder', { timeout: 60_000 }, () => {
  it('builds three scenes with media, alternatives, voice timing, captions, camera, transitions and ducked music; deterministic', async () => {
    const { value, imported } = deps();
    const first = await buildVideoFromPlan(read('honey-en'), value);
    expect(first.errors).toEqual([]);
    const project = first.project!;
    expect(project.compositions.map((c) => c.name)).toEqual([
      'Cold open',
      'The hive',
      'Close',
    ]);
    // Scene length = max(voice + 0.4, hint): 9 words × 0.5 s + 0.4 > 4.
    expect(first.durations[0]).toBeCloseTo(9 * 0.5 + 0.4, 1);
    // The best-matching stock item is chosen; four alternatives are kept.
    expect(first.resolved['open/flower']).toBe('mock:bee-flower-macro-3');
    expect(first.alternatives['open/flower']).toHaveLength(4);
    expect(imported).toContain('mock:beehive-bees-working-3');
    // Every plan layer is findable; captions, camera shots, transitions.
    const layers = layersOf(project);
    expect(
      layers.some((l) => l.properties.planRef?.value === 'hive/name'),
    ).toBe(true);
    expect(
      layers.filter((l) => l.properties.captionCue).length,
    ).toBeGreaterThan(2);
    expect(
      cameraShotsOf(project.compositions[0] as never)[0]!.shot.controller,
    ).toBe('push-in');
    expect(cameraShotsOf(project.compositions[1] as never).length).toBe(1);
    expect(
      project.compositions[1]!.markers.some((m) =>
        m.label.startsWith('aive:scene-transition'),
      ),
    ).toBe(true);
    const clips = project.compositions[0]!.tracks.flatMap((t) => t.clips);
    const music = clips.find((c) => readAudioSettings(c).role === 'music')!;
    expect(readAudioSettings(music).duck.enabled).toBe(true);
    expect(clips.some((c) => readAudioSettings(c).role === 'speech')).toBe(
      true,
    );
    // Fonts from the feel.
    const title = layers.find(
      (l) => l.properties.planRef?.value === 'open/title',
    )!;
    expect(title.properties.fontFamily!.value).toBe('Poppins');
    // Same plan, same services: the same project.
    const again = await buildVideoFromPlan(read('honey-en'), deps().value);
    expect(JSON.stringify(again.project)).toBe(JSON.stringify(project));
    // A swap kept in `resolved` wins on rebuild.
    const swapped = {
      ...first.plan!,
      resolved: { 'open/flower': 'mock:bee-flower-macro-2' },
    };
    const rebuilt = await buildVideoFromPlan(swapped, deps().value);
    expect(rebuilt.resolved['open/flower']).toBe('mock:bee-flower-macro-2');
  });
  it('without a voice key builds silent with a banner and proportional captions; stock down gives fallback cards and flags, and still builds', async () => {
    const silent = await buildVideoFromPlan(
      read('honey-en'),
      deps({ voice: false }).value,
    );
    expect(silent.silent).toBe('No Text to speech key is saved.');
    expect(
      layersOf(silent.project!).filter((l) => l.properties.captionCue).length,
    ).toBeGreaterThan(2);
    const down = await buildVideoFromPlan(
      read('honey-en'),
      deps({ stockDown: true }).value,
    );
    expect(down.project).not.toBeNull();
    expect(down.flags.map((f) => f.key)).toEqual([
      'open/flower',
      'hive/hive-video',
    ]);
    expect(down.flags[0]!.reason).toContain('could not be reached');
    expect(
      layersOf(down.project!).filter(
        (l) => l.properties.planFlag?.value === 'needs-asset',
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });
  it('builds the Hindi plan in 9:16 with the Devanagari font and the Headline captions', async () => {
    const result = await buildVideoFromPlan(read('chai-hi'), deps().value);
    expect(result.errors).toEqual([]);
    const scene = result.project!.compositions[0]!;
    expect([scene.width, scene.height]).toEqual([1080, 1920]);
    const title = layersOf(result.project!).find(
      (l) => l.properties.planRef?.value === 'khet/shirshak',
    )!;
    expect(title.properties.fontFamily!.value).toBe('Noto Sans Devanagari');
  });
});
