import { describe, expect, it } from 'vitest';
import {
  EditorEngine,
  clipSourceTime,
  clipTimeEffects,
  clipTrimBounds,
  createLayer,
  createProject,
  deserializeProject,
  findClip,
  retimeClip,
  serializeProject,
  validateProject,
  type Clip,
  type Project,
} from '../src/core';

function clip(
  id: string,
  layerId: string,
  startTime: number,
  sourceIn = 0,
): Clip {
  return {
    id,
    name: id,
    layerId,
    assetId: 'asset',
    startTime,
    duration: 2,
    sourceIn,
    sourceOut: sourceIn + 2,
    enabled: true,
    speed: 1,
    transitionMetadata: {},
    effectMetadata: {},
    metadata: {},
  };
}
function project(): Project {
  const value = createProject();
  value.assets.push({
    id: 'asset',
    name: 'Footage',
    type: 'video',
    source: { kind: 'local', reference: 'footage.mp4' },
    duration: 6,
    metadata: {},
  });
  const layers = ['a', 'b'].map((id) => {
    const layer = createLayer(`layer-${id}`, 'video', id);
    layer.assetId = 'asset';
    return layer;
  });
  const composition = value.compositions[0]!;
  composition.layers = layers;
  composition.tracks = [
    {
      id: 'video-1',
      name: 'Video 1',
      type: 'video',
      order: 0,
      enabled: true,
      locked: false,
      muted: false,
      clips: [clip('clip-a', 'layer-a', 0, 1), clip('clip-b', 'layer-b', 3)],
    },
  ];
  return validateProject(value);
}
const clipOf = (engine: EditorEngine, id: string) =>
  findClip(engine.state.compositions[0]!, id)!.clip;

