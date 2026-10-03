import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EditorEngine,
  clipTransition,
  deserializeProject,
  type Command,
} from '../src/core';
import { activeTransitions, applyTransitions } from '../src/render/transitions';
import type { RenderSource } from '../src/render/adapter';

// nle-example: Video 1 holds clip-a (0..2 s, layer-a) and clip-b (3..5 s,
// layer-b). clip-b is moved to touch clip-a at 2 s.
const setup = () => {
  const engine = new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );
  const compositionId = engine.state.compositions[0]!.id;
  engine.commands.transaction('Touch', [
    {
      type: 'SET_CLIP_TIMING',
      compositionId,
      clipId: 'clip-b',
      startTime: 2,
      duration: 2,
    } as Command,
  ]);
  const set = (transition: object | null) =>
    engine.commands.transaction('Transition', [
      {
        type: 'SET_CLIP_TRANSITION',
        compositionId,
        clipId: 'clip-b',
        transition,
      } as Command,
    ]);
  // Plain data: the deep readonly snapshot type is too deep for expect().
  const clipB = (): { transitionMetadata: Record<string, unknown> } =>
    JSON.parse(
      JSON.stringify(
        engine.state.compositions[0]!.tracks.flatMap(
          (track) => track.clips,
        ).find((clip) => clip.id === 'clip-b'),
      ),
    );
  return { engine, compositionId, set, clipB };
};
const composition = (engine: EditorEngine) =>
  engine.state.compositions[0] as unknown as RenderSource['composition'];
const layer = (c: RenderSource['composition'], id: string) =>
  c.layers.find((item) => item.id === id)!;

describe('[TR-011] transitions across a cut (J12)', () => {
  it('stores a transition on the incoming clip, validates it, and removes it', () => {
    const { set, clipB } = setup();
    set({ type: 'crossfade', duration: 1 });
    expect(clipTransition(clipB())).toEqual({ type: 'crossfade', duration: 1 });
    // Longer than the clips allow (each gives half of its 2 s length).
    expect(() => set({ type: 'crossfade', duration: 4.5 })).toThrow(
      /longer than the clips allow/,
    );
    expect(() => set({ type: 'spin', duration: 1 })).toThrow();
    set(null);
    expect(clipB().transitionMetadata).toEqual({});
  });
  it('needs a clip that touches it', () => {
    const { engine, compositionId, set } = setup();
    engine.commands.transaction('Apart', [
      {
        type: 'SET_CLIP_TIMING',
        compositionId,
        clipId: 'clip-b',
        startTime: 3,
        duration: 2,
      } as Command,
    ]);
    expect(() => set({ type: 'crossfade', duration: 1 })).toThrow(/touching/);
  });
  it('draws a cross fade, a fade through black, a wipe and a slide over the window around the cut', () => {
    const { engine, set } = setup();
    set({ type: 'crossfade', duration: 1 });
    // Outside the window (1.5 s .. 2.5 s) nothing changes.
    expect(applyTransitions(composition(engine), 1.4)).toBe(
      composition(engine),
    );
    expect(activeTransitions(composition(engine), 2.6)).toEqual([]);
    // At the cut the incoming clip is half visible over the outgoing one,
    // which is held on its
    // last frame, the incoming one starts early on its first.
    const mid = applyTransitions(composition(engine), 2);
    const opacity = (id: string) =>
      layer(mid, id).transform.opacity.value as number;
    expect(opacity('layer-a')).toBeCloseTo(1, 6);
    expect(opacity('layer-b')).toBeCloseTo(0.5, 6);
    const clips = mid.tracks.flatMap((track) => track.clips);
    const a = clips.find((clip) => clip.id === 'clip-a')!;
    const b = clips.find((clip) => clip.id === 'clip-b')!;
    expect([a.startTime, a.duration]).toEqual([0, 2.5]);
    expect([b.startTime, b.duration]).toEqual([1.5, 2.5]);
    const frozen = (a.metadata as unknown as { freezeFrame?: number })
      .freezeFrame;
    expect(typeof frozen).toBe('number');
    // The incoming clip draws over the outgoing one.
    const order = mid.layers.map((item) => item.id);
    expect(order.indexOf('layer-b')).toBeGreaterThan(order.indexOf('layer-a'));
    // Fade through black: a black frame at full strength at the cut.
    set({ type: 'fade-black', duration: 1 });
    const black = applyTransitions(composition(engine), 2);
    const veil = black.layers.find((item) =>
      item.id.startsWith('transition-veil-'),
    )!;
    expect(veil.transform.opacity.value).toBeCloseTo(1, 6);
    expect(veil.properties.fill).toEqual({ type: 'color', value: '#000000' });
    // Wipe left: the incoming clip is revealed from the right edge.
    set({ type: 'wipe-left', duration: 1 });
    const wipe = layer(applyTransitions(composition(engine), 2), 'layer-b');
    expect(wipe.properties.presetReveal).toMatchObject({
      type: 'number',
      value: 0.5,
    });
    expect(wipe.properties.presetRevealFrom).toEqual({
      type: 'string',
      value: 'right',
    });
    // Slide left: both move left by half the width at the cut.
    set({ type: 'slide-left', duration: 1 });
    const before = composition(engine);
    const slid = applyTransitions(before, 2);
    const dx = (id: string) =>
      (layer(slid, id).transform.position.value as readonly number[])[0]! -
      (layer(before, id).transform.position.value as readonly number[])[0]!;
    expect(dx('layer-a')).toBeCloseTo(-before.width / 2, 6);
    expect(dx('layer-b')).toBeCloseTo(before.width / 2, 6);
  });
});
