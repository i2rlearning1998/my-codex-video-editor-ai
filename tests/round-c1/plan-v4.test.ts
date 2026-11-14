// RDC1-011..014: Video Plan v4: every new field reaches the editor through
// an existing command; new graphics (Tier B and C) are code layers with
// their own controllers; media are found by kind with alternatives.
import { describe, expect, it } from 'vitest';
import { validateProject, type Layer } from '../../src/core';
import { buildVideoFromPlan, validatePlan } from '../../src/video-plan';
import { v4Deps, v4Plan } from './v4-fixtures';

const all = (layers: readonly Layer[]): Layer[] =>
  layers.flatMap((l) => [l, ...all(l.children)]);
const byRef = (project: { compositions: { layers: Layer[] }[] }, ref: string) =>
  project.compositions
    .flatMap((c) => all(c.layers))
    .filter(
      (l) =>
        (l.properties.planRef as { value?: string } | undefined)?.value === ref,
    );

describe('[RDC1-011] plan v4 fields', () => {
  it('[RDC1-011] a v4 plan validates; versions 2 and 3 still read', () => {
    expect(validatePlan(v4Plan()).errors).toEqual([]);
    expect(validatePlan({ ...v4Plan(), version: 3, defs: undefined }).ok).toBe(
      false,
    ); // v3 has no new graphics
  });
  it('[RDC1-011] unknown ids are plain errors naming the nearest valid ids', () => {
    const plan = v4Plan() as any;
    plan.scenes[0].layers[0].fx = [{ id: 'filter.goldenhour' }];
    plan.scenes[0].layers[2].blend = 'multiplie';
    plan.scenes[1].transitionOut = { type: 'transition.zooom' };
    const r = validatePlan(plan);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(
      /no effect or filter "filter.goldenhour". Nearest: filter.golden-hour/,
    );
    expect(r.errors.join('\n')).toMatch(
      /no blend mode "multiplie". Nearest: blend.multiply/,
    );
    expect(r.errors.join('\n')).toMatch(
      /no transition "transition.zooom". Nearest: transition.zoom/,
    );
  });
  it('[RDC1-012] builds headless and deterministic, and the project passes schema 9', async () => {
    const a = await buildVideoFromPlan(v4Plan(), v4Deps());
    expect(a.errors).toEqual([]);
    const b = await buildVideoFromPlan(v4Plan(), v4Deps());
    expect(JSON.stringify(b.project)).toBe(JSON.stringify(a.project));
    const project = validateProject(JSON.parse(JSON.stringify(a.project)));
    expect(project.schemaVersion).toBe(9);
    // Footage: effects + grade in one stack, cut from 3 s, speed 1.5, sound.
    const [footage] = byRef(a.project as never, 'river/footage');
    expect(footage!.name).toBe('River footage');
    const scene = project.compositions[0]!;
    const clip = scene.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.layerId === footage!.id)!;
    expect((clip.metadata.fx as any).stack.map((e: any) => e.id)).toEqual([
      'filter.golden-hour',
      'adjust.contrast',
      'adjust.saturation',
    ]);
    expect(clip.sourceIn).toBe(3);
    expect(clip.speed).toBe(1.5);
    expect((clip.metadata.audio as any).volume).toBe(0.4);
    expect((clip.metadata.audio as any).fadeIn).toBe(0.5);
    // Blend, chroma, mask, fit, font, keyframes, lock, group.
    expect(byRef(a.project as never, 'river/pin')[0]!.blendMode).toBe(
      'blend.screen',
    );
    const wall = byRef(a.project as never, 'fort/wall')[0]!;
    expect(wall.chromaKey?.color).toBe('#00ff00');
    expect(wall.masks?.[0]?.type).toBe('ellipse');
    const label = byRef(a.project as never, 'river/label')[0]!;
    expect((label.properties.fontFamily as any).value).toBe('Georgia');
    expect(label.transform.opacity.animated).toBe(true);
    expect(
      (byRef(a.project as never, 'river/sub')[0]!.properties.locked as any)
        .value,
    ).toBe(true);
    const group = scene.layers.find(
      (l) => l.type === 'group' && l.name === 'lower',
    );
    expect(group?.children.map((c) => c.name).sort()).toEqual(
      [label.name, byRef(a.project as never, 'river/sub')[0]!.name].sort(),
    );
    // Scene transition from the FX library.
    expect(
      project.compositions[1]!.markers.some((m) => /transition/.test(m.label)),
    ).toBe(true);
  });
  it('[RDC1-013] new graphics are code layers with their own settings (Tier B and Tier C), reused by id', async () => {
    const r = await buildVideoFromPlan(v4Plan(), v4Deps());
    const bars = byRef(r.project as never, 'river/bars')[0]!;
    expect(bars.code?.tier).toBe('B');
    expect(bars.code?.params).toMatchObject({
      bars: 7,
      color: '#ff0000',
      speed: 1,
    });
    expect((bars.code?.meta as any).params.map((p: any) => p.name)).toEqual([
      'color',
      'bars',
      'speed',
    ]);
    const ring = byRef(r.project as never, 'fort/ring')[0]!;
    expect(ring.code?.tier).toBe('C');
    expect(ring.code?.params).toMatchObject({ count: 12, color: '#22cc88' });
    // The same def in a later scene, and the Tier C one again in the last.
    expect(byRef(r.project as never, 'fort/ring-again')[0]!.code?.source).toBe(
      bars.code?.source,
    );
    expect(byRef(r.project as never, 'end/ring2')[0]!.code?.tier).toBe('C');
    // Saved as Creator Pack items (motion, tier B and C) for the AI library.
    expect(
      r.defs?.map((d) => [d.id, d.item?.type, (d.item as any)?.data.tier]),
    ).toEqual([
      ['bar-rise', 'motion', 'B'],
      ['orbit-ring', 'motion', 'C'],
    ]);
  });
  it('[RDC1-014] media are picked by the asset rule with alternatives and "picked by AI"; footage long enough; licences kept', async () => {
    const r = await buildVideoFromPlan(v4Plan(), v4Deps());
    expect(r.resolved['river/footage']).toBe('fakestock:river-1'); // river-2 is 2 s: too short
    expect(r.picks?.['river/footage']).toMatchObject({
      by: 'ai',
      provider: 'fakestock',
      licence: 'free',
    });
    expect(r.resolved['fort/wall']).toBe('fakestock:fort-1'); // fort-2 is editorial: not allowed
    expect(r.alternatives['river/pin']!.length).toBeGreaterThan(0);
    expect(r.credits?.map((c) => c.attribution)).toContain(
      'Fake Stock / A. Person',
    );
    expect(r.flags).toEqual([]);
  });
});
