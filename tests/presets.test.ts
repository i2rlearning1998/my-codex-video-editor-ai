import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  EditorEngine,
  clipAnimation,
  deserializeProject,
  type Command,
} from '../src/core';
import { deriveRenderItems } from '../src/render/adapter';
import { applyPresets, presetEffect } from '../src/render/presets';
import { EditorSession } from '../src/ui/session';

const setup = () => {
  const engine = new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );
  const session = new EditorSession(engine);
  const composition = () => engine.state.compositions[0]!;
  const clipOf = (layerId: string) =>
    composition()
      .tracks.flatMap((track) => track.clips)
      .find((clip) => clip.layerId === layerId)!;
  const set = (layerId: string, slot: string, value: unknown) =>
    engine.commands.execute({
      type: 'SET_CLIP_ANIMATION',
      compositionId: composition().id,
      clipId: clipOf(layerId).id,
      slot,
      value,
    } as Command);
  return { engine, session, composition, clipOf, set };
};
const box = { width: 1280, height: 720 };

test('[ANI-007] In and Out presets: fade, slide, zoom, pop, wipe, typewriter', () => {
  const at = (animation: object, local: number, duration = 4) =>
    presetEffect(animation as never, local, duration, box, false, 400);
  const fade = { in: { preset: 'fade', duration: 1 } };
  expect(at(fade, 0).opacity).toBe(0);
  expect(at(fade, 1).opacity).toBe(1);
  // Eased out: already past half at the midpoint.
  expect(at(fade, 0.5).opacity).toBeGreaterThan(0.5);
  const slide = {
    out: { preset: 'slide', duration: 1, direction: 'down' },
  };
  // Out leaves in its direction: down means a growing positive y offset.
  expect(at(slide, 3.5).offset[1]).toBeGreaterThan(0);
  expect(at(slide, 3).offset).toEqual([0, 0]);
  expect(at({ in: { preset: 'zoom', duration: 1 } }, 0).scale).toBeCloseTo(
    0.6,
    9,
  );
  const pop = { in: { preset: 'pop', duration: 1 } };
  expect(at(pop, 0.7).scale).toBeCloseTo(1.1, 9);
  expect(at(pop, 1).scale).toBeCloseTo(1, 9);
  expect(at({ in: { preset: 'wipe', duration: 2 } }, 1).reveal).toBeGreaterThan(
    0,
  );
  expect(at({ in: { preset: 'typewriter', duration: 2 } }, 1).characters).toBe(
    0.5,
  );
  // In and Out longer than the clip shrink together.
  const both = {
    in: { preset: 'fade', duration: 3 },
    out: { preset: 'fade', duration: 3 },
  };
  expect(at(both, 2).opacity).toBe(1);
  expect(at(both, 1).opacity).toBeLessThan(1);
});

test('[ANI-007][ANI-008] loops and Ken Burns', () => {
  const at = (animation: object, local: number, image = false) =>
    presetEffect(animation as never, local, 4, box, image, 400);
  const pulse = { loop: { preset: 'pulse', period: 1 } };
  expect(at(pulse, 0.25).scale).toBeCloseTo(1.06, 9);
  expect(at(pulse, 0.75).scale).toBeCloseTo(0.94, 9);
  expect(at({ loop: { preset: 'spin', period: 2 } }, 1).rotation).toBe(180);
  expect(at({ loop: { preset: 'float', period: 1 } }, 0.25).offset[1]).toBe(
    -12,
  );
  const ken = { kenBurns: { zoom: 'in' } };
  expect(at(ken, 0, true).scale).toBe(1);
  expect(at(ken, 4, true).scale).toBeCloseTo(1.15, 9);
  expect(at(ken, 0, true).offset[0]).toBeGreaterThan(
    at(ken, 4, true).offset[0],
  );
  // Ken Burns is for images only.
  expect(at(ken, 4, false).scale).toBe(1);
});

test('[ANI-007] SET_CLIP_ANIMATION validates, round-trips and draws about the center', () => {
  const { engine, session, clipOf, set } = setup();
  expect(() =>
    set('layer-a', 'in', { preset: 'bounce', duration: 1 }),
  ).toThrow();
  expect(() => set('layer-a', 'in', { preset: 'fade', duration: 9 })).toThrow();
  const before = JSON.stringify(engine.state);
  set('layer-a', 'in', { preset: 'zoom', duration: 1 });
  expect(clipAnimation(clipOf('layer-a'))).toEqual({
    in: { preset: 'zoom', duration: 1 },
  });
  // Drawn at half-scale about the visual center (400×225 box at 100,100).
  session.setCurrentTime(0);
  const drawn = deriveRenderItems({
    ...session.source,
    animate: true,
  }).items.find((item) => item.id === 'layer-a')!;
  const center = [
    drawn.matrix[0] * 200 + drawn.matrix[4],
    drawn.matrix[3] * 112.5 + drawn.matrix[5],
  ];
  expect(center[0]).toBeCloseTo(300, 9);
  expect(center[1]).toBeCloseTo(212.5, 9);
  expect(drawn.matrix[0]).toBeCloseTo(0.6, 9);
  expect(drawn.opacity).toBe(0);
  // Picking uses the resting geometry.
  const picked = deriveRenderItems(session.source).items.find(
    (item) => item.id === 'layer-a',
  )!;
  expect(picked.matrix[0]).toBe(1);
  set('layer-a', 'in', null);
  expect(JSON.stringify(engine.state)).not.toContain('"animation"');
  expect(
    JSON.parse(JSON.stringify(engine.state)).compositions[0].tracks,
  ).toEqual(JSON.parse(before).compositions[0].tracks);
  const composition = session.source.composition;
  expect(applyPresets(composition, [], 0)).toBe(composition);
  session.dispose();
});
