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

/** Speed range accepted by SET_CLIP_SPEED (the schema itself allows up to 16). */
export const MIN_CLIP_SPEED = 0.1;
export const MAX_CLIP_SPEED = 8;
/** Clip time effects stored under schema 4: speed is a field; reverse and freeze
 * frame live in clip.metadata until a schema bump promotes them. Invalid metadata
 * values are ignored rather than trusted. */
export interface ClipTimeEffects {
  readonly speed: number;
  readonly reversed: boolean;
  readonly freezeFrame: number | null;
}
export function clipTimeEffects(clip: DeepReadonly<Clip>): ClipTimeEffects {
  // Widened on purpose: DeepReadonly<JsonValue> is too deep for the checker here.
  const metadata: Readonly<Record<string, unknown>> = (
    clip as { readonly metadata: object }
  ).metadata as Readonly<Record<string, unknown>>;
  const freeze = metadata.freezeFrame;
  return {
    speed: clip.speed,
    reversed: metadata.reversed === true,
    freezeFrame:
      typeof freeze === 'number' && Number.isFinite(freeze)
        ? Math.max(clip.sourceIn, Math.min(clip.sourceOut, freeze))
        : null,
  };
}
/** Source-media time shown at composition `time` (clamped to the clip). */
export function clipSourceTime(clip: DeepReadonly<Clip>, time: number): number {
  const effects = clipTimeEffects(clip);
  if (effects.freezeFrame !== null) return effects.freezeFrame;
  const local =
    Math.max(0, Math.min(clip.duration, time - clip.startTime)) * clip.speed;
  return Math.max(
    clip.sourceIn,
    Math.min(
      clip.sourceOut,
      effects.reversed ? clip.sourceOut - local : clip.sourceIn + local,
    ),
  );
}
export interface ClipTiming {
  readonly startTime: number;
  readonly duration: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
}
/** New timing for a move or edge trim. The source edge that follows a timeline edge
 * depends on direction: a reversed clip's timeline start shows its source out-point. */
export function retimeClip(
  clip: DeepReadonly<Clip>,
  startTime: number,
  duration: number,
  edge: 'move' | 'left' | 'right',
): ClipTiming {
  const { speed, reversed } = clipTimeEffects(clip);
  let { sourceIn, sourceOut } = clip;
  if (edge === 'left') {
    const shift = (startTime - clip.startTime) * speed;
    if (reversed) sourceOut -= shift;
    else sourceIn += shift;
  } else if (edge === 'right') {
    if (reversed) sourceIn = sourceOut - duration * speed;
    else sourceOut = sourceIn + duration * speed;
  }
  return {
    startTime,
    duration,
    sourceIn: Math.max(0, sourceIn),
    sourceOut: Math.max(Math.max(0, sourceIn) + 1e-9, sourceOut),
  };
}
/** Timeline limits for trimming: never into a neighbour on the same track, never
 * past the source media. `sourceDuration` is undefined for generated clips. */
export function clipTrimBounds(
  composition: DeepReadonly<Composition>,
  clipId: string,
  sourceDuration?: number,
  excludedClipIds: readonly string[] = [],
): { readonly minStart: number; readonly maxEnd: number } {
  const location = findClip(composition, clipId);
  if (!location) throw new Error('Unknown clip');
  const { clip, track } = location;
  const end = clip.startTime + clip.duration;
  const { speed, reversed } = clipTimeEffects(clip);
  const headRoom = clip.sourceIn / speed;
  const tailRoom =
    sourceDuration === undefined
      ? Infinity
      : Math.max(0, sourceDuration - clip.sourceOut) / speed;
  let minStart = Math.max(0, clip.startTime - (reversed ? tailRoom : headRoom));
  let maxEnd = end + (reversed ? headRoom : tailRoom);
  for (const other of track.clips) {
    if (other.id === clip.id || excludedClipIds.includes(other.id)) continue;
    const otherEnd = other.startTime + other.duration;
    if (other.startTime < clip.startTime)
      minStart = Math.max(minStart, Math.min(otherEnd, clip.startTime));
    else maxEnd = Math.min(maxEnd, Math.max(other.startTime, end));
  }
  return { minStart, maxEnd };
}
