import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EditorEngine, deserializeProject, playRangeOf } from '../src/core';

const open = () =>
  new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );

describe('[PB-017] Auto and Manual range (V7, spec 11.1)', () => {
  it('Auto (no playRange) is the whole scene and not manual', () => {
    const scene = open().state.compositions[0]!;
    expect(playRangeOf(scene)).toEqual({
      start: 0,
      end: scene.duration,
      full: true,
      manual: false,
    });
  });
  it('a Manual range is fixed: clip edits never change it, even past the content; auto removes it', () => {
    const engine = open();
    const scene = engine.state.compositions[0]!;
    const id = scene.id;
    engine.commands.transaction('Manual range', [
      { type: 'SET_COMPOSITION_RANGE', compositionId: id, start: 1, end: 30 },
    ]);
    // End may lie past the content (the tail plays as black).
    expect(engine.state.compositions[0]!.playRange).toEqual({
      start: 1,
      end: 30,
    });
    const range = playRangeOf(engine.state.compositions[0]!);
    expect(range).toMatchObject({ start: 1, end: 30, manual: true });
    // Move every clip later: the range does not follow.
    const clip = engine.state.compositions[0]!.tracks.flatMap(
      (track) => track.clips,
    )[0]!;
    engine.commands.transaction('Move', [
      {
        type: 'SET_CLIP_TIMING',
        compositionId: id,
        clipId: clip.id,
        startTime: clip.startTime + 4,
        duration: clip.duration,
      },
    ]);
    expect(engine.state.compositions[0]!.playRange).toEqual({
      start: 1,
      end: 30,
    });
    // End must stay after Start.
    expect(() =>
      engine.commands.transaction('Bad', [
        { type: 'SET_COMPOSITION_RANGE', compositionId: id, start: 5, end: 5 },
      ]),
    ).toThrow();
    engine.commands.transaction('Auto range', [
      {
        type: 'SET_COMPOSITION_RANGE',
        compositionId: id,
        start: 0,
        end: null,
        auto: true,
      },
    ]);
    expect(engine.state.compositions[0]!.playRange).toBeUndefined();
    engine.undo();
    expect(engine.state.compositions[0]!.playRange).toEqual({
      start: 1,
      end: 30,
    });
  });
});
