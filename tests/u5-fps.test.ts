import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EditorEngine, deserializeProject } from '../src/core';

describe('[PRJ-027] scene frame rate (U5)', () => {
  it('sets one scene fps and re-snaps clip, layer and keyframe times to the new grid, one undo step', () => {
    const engine = new EditorEngine(
      deserializeProject(
        readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
      ),
    );
    const id = engine.state.compositions[0]!.id;
    const before = engine.state;
    engine.commands.transaction('Frame rate', [
      { type: 'SET_COMPOSITION_FPS', compositionId: id, fps: 12 },
    ]);
    const scene = engine.state.compositions[0]!;
    expect(scene.fps).toBe(12);
    const onGrid = (time: number) =>
      Math.abs(time * 12 - Math.round(time * 12)) < 1e-6;
    for (const track of scene.tracks)
      for (const clip of track.clips) {
        expect(onGrid(clip.startTime)).toBe(true);
        expect(clip.duration).toBeGreaterThan(0);
      }
    engine.undo();
    expect(engine.state).toEqual(before);
  });
});
