import { describe, expect, it } from 'vitest';
import {
  compositionAt,
  createLayer,
  createProject,
  EditorEngine,
  number,
  vector2,
  type Command,
  type Layer,
  type Track,
} from '../../src/core';
import { deriveRenderItems } from '../../src/render/adapter';
import {
  enterNested,
  exitNested,
  flattenNested,
  innerToOuter,
  isNestedClip,
  MAX_NEST_DEPTH,
  nestClips,
  nestedDepth,
  nestedEditView,
  NOT_NESTED,
  outerToInner,
} from '../../src/nesting';

const C = 'scene';
function box(id: string, start: number, duration: number, x = 0): Layer {
  const layer = createLayer(id, 'shape', id, duration);
  layer.startTime = start;
  layer.properties = { width: number(100), height: number(100) };
  layer.transform.position = vector2(x, 0);
  return layer;
}
function track(id: string, order: number): Track {
  return {
    id,
    name: id,
    type: 'text',
    order,
    enabled: true,
    locked: false,
    muted: false,
    clips: [],
  };
}
function clipFor(id: string, layer: Layer) {
  return {
    id,
    name: layer.name,
    layerId: layer.id,
    assetId: null,
    startTime: layer.startTime,
    duration: layer.duration,
    sourceIn: 0,
    sourceOut: layer.duration,
    enabled: true,
    speed: 1,
    transitionMetadata: {},
    effectMetadata: {},
    metadata: {},
  };
}
/** Three lanes: a (0–4 s, moving 0 → 400 px), b (1–3 s) and c (5–6 s). */
function setup() {
  const project = createProject('Nest', '2026-10-17T00:00:00.000Z');
  project.compositions[0]!.id = C;
  project.compositions[0]!.fps = 10;
  const engine = new EditorEngine(project);
  const a = box('a', 0, 4);
  a.transform.position = {
    ...vector2(0, 0),
    animated: true,
    keyframes: [
      { time: 0, value: [0, 0] },
      { time: 4, value: [400, 0] },
    ],
  };
  const b = box('b', 1, 2, 50);
  const c = box('c', 5, 1, 90);
  const commands: Command[] = [];
  [
    ['ta', a],
    ['tb', b],
    ['tc', c],
  ].forEach(([trackId, layer], order) => {
    commands.push(
      {
        type: 'CREATE_TRACK',
        compositionId: C,
        track: track(trackId as string, order),
      },
      {
        type: 'CREATE_LAYER',
        compositionId: C,
        parentId: null,
        layer: layer as Layer,
      },
      {
        type: 'CREATE_CLIP',
        compositionId: C,
        trackId: trackId as string,
        clip: clipFor(`clip-${(layer as Layer).id}`, layer as Layer),
      },
    );
  });
  engine.commands.transaction('Setup', commands);
  return engine;
}
const scene = (engine: EditorEngine) => engine.state.compositions[0]!;
const xAt = (engine: EditorEngine, id: string, time: number) => {
  const composition = scene(engine);
  const item = deriveRenderItems({
    composition: compositionAt(composition, time),
    assets: [],
    background: '#000000',
    currentTime: time,
  }).items.find((entry) => entry.id === id);
  return item ? item.matrix[4] : null;
};
const run = (engine: EditorEngine, r: { label: string; commands: Command[] }) =>
  engine.commands.transaction(r.label, r.commands);

