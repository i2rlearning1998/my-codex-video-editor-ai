// NEST (D-271): a nested (compound) clip is a group layer whose clip carries
// `clip.metadata.nested` (schema unchanged, D-033 pattern). Its children keep
// their times and keyframes in the nested clip's own time frame, anchored at
// `clip.startTime - clip.sourceIn / clip.speed` (so a trim never moves
// them), and play through the outer clip's trim,
// speed, reverse and freeze. Only the pure time maths lives here, so the
// core (validation, SET_CLIP_TIMING) and the render adapter share it; the
// nest and flatten commands live in src/nesting. Type imports only: this
// file must not import the model at run time (model.ts imports it).
// `nestedTimeAt` is in timeline.ts.
import type { TimedClip } from './timeline';

export const NESTED_KEY = 'nested';
/** Deepest nesting allowed (a nested clip inside nested clips). */
export const MAX_NEST_DEPTH = 5;

/** One child clip kept inside a nested clip (start relative to the anchor). */
export interface NestedClipRecord {
  readonly trackId: string;
  readonly trackName: string;
  readonly trackType: 'video' | 'audio' | 'text' | 'object';
  /** The track's place among the nested tracks (top first). */
  readonly trackRank: number;
  /** A clip record whose `startTime` is relative to the anchor. */
  readonly clip: {
    readonly id: string;
    readonly name: string;
    readonly layerId: string;
    readonly assetId: string | null;
    readonly startTime: number;
    readonly duration: number;
    readonly sourceIn: number;
    readonly sourceOut: number;
    readonly enabled: boolean;
    readonly speed: number;
    readonly transitionMetadata: Readonly<Record<string, unknown>>;
    readonly effectMetadata: Readonly<Record<string, unknown>>;
    readonly metadata: Readonly<Record<string, unknown>>;
  };
}
export interface NestedInfo {
  readonly version: 1;
  /** The inner timeline's length (seconds, inner time). */
  readonly duration: number;
  readonly clips: readonly NestedClipRecord[];
}

/** The nested record of a clip, or null (read defensively). */
export function nestedInfo(clip: {
  readonly metadata: object;
}): NestedInfo | null {
  const value = (clip.metadata as Readonly<Record<string, unknown>>)[
    NESTED_KEY
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.clips)) return null;
  const duration = Number(record.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return record as unknown as NestedInfo;
}
export const isNestedClip = (clip: { readonly metadata: object }) =>
  nestedInfo(clip) !== null;

/** Where the nested clip's inner time 0 sits in its children's time frame. */
export const nestedAnchor = (clip: TimedClip) =>
  clip.startTime - clip.sourceIn / clip.speed;
