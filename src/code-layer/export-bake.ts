// X1: before an export, every code animation of the composition is baked at
// Full quality (export never uses Draft), so the worker reads only finished
// frames from the cache.
import type { Composition, DeepReadonly, Layer } from '../core';
import type { CodeBaker } from './baker';
import { bakeSpecOf } from './frames';
import { codeFps, codeMeta, frameCount, type CodeData } from './meta';

export function codeLayersOf(
  composition: DeepReadonly<Composition>,
): DeepReadonly<Layer>[] {
  const found: DeepReadonly<Layer>[] = [];
  const visit = (layers: readonly DeepReadonly<Layer>[]) => {
    for (const layer of layers) {
      if (layer.code) found.push(layer);
      visit(layer.children);
    }
  };
  visit(composition.layers);
  return found;
}

export async function bakeForExport(
  baker: CodeBaker,
  composition: DeepReadonly<Composition>,
  progress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<void> {
  const specs = codeLayersOf(composition).map((layer) => {
    const code = layer.code as unknown as CodeData;
    const fps = codeFps(code, composition.fps);
    const frames = frameCount(codeMeta(code).duration, fps);
    return bakeSpecOf(
      code,
      {
        tier: code.tier,
        bakeKey: code.bakeKey,
        width: composition.width,
        height: composition.height,
        fps,
        frames,
        frame: 0,
      },
      'full',
    );
  });
  const unique = [...new Map(specs.map((s) => [s.cacheKey, s])).values()];
  const total = unique.reduce((sum, spec) => sum + spec.frames, 0);
  if (!total) return;
  let before = 0;
  for (const spec of unique) {
    const report = () =>
      progress(
        before + Math.round(baker.progress(spec.cacheKey) * spec.frames),
        total,
      );
    const stop = baker.onChange(report);
    const watch = setInterval(() => {
      if (cancelled()) baker.cancel(spec.cacheKey);
    }, 100);
    try {
      report();
      await baker.complete(spec);
    } finally {
      clearInterval(watch);
      stop();
    }
    before += spec.frames;
    progress(before, total);
  }
}
