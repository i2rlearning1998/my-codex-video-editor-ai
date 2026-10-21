// FINAL3 V3.5: a starter kit item built on its own (AI › Starter kit adds
// it to the open scene): its spec items become layers and clips through
// the Composition Spec adapter at the scene's own size, without the
// adapter's background.
import type { Clip, Layer } from '../core';
import { buildProjectFromComposition } from '../composition';
import { kitItems, type KitContext } from './kit';

export interface KitBuild {
  readonly layers: readonly Layer[];
  readonly clips: readonly Clip[];
}
export async function kitLayers(
  id: string,
  context: Omit<KitContext, 'start' | 'duration' | 'idPrefix'> & {
    readonly fps: number;
    readonly duration?: number;
  },
): Promise<KitBuild | null> {
  const duration = context.duration ?? 5;
  const items = kitItems(id, { ...context, start: 0, duration, idPrefix: 'K' });
  if (!items) return null;
  const fps = ([24, 25, 30, 50, 60] as const).includes(context.fps as 30)
    ? context.fps
    : 30;
  const result = await buildProjectFromComposition({
    spec: {
      version: 1,
      id: 'kit',
      title: id,
      canvas: {
        width: Math.round(context.width),
        height: Math.round(context.height),
        fps,
      },
      assets: [],
      scenes: [{ id: 'K', name: id, duration, items }],
    },
  });
  const scene = result.project?.compositions[0];
  if (!scene) return null;
  const layers = scene.layers.filter(
    (layer) => !layer.id.startsWith('ais_kit_s0_bg'),
  ) as unknown as Layer[];
  const ids = new Set(layers.map((layer) => layer.id));
  const clips = scene.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => ids.has(clip.layerId)) as unknown as Clip[];
  return { layers, clips };
}
