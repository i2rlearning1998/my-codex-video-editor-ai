import {
  frameToTime,
  pixelToTime,
  timeToFrame,
  timeToPixel,
  type Command,
  type Clip,
  type DeepReadonly,
  type Track,
  type Timing,
} from '../core';
import {
  locateLayer,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';

export interface TimelineRow {
  readonly layer: SceneLayer;
  readonly parentId: string | null;
  readonly index: number;
  readonly depth: number;
  readonly left: number;
  readonly width: number;
}
export interface NleTimelineRow {
  readonly track: DeepReadonly<Track>;
  readonly clips: readonly {
    readonly clip: DeepReadonly<Clip>;
    readonly layer: SceneLayer;
    readonly left: number;
    readonly width: number;
  }[];
}
export interface TimingPreview extends Timing {
  readonly layerId: string;
}
/** Disposable rows reference the canonical layers; no independent clip records. */
export function timelineRows(
  source: RenderSource,
  zoom: number,
  preview?: TimingPreview,
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const linked = new Set(
    source.composition.tracks.flatMap((track) =>
      track.clips.map((clip) => clip.layerId),
    ),
  );
  const visit = (
    layers: readonly SceneLayer[],
    parentId: string | null,
    depth: number,
  ) => {
    layers.forEach((layer, index) => {
      if (linked.has(layer.id)) return;
      const timing = preview?.layerId === layer.id ? preview : layer;
      rows.push({
        layer,
        parentId,
        depth,
        index,
        left: timeToPixel(timing.startTime, zoom),
        width: timeToPixel(timing.duration, zoom),
      });
      visit(layer.children, layer.id, depth + 1);
    });
  };
  visit(source.composition.layers, null, 0);
  return rows;
}
export function nleTimelineRows(
  source: RenderSource,
  zoom: number,
): NleTimelineRow[] {
  return [...source.composition.tracks]
    .sort((a, b) => a.order - b.order)
    .map((track) => ({
      track,
      clips: track.clips.flatMap((clip) => {
        const layer = locateLayer(
          source.composition.layers,
          clip.layerId,
        )?.layer;
        return layer
          ? [
              {
                clip,
                layer,
                left: timeToPixel(clip.startTime, zoom),
                width: timeToPixel(clip.duration, zoom),
              },
            ]
          : [];
      }),
    }));
}
export type TimingGesture = 'move' | 'left' | 'right';
export const SNAP_THRESHOLD_PX = 8;
export function timingCommands(
  compositionId: string,
  layer: SceneLayer,
  timing: Timing,
): Command[] {
  return layer.startTime === timing.startTime &&
    layer.duration === timing.duration
    ? []
    : [
        {
          type: 'SET_LAYER_TIMING',
          compositionId,
          layerId: layer.id,
          startTime: timing.startTime,
          duration: timing.duration,
        },
      ];
}
/** Snap targets in composition time: bounds, playhead, markers and other clips'
 * edges (clips and legacy rows whose layer id is excluded are skipped). */
export function snapCandidates(
  source: RenderSource,
  zoom: number,
  excludedIds: readonly string[] = [],
  options: { playhead?: boolean; markerId?: string } = {},
): number[] {
  return [
    0,
    source.composition.duration,
    ...(options.playhead === false || source.currentTime === undefined
      ? []
      : [source.currentTime]),
    ...source.composition.markers
      .filter((marker) => marker.id !== options.markerId)
      .map((marker) => marker.time),
    ...source.composition.tracks.flatMap((track) =>
      track.clips
        .filter((clip) => !excludedIds.includes(clip.layerId))
        .flatMap((clip) => [clip.startTime, clip.startTime + clip.duration]),
    ),
    ...timelineRows(source, zoom)
      .filter((row) => !excludedIds.includes(row.layer.id))
      .flatMap((row) => [
        row.layer.startTime,
        row.layer.startTime + row.layer.duration,
      ]),
  ];
}
/** Nearest candidate within the CSS-pixel threshold (for playhead and marker drags). */
export function snapTime(
  time: number,
  candidates: readonly number[],
  zoom: number,
  snapPixels = SNAP_THRESHOLD_PX,
): { time: number; snapped: boolean } {
  let best = time,
    distance = pixelToTime(snapPixels, zoom),
    snapped = false;
  for (const candidate of candidates) {
    const d = Math.abs(candidate - time);
    if (d < distance || (!snapped && d === distance)) {
      distance = d;
      best = candidate;
      snapped = true;
    }
  }
  return { time: best, snapped };
}
export interface TrimBounds {
  readonly minStart: number;
  readonly maxEnd: number;
}
/** Frame grid first, then nearest boundary within the configurable CSS-pixel threshold.
 * Ties use candidate order: composition boundaries, then canonical depth-first rows. */
export function calculateTiming(
  source: RenderSource,
  layer: SceneLayer,
  kind: TimingGesture,
  deltaPixels: number,
  zoom: number,
  snapPixels = SNAP_THRESHOLD_PX,
  excludedIds: readonly string[] = [],
  bounds?: TrimBounds,
): Timing {
  return calculateSnappedTiming(
    source,
    layer,
    kind,
    deltaPixels,
    zoom,
    snapPixels,
    excludedIds,
    bounds,
  ).timing;
}
/** As calculateTiming, also naming the candidate time the moving edge snapped to.
 * Trim bounds (neighbours, source media) clamp after snapping; a clamped edge does
 * not report a snap unless it landed exactly on a candidate. */
export function calculateSnappedTiming(
  source: RenderSource,
  layer: SceneLayer,
  kind: TimingGesture,
  deltaPixels: number,
  zoom: number,
  snapPixels = SNAP_THRESHOLD_PX,
  excludedIds: readonly string[] = [],
  bounds?: TrimBounds,
): { timing: Timing; snap?: number } {
  if (!Number.isFinite(snapPixels) || snapPixels < 0)
    throw new RangeError('Invalid snap threshold');
  const unchanged = {
    timing: { startTime: layer.startTime, duration: layer.duration },
  };
  if (deltaPixels === 0) return unchanged;
  const { fps } = source.composition;
  const delta = frameToTime(
    timeToFrame(pixelToTime(deltaPixels, zoom), fps),
    fps,
  );
  if (delta === 0) return unchanged;
  const end = layer.startTime + layer.duration;
  const minimum = Math.min(frameToTime(1, fps), layer.duration);
  const minStart = Math.min(bounds?.minStart ?? 0, layer.startTime);
  const maxEnd = Math.max(bounds?.maxEnd ?? Infinity, end);
  let value =
    kind === 'right'
      ? Math.max(end + delta, layer.startTime + minimum)
      : kind === 'left'
        ? Math.max(0, Math.min(end - minimum, layer.startTime + delta))
        : Math.max(0, layer.startTime + delta);
  const candidates = snapCandidates(source, zoom, [layer.id, ...excludedIds]);
  let distance = pixelToTime(snapPixels, zoom),
    snapped = value;
  let found = false;
  let snapTarget: number | undefined;
  for (const candidate of candidates) {
    for (const target of kind === 'move'
      ? [candidate, candidate - layer.duration]
      : [candidate]) {
      const valid =
        kind === 'right'
          ? target >= layer.startTime + minimum && target <= maxEnd
          : kind === 'left'
            ? target >= minStart && target <= end - minimum
            : target >= 0;
      const d = Math.abs(target - value);
      if (valid && (d < distance || (!found && d === distance))) {
        distance = d;
        snapped = target;
        snapTarget = candidate;
        found = true;
      }
    }
  }
  value = snapped;
  if (kind === 'right') value = Math.min(maxEnd, value);
  if (kind === 'left') value = Math.max(minStart, value);
  if (value === (kind === 'right' ? end : layer.startTime)) return unchanged;
  const timing =
    kind === 'move'
      ? { startTime: value, duration: layer.duration }
      : kind === 'left'
        ? { startTime: value, duration: end - value }
        : { startTime: layer.startTime, duration: value - layer.startTime };
  const edges = [timing.startTime, timing.startTime + timing.duration];
  return snapTarget !== undefined &&
    edges.some((edge) => Math.abs(edge - snapTarget!) < 1e-9)
    ? { timing, snap: snapTarget }
    : { timing };
}