describe('[NEST] nested clips', () => {
  it('nests clips across lanes into one clip in one undo step', () => {
    const engine = setup();
    const before = JSON.stringify(scene(engine));
    const result = nestClips(engine.state, C, ['clip-a', 'clip-b'], {
      groupId: 'n1',
    });
    run(engine, result);
    const tracks = scene(engine).tracks;
    expect(tracks.map((t) => t.id)).toEqual(['n1_track', 'tc']);
    const nested = tracks[0]!.clips[0]!;
    expect(isNestedClip(nested)).toBe(true);
    expect(nested).toMatchObject({ startTime: 0, duration: 4, layerId: 'n1' });
    expect(
      scene(engine)
        .layers.find((l) => l.id === 'n1')!
        .children.map((l) => l.id),
    ).toEqual(expect.arrayContaining(['a', 'b']));
    // Nothing moves on the canvas.
    expect(xAt(engine, 'a', 2)).toBe(200);
    expect(xAt(engine, 'b', 2)).toBe(50);
    expect(xAt(engine, 'b', 3.5)).toBeNull();
    engine.undo();
    expect(JSON.stringify(scene(engine))).toBe(before);
  });

  it('maps outer time to inner time through the outer speed, trim and move', () => {
    const engine = setup();
    run(
      engine,
      nestClips(engine.state, C, ['clip-a', 'clip-b'], { groupId: 'n1' }),
    );
    run(engine, {
      label: 'Speed',
      commands: [
        {
          type: 'SET_CLIP_SPEED',
          compositionId: C,
          clipId: 'n1_clip',
          speed: 2,
        },
      ],
    });
    const clip = () => scene(engine).tracks[0]!.clips[0]!;
    expect(clip().duration).toBe(2);
    // Outer 1 s shows inner 2 s: a is half way.
    expect(outerToInner(clip(), 1)).toBe(2);
    expect(innerToOuter(clip(), 2)).toBe(1);
    expect(xAt(engine, 'a', 1)).toBe(200);
    expect(xAt(engine, 'b', 0.25)).toBeNull(); // inner 0.5: b starts at 1
    expect(xAt(engine, 'b', 1)).toBe(50);
    // Scene length follows the outer clip, not the inner frame.
    expect(scene(engine).duration).toBe(6);
    // Move by 1 s: the inner frame follows.
    run(engine, {
      label: 'Move',
      commands: [
        {
          type: 'SET_CLIP_TIMING',
          compositionId: C,
          clipId: 'n1_clip',
          startTime: 1,
          duration: 2,
        },
      ],
    });
    expect(xAt(engine, 'a', 2)).toBe(200);
    // Trim the head by 0.5 s (source in 1 s): content stays in place.
    run(engine, {
      label: 'Trim',
      commands: [
        {
          type: 'SET_CLIP_TIMING',
          compositionId: C,
          clipId: 'n1_clip',
          startTime: 1.5,
          duration: 1.5,
          sourceIn: 1,
          sourceOut: 4,
        },
      ],
    });
    expect(xAt(engine, 'a', 2)).toBe(200);
    expect(xAt(engine, 'a', 1.25)).toBeNull();
  });

  it('flattens back to the same layers, timing and lanes', () => {
    const engine = setup();
    const before = scene(engine);
    run(
      engine,
      nestClips(engine.state, C, ['clip-a', 'clip-b'], { groupId: 'n1' }),
    );
    const flat = flattenNested(engine.state, C, 'n1_clip');
    run(engine, flat);
    const after = scene(engine);
    expect(after.layers).toEqual(before.layers);
    expect(after.tracks).toEqual(before.tracks);
    expect(flat.dropped).toEqual([]);
    engine.undo();
    expect(scene(engine).layers.map((l) => l.id)).toEqual(['c', 'n1']);
  });

  it('flattens a sped-up nested clip with its timing baked', () => {
    const engine = setup();
    run(
      engine,
      nestClips(engine.state, C, ['clip-a', 'clip-b'], { groupId: 'n1' }),
    );
    run(engine, {
      label: 'Speed',
      commands: [
        {
          type: 'SET_CLIP_SPEED',
          compositionId: C,
          clipId: 'n1_clip',
          speed: 2,
        },
      ],
    });
    run(engine, flattenNested(engine.state, C, 'n1_clip'));
    const clips = scene(engine).tracks.flatMap((t) => t.clips);
    expect(clips.find((c) => c.id === 'clip-b')).toMatchObject({
      startTime: 0.5,
      duration: 1,
    });
    expect(xAt(engine, 'a', 1)).toBe(200);
  });

  it('rejects cycles, depth over the limit, audio and repeated clips', () => {
    const engine = setup();
    expect(() => nestClips(engine.state, C, ['clip-a', 'clip-a'])).toThrow(
      /twice/,
    );
    let clipId = 'clip-c';
    for (let level = 1; level <= MAX_NEST_DEPTH; level++) {
      const result = nestClips(engine.state, C, [clipId], {
        groupId: `deep${level}`,
      });
      run(engine, result);
      clipId = result.clipId;
    }
    expect(() => nestClips(engine.state, C, [clipId])).toThrow(
      /limited to 5 levels/,
    );
    // The deepest child still draws at its time.
    expect(xAt(engine, 'c', 5.5)).toBe(90);
    const loop = createLayer('loop', 'group', 'Loop');
    (loop.children as Layer[]).push(loop);
    expect(() => nestedDepth(loop, () => undefined)).toThrow(/cycle/);
  });

  it('enters and leaves nested clips as pure state', () => {
    const engine = setup();
    run(
      engine,
      nestClips(engine.state, C, ['clip-a', 'clip-b'], { groupId: 'n1' }),
    );
    const inside = enterNested(engine.state, NOT_NESTED, C, 'n1');
    expect(inside.path).toEqual(['n1']);
    expect(
      nestedEditView(engine.state, C, inside, 1).layers.map((l) => l.id),
    ).toEqual(expect.arrayContaining(['a', 'b']));
    expect(exitNested(inside)).toBe(NOT_NESTED);
    expect(() => enterNested(engine.state, NOT_NESTED, C, 'c')).toThrow(
      /not a nested clip/,
    );
  });
});
