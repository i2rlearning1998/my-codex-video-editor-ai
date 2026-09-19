import type { Clip, Composition, DeepReadonly, Track } from './model';

export interface ClipLocation {
  readonly clip: DeepReadonly<Clip>;
  readonly track: DeepReadonly<Track>;
  readonly index: number;
}

export function findClip(
  composition: DeepReadonly<Composition>,
  clipId: string,
): ClipLocation | null {
  for (const track of composition.tracks) {
    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index >= 0) return { clip: track.clips[index]!, track, index };
  }
  return null;
}

export function findClipByLayer(
  composition: DeepReadonly<Composition>,
  layerId: string,
): ClipLocation | null {
  for (const track of composition.tracks) {
    const index = track.clips.findIndex((clip) => clip.layerId === layerId);
    if (index >= 0) return { clip: track.clips[index]!, track, index };
  }
  return null;
}

export function effectiveLayerTiming(
  composition: DeepReadonly<Composition>,
  layer: {
    readonly id: string;
    readonly startTime: number;
    readonly duration: number;
  },
) {
  const location = findClipByLayer(composition, layer.id);
  return location
    ? {
        startTime: location.clip.startTime,
        duration: location.clip.duration,
        enabled: location.clip.enabled && location.track.enabled,
      }
    : { startTime: layer.startTime, duration: layer.duration, enabled: true };
}
