import { describe, expect, it } from 'vitest';
import { EditorEngine } from '../../src/core';
import fixture from '../fixtures/projects/av-sync.json';
import { listAudibleClips } from '../../src/media/audio';
import type { PreviewAsset } from '../../src/media/previews';
import { nestClips } from '../../src/nesting';

// FINAL3 A3: audio clips and video with sound nest, and they sound through
// the nested clip's trim and speed.
const audible = (engine: EditorEngine) =>
  listAudibleClips(
    engine.state.compositions[0],
    engine.state.assets as unknown as readonly PreviewAsset[],
  ).map((clip) => ({
    asset: clip.sourceAssetId,
    start: +clip.startTime.toFixed(6),
    duration: +clip.duration.toFixed(6),
    sourceIn: +clip.sourceIn.toFixed(6),
    speed: clip.speed,
  }));
const sort = <T extends { asset: string }>(list: T[]) =>
  [...list].sort((a, b) => a.asset.localeCompare(b.asset));

describe('[FN3-003] nested audio', () => {
  it('nests an audio clip with a video clip; the same sound plays at the same times', () => {
    const engine = new EditorEngine(fixture);
    const before = sort(audible(engine));
    expect(before.length).toBe(2);
    const scene = engine.state.compositions[0]!;
    const ids = scene.tracks.flatMap((track) => track.clips.map((c) => c.id));
    const result = nestClips(engine.state, scene.id, ids, { groupId: 'n1' });
    engine.commands.transaction(result.label, result.commands);
    const nested = engine.state.compositions[0]!.layers.find(
      (layer) => layer.id === 'n1',
    )!;
    expect(nested.children.map((child) => child.type).sort()).toEqual([
      'audio',
      'video',
    ]);
    expect(sort(audible(engine))).toEqual(before);
  });

  it('a nested clip at 2x plays its sound twice as fast and half as long; a trim cuts the sound', () => {
    const engine = new EditorEngine(fixture);
    const scene = engine.state.compositions[0]!;
    const ids = scene.tracks.flatMap((track) => track.clips.map((c) => c.id));
    const before = sort(audible(engine));
    const result = nestClips(engine.state, scene.id, ids, { groupId: 'n1' });
    engine.commands.transaction(result.label, result.commands);
    const clip = engine.state.compositions[0]!.tracks.flatMap(
      (track) => track.clips,
    ).find((item) => item.id === result.clipId)!;
    engine.commands.transaction('Speed', [
      {
        type: 'SET_CLIP_SPEED',
        compositionId: scene.id,
        clipId: clip.id,
        speed: 2,
      },
    ]);
    const fast = sort(audible(engine));
    fast.forEach((item, index) => {
      const old = before[index]!;
      expect(item.speed).toBe(old.speed * 2);
      expect(item.duration).toBeCloseTo(old.duration / 2, 6);
      expect(item.start).toBeCloseTo(
        clip.startTime + (old.start - clip.startTime) / 2,
        6,
      );
    });
    // Trim the nested clip's start by 0.5 s of outer time (1 s inner).
    const now = engine.state.compositions[0]!.tracks.flatMap(
      (track) => track.clips,
    ).find((item) => item.id === clip.id)!;
    engine.commands.transaction('Trim', [
      {
        type: 'SET_CLIP_TIMING',
        compositionId: scene.id,
        clipId: clip.id,
        startTime: now.startTime + 0.5,
        duration: now.duration - 0.5,
        sourceIn: now.sourceIn + 1,
        sourceOut: now.sourceOut,
      },
    ]);
    expect(audible(engine).length).toBeGreaterThan(0);
    for (const item of audible(engine)) {
      expect(item.start).toBeGreaterThanOrEqual(now.startTime + 0.5 - 1e-6);
    }
  });
});