describe('[VID-015][VID-016][VID-017] clip time effects', () => {
  it('maps composition time to source time for forward, reversed and frozen clips', () => {
    const base = clip('c', 'l', 10, 1);
    expect(clipSourceTime(base, 10.5)).toBe(1.5);
    const reversed = { ...base, metadata: { reversed: true } };
    expect(clipTimeEffects(reversed).reversed).toBe(true);
    expect(clipSourceTime(reversed, 10.5)).toBe(2.5);
    const fast = { ...base, speed: 2, duration: 1 };
    expect(clipSourceTime(fast, 10.5)).toBe(2);
    const frozen = { ...base, metadata: { freezeFrame: 2.25 } };
    expect(clipSourceTime(frozen, 11.9)).toBe(2.25);
    // Invalid metadata is ignored, not trusted.
    expect(
      clipTimeEffects({
        ...base,
        metadata: { reversed: 'yes', freezeFrame: 'x' },
      }),
    ).toEqual({ speed: 1, reversed: false, freezeFrame: null });
  });

  it('retimes the correct source edge for forward and reversed trims', () => {
    const base = clip('c', 'l', 2, 1); // source 1..3
    expect(retimeClip(base, 2.5, 1.5, 'left')).toMatchObject({
      sourceIn: 1.5,
      sourceOut: 3,
    });
    expect(retimeClip(base, 2, 1, 'right')).toMatchObject({
      sourceIn: 1,
      sourceOut: 2,
    });
    const reversed = { ...base, metadata: { reversed: true } };
    expect(retimeClip(reversed, 2.5, 1.5, 'left')).toMatchObject({
      sourceIn: 1,
      sourceOut: 2.5,
    });
    expect(retimeClip(reversed, 2, 1, 'right')).toMatchObject({
      sourceIn: 2,
      sourceOut: 3,
    });
  });

  it('bounds trims by neighbours and source media, adjusted for speed and reverse', () => {
    const composition = project().compositions[0]!;
    // clip-a: 0..2, source 1..3 of 6 s; clip-b starts at 3.
    expect(clipTrimBounds(composition, 'clip-a', 6)).toEqual({
      minStart: 0,
      maxEnd: 3,
    });
    // clip-b: 3..5, source 0..2 has no head room; tail room is 4 s.
    expect(clipTrimBounds(composition, 'clip-b', 6)).toEqual({
      minStart: 3,
      maxEnd: 9,
    });
    // Excluding clip-b leaves only clip-a's source tail (3 s) as its limit.
    expect(clipTrimBounds(composition, 'clip-a', 6, ['clip-b'])).toEqual({
      minStart: 0,
      maxEnd: 5,
    });
    const fast = project().compositions[0]!;
    fast.tracks[0]!.clips[0]!.speed = 2;
    fast.tracks[0]!.clips[0]!.metadata = { reversed: true };
    // Reversed at 2x: extending the end consumes the source head (1 s / 2).
    expect(clipTrimBounds(fast, 'clip-a', 6, ['clip-b'])).toEqual({
      minStart: 0,
      maxEnd: 2.5,
    });
  });

  it('changes speed as one undoable step and refuses to run into the next clip', () => {
    const engine = new EditorEngine(project());
    const compositionId = engine.state.compositions[0]!.id;
    const before = engine.state;
    engine.commands.execute({
      type: 'SET_CLIP_SPEED',
      compositionId,
      clipId: 'clip-a',
      speed: 2,
    });
    expect(clipOf(engine, 'clip-a')).toMatchObject({
      speed: 2,
      duration: 1,
      sourceIn: 1,
      sourceOut: 3,
    });
    expect(() =>
      engine.commands.execute({
        type: 'SET_CLIP_SPEED',
        compositionId,
        clipId: 'clip-a',
        speed: 0.5,
      }),
    ).toThrow(/Not enough room/);
    expect(() =>
      engine.commands.execute({
        type: 'SET_CLIP_SPEED',
        compositionId,
        clipId: 'clip-a',
        speed: 9,
      }),
    ).toThrow();
    engine.undo();
    expect(engine.state).toBe(before);
    engine.redo();
    expect(clipOf(engine, 'clip-a').speed).toBe(2);
  });

  it('toggles reverse and freeze frame in metadata, survives save/load, and restores exactly', () => {
    const engine = new EditorEngine(project());
    const compositionId = engine.state.compositions[0]!.id;
    const original = serializeProject(engine.state);
    engine.commands.transaction('Reverse and freeze', [
      {
        type: 'SET_CLIP_REVERSED',
        compositionId,
        clipId: 'clip-a',
        reversed: true,
      },
      {
        type: 'SET_CLIP_FREEZE_FRAME',
        compositionId,
        clipId: 'clip-a',
        sourceTime: 2,
      },
    ]);
    expect(clipOf(engine, 'clip-a').metadata).toEqual({
      reversed: true,
      freezeFrame: 2,
    });
    const reloaded = deserializeProject(serializeProject(engine.state));
    expect(
      findClip(reloaded.compositions[0]!, 'clip-a')!.clip.metadata,
    ).toEqual({ reversed: true, freezeFrame: 2 });
    expect(() =>
      engine.commands.execute({
        type: 'SET_CLIP_FREEZE_FRAME',
        compositionId,
        clipId: 'clip-a',
        sourceTime: 5,
      }),
    ).toThrow(/inside the clip source range/);
    engine.commands.transaction('Clear', [
      {
        type: 'SET_CLIP_REVERSED',
        compositionId,
        clipId: 'clip-a',
        reversed: false,
      },
      {
        type: 'SET_CLIP_FREEZE_FRAME',
        compositionId,
        clipId: 'clip-a',
        sourceTime: null,
      },
    ]);
    const cleared = JSON.parse(serializeProject(engine.state));
    const expected = JSON.parse(original);
    cleared.metadata.updatedAt = expected.metadata.updatedAt;
    expect(cleared).toEqual(expected);
  });

  it('refuses every time command on a locked track', () => {
    const value = project();
    value.compositions[0]!.tracks[0]!.locked = true;
    const engine = new EditorEngine(value);
    const compositionId = engine.state.compositions[0]!.id;
    for (const command of [
      { type: 'SET_CLIP_SPEED', compositionId, clipId: 'clip-a', speed: 2 },
      {
        type: 'SET_CLIP_REVERSED',
        compositionId,
        clipId: 'clip-a',
        reversed: true,
      },
      {
        type: 'SET_CLIP_FREEZE_FRAME',
        compositionId,
        clipId: 'clip-a',
        sourceTime: 1,
      },
    ] as const)
      expect(() => engine.commands.execute(command)).toThrow(/locked/);
  });
});
