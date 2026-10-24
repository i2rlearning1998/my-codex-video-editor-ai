import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deserializeProject, EditorEngine } from '../../src/core';
import { EditorSession } from '../../src/ui/session';
import { createFilterPreview } from '../../src/ui/right-panel/filter-preview';
import { applyPreset } from '../../src/ui/right-panel/fx-panels';
import { deriveRenderItems } from '../../src/render/adapter';
import { renderStack, surface } from '../../src/fx';

it('FX-004 changes filter pixels before release and commits exactly one undo step', () => {
  const engine = new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );
  const session = new EditorSession(engine);
  const clip = session.source.composition.tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.enabled)!;
  session.select(clip.layerId);
  const preview = createFilterPreview(engine, session, (label, commands) =>
    engine.commands.transaction(label, commands),
  );
  const change =
    (intensity: number) => (fx: Parameters<typeof applyPreset>[0]) =>
      applyPreset(fx, 'retro', intensity);
  preview.preview(change(0.3));
  preview.preview(change(0.8));
  expect(engine.history.undo).toHaveLength(0);
  const fx = deriveRenderItems({
    ...session.previewSource!,
    animate: true,
  }).items.find((item) => item.fx)?.fx;
  expect(fx).toBeDefined();
  const pixels = surface(1, 1);
  pixels.data.set([40, 120, 230, 255]);
  const changed = renderStack(pixels, fx!.stack, {
    time: 0,
    duration: 2,
    seed: 0,
    width: 1,
    height: 1,
  });
  expect([...changed.data]).not.toEqual([...pixels.data]);
  preview.commit('Filter intensity', change(0.8));
  expect(engine.history.undo).toHaveLength(1);
  expect(session.previewSource).toBeNull();
  preview.preview(change(0.1));
  preview.cancel();
  expect(engine.history.undo).toHaveLength(1);
  engine.undo();
  expect(
    deriveRenderItems({ ...session.source, animate: true }).items.some(
      (item) => item.fx?.stack.length,
    ),
  ).toBe(false);
  session.dispose();
});
