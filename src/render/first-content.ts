// ROUND-C1 C1.6: the first moment a scene shows content. A built scene
// often fades everything in from 0:00, so a poster or the stage at 0:00 is
// a blank frame. The first moment with content is the earliest time a
// visible picture, shape, text or graphic has fully entered (its clip's
// start plus its In animation), never past the scene's end. Pure.
import { clipAnimation } from '../core/clip-animation';

interface ClipLike {
  readonly layerId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly enabled: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}
interface SceneLike {
  readonly duration: number;
  readonly fps?: number;
  readonly tracks: readonly {
    readonly type: string;
    readonly enabled?: boolean;
    readonly clips: readonly ClipLike[];
  }[];
  readonly layers: readonly {
    readonly id: string;
    readonly type: string;
    readonly name: string;
    readonly children: readonly unknown[];
  }[];
}
const visual = new Set(['video', 'image', 'text', 'shape', 'group', 'nested']);
export function firstContentTime(scene: SceneLike): number {
  const layers = new Map(scene.layers.map((l) => [l.id, l]));
  let best = Infinity;
  for (const track of scene.tracks) {
    if (track.type === 'audio' || track.enabled === false) continue;
    for (const clip of track.clips) {
      const layer = layers.get(clip.layerId);
      if (!clip.enabled || !layer || !visual.has(layer.type)) continue;
      // Captions arrive with the voice; they do not count as the picture.
      if (/^caption/i.test(layer.name)) continue;
      const enter = clipAnimation(clip as never)?.in?.duration ?? 0;
      best = Math.min(
        best,
        clip.startTime + Math.min(enter, clip.duration / 2) + 0.05,
      );
    }
  }
  const frame = 1 / (scene.fps ?? 30);
  if (!Number.isFinite(best)) return 0;
  return Math.max(0, Math.min(best, scene.duration - frame));
}
