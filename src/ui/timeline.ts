import { commands } from '../commands/registry';
import {
  groupOfTrack,
  laneDropPlan,
  resolveLaneDrop,
  type DropClip,
  type DropRow,
  type LaneDropTarget,
  type LaneGroup,
} from './timeline-drop';
import { assetDrag } from './drag-state';
import { announceMenu, dismissMenuOn } from './context-menu';
import {
  frameToTime,
  pixelToTime,
  timeToFrame,
  timeToPixel,
  effectiveLayerTiming,
  findClipByLayer,
  clipTimeEffects,
  clipSourceTime,
  clipLinkId,
  clipTrimBounds,
  retimeClip,
  trackAcceptsLayer,
  laneGroupOfTrack,
  laneGroupOfLayer,
  findClip,
  nextTrackName,
  clipTransition,
  type EditorEngine,
  type Command,
  clipAnimation,
  type Easing,
} from '../core';
import { t, formatNumber } from '../i18n';
import { locateLayer, type SceneLayer } from '../render/adapter';
import type { EditorSession } from './session';
import { keyframeTimes } from './keyframes';
import {
  hasCopiedKeyframes,
  moveSelectedKeyframes,
  runKeyframeAction,
  setSelectedEasing,
} from './keyframe-edit';
import {
  STRIP_FRAMES,
  WAVE_RATE,
  type MediaPreviews,
  type PreviewAsset,
  type WaveformCache,
} from '../media';
import {
  selectionRoots,
  performEdit,
  contextActions,
  jumpToCut,
  withLinked,
  moveClipsToAdjacentTrack,
  nudgeClips,
  setClipSpeed,
  trimClipToPlayhead,
  landingCommands,
  planLanding,
  type ClipLanding,
  SPEED_PRESETS,
  type EditAction,
} from './editing';
import { Playback } from './playback';
import {
  calculateSnappedTiming,
  nleTimelineRows,
  snapCandidates,
  snapTime as nearestSnap,
  type TrimBounds,
  timelineRows,
  timingCommands,
  SNAP_THRESHOLD_PX,
  type TimingGesture,
  type TimingPreview,
} from './timeline-model';
import { iconSvg } from './icons';

/** TL-027/TL-032 menu actions labelled from the command catalog. */
const CLIP_ACTIONS: readonly EditAction[] = [
  'cut',
  'copy',
  'paste',
  'link',
  'unlink',
  'detach-audio',
];
const formatTimelineTime = (time: number) => String(Number(time.toFixed(3)));
/** J13: minutes, seconds and hundredths (01:05.40). */
const timecode = (time: number) => {
  const hundredths = Math.round(Math.max(0, time) * 100);
  const minutes = Math.floor(hundredths / 6000);
  const seconds = (hundredths % 6000) / 100;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
};
/** T5: the Player bar's timecode, minutes and whole seconds (1:05). */
const shortTimecode = (time: number) => {
  const whole = Math.floor(Math.max(0, time) + 1e-6);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
/** T5: a typed time: seconds (65.5), m:ss(.cc) or h:mm:ss; null if not one. */
export function parseTimecode(text: string): number | null {
  const parts = text.trim().split(':');
  if (!parts.length || parts.length > 3) return null;
  if (
    !parts.every((part, index) =>
      index === parts.length - 1
        ? /^\d+(\.\d+)?$/.test(part)
        : /^\d+$/.test(part),
    )
  )
    return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** J10: the kind of element a clip holds, for its colour and icon. */
type ClipKind = 'text' | 'shape' | 'group' | 'video' | 'image' | 'audio';
const CLIP_ICONS: Record<ClipKind, string> = {
  text: 'text',
  shape: 'elements',
  group: 'group',
  video: 'media',
  image: 'image',
  audio: 'audio',
};
const clipKind = (layer: { readonly type: string }): ClipKind =>
  (['text', 'shape', 'group', 'video', 'image', 'audio'] as const).find(
    (kind) => kind === layer.type,
  ) ?? 'shape';
/** T3: where something dragged over the timeline would land. */
export type AssetTarget = LaneDropTarget;
/** T3: what is being dragged over the timeline. */
export interface LaneDropInfo {
  readonly group: LaneGroup;
  readonly duration: number;
  readonly name: string;
  /** Clip kind for the ghost's colour and icon. */
  readonly kind: string;
  /** A clip on the timeline being moved (not a target of its own move). */
  readonly moving?: string;
}

export class TimelineInteraction {
  #gesture: {
    layer: SceneLayer;
    layers: readonly SceneLayer[];
    kind: TimingGesture;
    compositionId: string;
    zoom: number;
    value: TimingPreview;
    destinationId?: string;
    bounds?: TrimBounds;
    snap?: number;
    locked?: boolean;
    /** Linked partners carried along in time only; they keep their tracks. */
    followers?: ReadonlySet<string>;
    /** J7: over a lane of another group; the drop snaps back. */
    refused?: boolean;
    overTrackId?: string | undefined;
  } | null = null;
  #unsubscribe: () => void;
  constructor(
    private readonly engine: EditorEngine,
    private readonly session: EditorSession,
    private readonly changed: () => void,
  ) {
    this.#unsubscribe = session.onChange(() => this.cancel());
  }
  get preview(): TimingPreview | undefined {
    return this.#gesture?.value;
  }
  /** Pointer-derived previews before the TL-030 insert rule adjusts them. */
  get rawPreviews(): readonly TimingPreview[] {
    const gesture = this.#gesture;
    if (!gesture) return [];
    if (gesture.kind !== 'move') return [gesture.value];
    const delta = gesture.value.startTime - gesture.layer.startTime;
    return gesture.layers.map((layer) => ({
      layerId: layer.id,
      startTime: layer.startTime + delta,
      duration: layer.duration,
    }));
  }
  get previews(): readonly TimingPreview[] {
    if (this.#gesture?.refused) return [];
    const plan = this.landingPlan;
    return this.rawPreviews.map((preview) => {
      const clip = findClipByLayer(
        this.session.source.composition,
        preview.layerId,
      );
      const placed = clip && plan?.placed.get(clip.clip.id);
      return placed === undefined || placed === null
        ? preview
        : { ...preview, startTime: placed };
    });
  }
  /** Clip landings of a move gesture (all moving layers must be clips). */
  #landings(): ClipLanding[] | undefined {
    const gesture = this.#gesture;
    if (!gesture || gesture.kind !== 'move' || gesture.refused)
      return undefined;
    const composition = this.session.source.composition;
    const moves = this.trackMoves;
    const landings: ClipLanding[] = [];
    for (const preview of this.rawPreviews) {
      const found = findClipByLayer(composition, preview.layerId);
      if (!found) return undefined;
      landings.push({
        clip: found.clip,
        trackId: moves.get(preview.layerId) ?? found.track.id,
        startTime: preview.startTime,
      });
    }
    return landings;
  }
  /**
   * TL-017: a cross-track move shifts every dragged clip by the same number of
   * tracks (in display order), so their track offsets are kept. Linked followers
   * keep their own tracks.
   */
  get trackMoves(): ReadonlyMap<string, string> {
    const gesture = this.#gesture;
    const destination = gesture?.destinationId?.startsWith('track:')
      ? gesture.destinationId.slice(6)
      : undefined;
    if (!gesture || !destination) return new Map();
    return (
      this.#planTrackMoves(
        gesture.layer,
        gesture.layers,
        destination,
        gesture.followers,
      ) ?? new Map()
    );
  }
  #planTrackMoves(
    anchor: SceneLayer,
    layers: readonly SceneLayer[],
    destinationTrackId: string,
    followers: ReadonlySet<string> | undefined,
  ): Map<string, string> | undefined {
    const composition = this.session.source.composition;
    const tracks = [...composition.tracks].sort((a, b) => a.order - b.order);
    const from = findClipByLayer(composition, anchor.id);
    const anchorIndex = tracks.findIndex(
      (track) => track.id === from?.track.id,
    );
    const shift =
      tracks.findIndex((track) => track.id === destinationTrackId) -
      anchorIndex;
    if (anchorIndex < 0 || shift === 0) return undefined;
    const moves = new Map<string, string>();
    for (const layer of layers) {
      if (followers?.has(layer.id)) continue;
      const found = findClipByLayer(composition, layer.id);
      if (!found) return undefined;
      const target =
        tracks[
          tracks.findIndex((track) => track.id === found.track.id) + shift
        ];
      if (!target || target.locked || !trackAcceptsLayer(target.type, layer))
        return undefined;
      moves.set(layer.id, target.id);
    }
    return moves;
  }
  /** TL-030 live plan: final starts, pushed clips and insertion markers. */
  get landingPlan(): ReturnType<typeof planLanding> | undefined {
    const landings = this.#landings();
    return landings
      ? planLanding(this.session.source.composition, landings)
      : undefined;
  }
  get destinationId(): string | undefined {
    return this.#gesture?.destinationId;
  }
  /** J7: the pointer is over a lane of another group (not allowed). */
  get refused(): boolean {
    return !!this.#gesture?.refused;
  }
  get refusedTrackId(): string | undefined {
    return this.#gesture?.refused ? this.#gesture.overTrackId : undefined;
  }
  /** Candidate time the moving edge is snapped to, for the visible guide. */
  get snapTime(): number | undefined {
    return this.#gesture?.snap;
  }
  begin(id: string, kind: TimingGesture): void {
    this.cancel();
    this.session.setPlaying(false);
    if (!this.session.selectedIds.includes(id)) this.session.select(id);
    const canonicalLayer = locateLayer(
      this.session.source.composition.layers,
      id,
    )?.layer;
    if (!canonicalLayer) throw new Error('Unknown layer');
    const location = findClipByLayer(this.session.source.composition, id);
    // Selecting a locked clip is fine; only an actual drag is refused (TL-004).
    const locked = !!location?.track.locked;
    const asTimedLayer = (layer: SceneLayer): SceneLayer => {
      const timing = effectiveLayerTiming(
        this.session.source.composition,
        layer,
      );
      return {
        ...layer,
        startTime: timing.startTime,
        duration: timing.duration,
      };
    };
    const layer = asTimedLayer(canonicalLayer);
    // TL-032: a move carries linked partners along (in time, not across tracks).
    const layers = selectionRoots(
      this.session.source,
      kind === 'move'
        ? withLinked(this.session.source, this.session.selectedIds)
        : this.session.selectedIds,
    ).map(asTimedLayer);
    if (kind !== 'move' && layers.length > 1)
      throw new Error('Select one clip to trim');
    // Trims stop at neighbouring clips and at the source media (TL-018/TL-019).
    const bounds =
      kind !== 'move' && location
        ? clipTrimBounds(
            this.session.source.composition,
            location.clip.id,
            this.session.source.assets.find(
              (asset) => asset.id === location.clip.assetId,
            )?.duration,
          )
        : undefined;
    const roots = new Set(
      selectionRoots(this.session.source, this.session.selectedIds).map(
        (item) => item.id,
      ),
    );
    const followers = new Set(
      layers.map((item) => item.id).filter((id) => !roots.has(id)),
    );
    this.#gesture = {
      ...(followers.size ? { followers } : {}),
      ...(bounds ? { bounds } : {}),
      ...(locked ? { locked } : {}),
      layer,
      layers,
      kind,
      compositionId: this.session.source.composition.id,
      zoom: this.session.timelineZoom,
      value: {
        layerId: id,
        startTime: layer.startTime,
        duration: layer.duration,
      },
    };
  }
  update(deltaPixels: number, destinationId?: string): void {
    const gesture = this.#gesture;
    if (!gesture) return;
    if (gesture.locked) {
      this.cancel();
      throw new Error('Track is locked');
    }
    try {
      const snapped = calculateSnappedTiming(
        this.session.source,
        gesture.layer,
        gesture.kind,
        deltaPixels,
        gesture.zoom,
        SNAP_THRESHOLD_PX,
        gesture.layers.map((layer) => layer.id),
        gesture.bounds,
      );
      let timing = snapped.timing;
      if (snapped.snap === undefined) delete gesture.snap;
      else gesture.snap = snapped.snap;
      if (gesture.kind === 'move') {
        const min = Math.min(...gesture.layers.map((layer) => layer.startTime));
        const delta = Math.max(
          -min,
          timing.startTime - gesture.layer.startTime,
        );
        timing = { ...timing, startTime: gesture.layer.startTime + delta };
      }
      delete gesture.destinationId;
      gesture.refused = false;
      if (gesture.kind === 'move' && destinationId?.startsWith('track:')) {
        const composition = this.session.source.composition;
        const lane = composition.tracks.find(
          (track) => track.id === destinationId.slice(6),
        );
        const from = findClipByLayer(composition, gesture.layer.id)?.track;
        gesture.overTrackId = lane?.id;
        gesture.refused =
          !!lane &&
          !!from &&
          laneGroupOfTrack(lane.type) !== laneGroupOfTrack(from.type);
      }
      if (gesture.kind === 'move' && destinationId && !gesture.refused) {
        const clips = gesture.layers
          .filter((layer) => !gesture.followers?.has(layer.id))
          .map((layer) => ({
            layer,
            location: findClipByLayer(
              this.session.source.composition,
              layer.id,
            ),
          }));
        if (
          clips.every((item) => item.location) &&
          destinationId.startsWith('track:')
        ) {
          // Every dragged clip must have an unlocked, compatible target track.
          if (
            this.#planTrackMoves(
              gesture.layer,
              gesture.layers,
              destinationId.slice(6),
              gesture.followers,
            )
          )
            gesture.destinationId = destinationId;
        } else if (
          clips.length === 1 &&
          clips.every((item) => !item.location)
        ) {
          const rows = timelineRows(this.session.source, gesture.zoom);
          const from = rows.find((row) => row.layer.id === gesture.layer.id);
          const to = rows.find((row) => row.layer.id === destinationId);
          if (
            from &&
            to &&
            from.parentId === to.parentId &&
            from.index !== to.index
          )
            gesture.destinationId = destinationId;
        }
      }
      gesture.value = {
        layerId: gesture.layer.id,
        startTime: timing.startTime,
        duration: timing.duration,
      };
      this.changed();
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  finish(): void {
    const gesture = this.#gesture;
    const previews = this.previews;
    const landings = this.#landings();
    this.#gesture = null;
    if (!gesture) return;
    // J7: a drop on a lane of another group changes nothing (it snaps back).
    if (gesture.refused) {
      this.changed();
      return;
    }
    try {
      if (landings) {
        // Clip moves land under the insert rule in one step (TL-020/TL-030).
        const commands = landingCommands(
          this.session.source.composition,
          landings,
        );
        if (commands.length)
          this.engine.commands.transaction('Move clip', commands);
        return;
      }
      const commands: Command[] = previews.flatMap((preview) => {
        const layer =
          gesture.layers.find((item) => item.id === preview.layerId) ??
          gesture.layer;
        const clip = findClipByLayer(
          this.session.source.composition,
          preview.layerId,
        );
        return clip
          ? clip.clip.startTime === preview.startTime &&
            clip.clip.duration === preview.duration
            ? []
            : [
                {
                  type: 'SET_CLIP_TIMING' as const,
                  compositionId: gesture.compositionId,
                  clipId: clip.clip.id,
                  // Reverse-aware: a reversed clip's left edge shows its out-point.
                  ...retimeClip(
                    clip.clip,
                    preview.startTime,
                    preview.duration,
                    gesture.kind,
                  ),
                },
              ]
          : timingCommands(gesture.compositionId, layer, preview);
      });
      if (gesture.destinationId) {
        const destinationTrackId = gesture.destinationId.startsWith('track:')
          ? gesture.destinationId.slice(6)
          : undefined;
        if (destinationTrackId) {
          const moves =
            this.#planTrackMoves(
              gesture.layer,
              gesture.layers,
              destinationTrackId,
              gesture.followers,
            ) ?? new Map<string, string>();
          for (const [layerId, trackId] of moves) {
            const clip = findClipByLayer(
              this.session.source.composition,
              layerId,
            );
            if (clip && clip.track.id !== trackId)
              commands.push({
                type: 'MOVE_CLIP',
                compositionId: gesture.compositionId,
                clipId: clip.clip.id,
                trackId,
              });
          }
        } else {
          const rows = timelineRows(this.session.source, gesture.zoom);
          const to = rows.find(
            (row) => row.layer.id === gesture.destinationId,
          )!;
          commands.push({
            type: 'MOVE_LAYER',
            compositionId: gesture.compositionId,
            layerId: gesture.layer.id,
            parentId: to.parentId,
            index: to.index,
          });
        }
      }
      if (commands.length)
        this.engine.commands.transaction(
          gesture.kind === 'move' ? 'Move clip' : 'Trim clip',
          commands,
        );
    } finally {
      this.changed();
    }
  }
  cancel(): void {
    if (this.#gesture) {
      this.#gesture = null;
      this.changed();
    }
  }
  reorder(id: string, direction: -1 | 1): void {
    const rows = timelineRows(this.session.source, this.session.timelineZoom);
    const row = rows.find((item) => item.layer.id === id);
    if (!row) return;
    const index = row.index + direction;
    if (
      !rows.some(
        (item) => item.parentId === row.parentId && item.index === index,
      )
    )
      return;
    this.engine.commands.transaction('Reorder layer', [
      {
        type: 'MOVE_LAYER',
        compositionId: this.session.source.composition.id,
        layerId: id,
        parentId: row.parentId,
        index,
      },
    ]);
  }
  deleteSelected(): void {
    performEdit(this.engine, this.session, 'delete');
  }
  dispose(): void {
    this.cancel();
    this.#unsubscribe();
  }
}

/** Stable event/capture surface; all row nodes below it are disposable projections. */
export function mountTimeline(
  root: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  changed: () => void,
  report: (error: unknown) => void,
  externalKeyboard = false,
  previews?: MediaPreviews,
  waveforms?: WaveformCache,
) {
  // J13: the Player panel. Left: the AI wand (planned) and the clip tools
  // (Split as scissors). Centre: previous cut, back 5 s, play, forward 5 s
  // and the timecode, with the frame steps and Stop kept. Right, floating:
  // zoom out, zoom in, fit and collapse.
  const player = (action: string, icon: string, key: string, size = 15) =>
    `<button class="icon-button" data-action="${action}" aria-label="${t(key)}" title="${t(key)}">${iconSvg(icon, size)}</button>`;
  root.innerHTML = `<div class="timeline-controls" data-resize-grip><div class="transport-group transport-clip-tools" role="group" aria-label="Clip actions"><button class="icon-button" data-action="ai-tools" aria-label="${t('player.ai')}" title="${t('player.aiPlanned')}" disabled>${iconSvg('magic', 20)}</button><button data-action="split" title="${t('player.split')}">${iconSvg('scissors', 20)}<span>${t('player.splitLabel')}</span></button><button data-action="duplicate" title="${t('player.duplicate')}">${iconSvg('duplicate', 20)}<span>${t('player.duplicateLabel')}</span></button><button data-action="marker" title="${t('player.marker')}">${iconSvg('marker', 20)}<span>${t('player.markerLabel')}</span></button></div><div class="transport-group transport-playback" role="group" aria-label="Playback">${player('first-frame', 'firstFrame', 'player.first', 20)}${player('back-5', 'back5', 'player.back5', 20)}<button class="icon-button" data-action="frame-back" aria-label="Previous frame" title="Previous frame (←)">${iconSvg('frameBack', 20)}</button><button class="transport-play-button" data-action="play" aria-label="Play or pause" title="Play/Pause (Space)">${iconSvg('play', 24)}</button><button class="icon-button" data-action="frame-forward" aria-label="Next frame" title="Next frame (→)">${iconSvg('frameForward', 20)}</button>${player('forward-5', 'forward5', 'player.forward5', 20)}${player('last-frame', 'lastFrame', 'player.last', 20)}<div class="transport-time"><span role="button" tabindex="0" class="player-timecode" data-timecode data-action="timecode" title="${t('player.timecodeTip')}"></span><output class="sr-only" data-current-time aria-label="Current time"></output><span class="sr-only" data-derived-duration></span></div><input type="range" class="player-scrub" data-action="scrub" min="0" step="any" aria-label="${t('player.scrub')}" title="${t('player.scrub')}" /></div><div class="transport-group transport-meta" role="group" aria-label="Composition and zoom"><span class="sr-only" data-composition-strip></span><button class="icon-button" data-action="zoom-out" aria-label="Timeline zoom out" title="${t('player.zoomOut')}">${iconSvg('zoomOut', 20)}</button><button class="icon-button" data-action="zoom-in" aria-label="Timeline zoom in" title="${t('player.zoomIn')}">${iconSvg('zoomIn', 20)}</button>${player('zoom-fit', 'fit', 'player.fit', 20)}<button class="icon-button" data-action="collapse-timeline" aria-expanded="true" aria-label="${t('player.collapse')}" title="${t('player.collapse')}">${iconSvg('chevronDown', 20)}</button></div></div><div class="timeline-scroll" tabindex="0"><div class="timeline-content"></div></div><div class="timeline-menu" role="menu" hidden><button role="menuitem" data-action="select">Select</button><button role="menuitem" data-action="delete">Delete</button></div>`;
  const scroll = root.querySelector<HTMLElement>('.timeline-scroll')!;
  const content = root.querySelector<HTMLElement>('.timeline-content')!;
  const menu = root.querySelector<HTMLElement>('.timeline-menu')!;
  scroll.setAttribute('aria-label', t('timeline.keys'));
  const headerWidth = 224;
  /** T3: lane heights (visual lanes taller, for their pictures). */
  const laneHeight = (group: string) => (group === 'visual' ? 56 : 36);
  /** Row index → top and height (content pixels below the ruler), for every
   *  lane then every unlinked layer row, as drawn. */
  const rowSpans = () => {
    const spans: { top: number; height: number }[] = [];
    let top = 0;
    for (const row of nleTimelineRows(session.source, session.timelineZoom)) {
      const height = laneHeight(laneGroupOfTrack(row.track.type));
      spans.push({ top, height });
      top += height;
    }
    for (const _row of timelineRows(session.source, session.timelineZoom)) {
      spans.push({ top, height: 36 });
      top += 36;
    }
    return { spans, total: top };
  };
  /** TL-046: filmstrip tiles (video) or a repeated thumbnail (image) behind the label. */
  const TILE_WIDTH = 48;
  const appendFilmstrip = (
    element: HTMLElement,
    clip: Parameters<typeof clipSourceTime>[0] & {
      readonly assetId: string | null;
    },
    zoom: number,
  ) => {
    if (!previews || !clip.assetId) return;
    const asset = (
      session.source.assets as unknown as readonly PreviewAsset[]
    ).find((item) => item.id === clip.assetId);
    if (!asset || (asset.type !== 'video' && asset.type !== 'image')) return;
    const preview =
      asset.type === 'video'
        ? previews.strip(asset)
        : previews.thumbnail(asset);
    // J8: a shimmer stands in while the filmstrip is decoded.
    element.classList.toggle('clip-loading', preview.state === 'loading');
    if (preview.state !== 'ready') return;
    const strip = document.createElement('div');
    strip.className = 'clip-filmstrip';
    strip.dataset.kind = asset.type;
    strip.setAttribute('aria-hidden', 'true');
    const count = Math.min(
      400,
      Math.max(1, Math.ceil(timeToPixel(clip.duration, zoom) / TILE_WIDTH)),
    );
    for (let index = 0; index < count; index++) {
      const tile = document.createElement('span');
      tile.className = 'clip-filmstrip-tile';
      tile.style.backgroundImage = `url("${preview.url}")`;
      if (asset.type === 'video' && asset.duration) {
        const time = clip.startTime + pixelToTime(index * TILE_WIDTH, zoom);
        const frame = Math.max(
          0,
          Math.min(
            STRIP_FRAMES - 1,
            Math.floor(
              (clipSourceTime(clip, time) / asset.duration) * STRIP_FRAMES,
            ),
          ),
        );
        tile.dataset.frame = String(frame);
        tile.style.backgroundSize = `${STRIP_FRAMES * TILE_WIDTH}px 100%`;
        tile.style.backgroundPosition = `${-frame * TILE_WIDTH}px 0`;
      }
      strip.append(tile);
    }
    element.prepend(strip);
  };
  /** TL-047: the clip's visible source window, one column per pixel, behind the label. */
  const appendWaveform = (
    element: HTMLElement,
    clip: Parameters<typeof clipSourceTime>[0] & {
      readonly assetId: string | null;
    },
    zoom: number,
  ) => {
    if (!waveforms || !clip.assetId) return;
    const asset = (
      session.source.assets as unknown as readonly PreviewAsset[]
    ).find((item) => item.id === clip.assetId);
    const wave = asset ? waveforms.waveform(asset) : undefined;
    if (wave?.state === 'loading') element.classList.add('clip-loading');
    if (wave?.state !== 'ready') return;
    const canvas = document.createElement('canvas');
    canvas.className = 'clip-waveform';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.max(
      1,
      Math.min(8192, Math.round(timeToPixel(clip.duration, zoom))),
    );
    canvas.height = 27;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-waveform')
        .trim();
      for (let x = 0; x < canvas.width; x++) {
        const source = clipSourceTime(
          clip,
          clip.startTime + pixelToTime(x + 0.5, zoom),
        );
        const peak = wave.peaks[Math.floor(source * WAVE_RATE)] ?? 0;
        const height = Math.max(1, (peak / wave.max) * canvas.height);
        context.fillRect(x, (canvas.height - height) / 2, 1, height);
      }
    }
    element.prepend(canvas);
  };
  const redrawForMedia = () => {
    // A filmstrip, thumbnail or waveform arrived: redraw though the project is unchanged.
    renderedProject = undefined;
    render();
  };
  const unsubscribePreviews = previews?.onChange(redrawForMedia);
  const unsubscribeWaveforms = waveforms?.onChange(redrawForMedia);
  /** Infinite timeline (TL-055): furthest time the user has scrolled to. Transient. */
  let reach = 0;
  let renderedSpan = 0;
  /** Guide for playhead and marker drags; clip gestures use controller.snapTime. */
  let pointerSnap: number | undefined;
  const MAX_SPAN = 24 * 60 * 60;
  const viewportPixels = () => Math.max(0, scroll.clientWidth - headerWidth);
  // Content end, anything scrolled to or being dragged, plus one empty viewport.
  const spanTime = () => {
    const zoom = session.timelineZoom;
    const previewEnd = Math.max(
      0,
      ...controller.previews.map((item) => item.startTime + item.duration),
    );
    return Math.min(
      MAX_SPAN,
      Math.max(session.source.composition.duration, reach, previewEnd) +
        pixelToTime(viewportPixels(), zoom),
    );
  };
  const playback = new Playback(session);
  let menuId: string | null = null;
  let menuMarker: string | undefined;
  let markerPreview: { id: string; time: number; origin: number } | undefined;
  let selectedMarkerId: string | undefined;
  let reorderId: string | undefined;
  let marquee:
    | {
        x: number;
        y: number;
        endX: number;
        endY: number;
        ids: readonly string[];
        originalIds: readonly string[];
      }
    | undefined;
  let suppressClick = false;
  /** J6: the clip whose timing popover is open (highlighted). */
  let highlighted: string | null = null;
  /** ANI-004: the frame-quantized offset of a keyframe drag in progress. */
  let keyframeDrag: { delta: number } | undefined;
  const isSelectedKeyframe = (layerId: string, time: number) =>
    session.selectedKeyframes.some(
      (item) => item.layerId === layerId && item.time === time,
    );
  /** One diamond per keyframe time of a layer (all animated properties). */
  const appendKeyframes = (
    track: HTMLElement,
    layerId: string,
    times: readonly number[],
    zoom: number,
  ) => {
    // H4: keyframes are shown and edited in 2D Animation only.
    if (session.mode !== 'animation2d') return;
    for (const time of times) {
      const selected = isSelectedKeyframe(layerId, time);
      const shown =
        selected && keyframeDrag
          ? Math.max(0, time + keyframeDrag.delta)
          : time;
      const diamond = button(
        iconSvg('diamondFilled', 12),
        'keyframe',
        layerId,
        true,
      );
      diamond.className = `timeline-keyframe${selected ? ' selected' : ''}`;
      diamond.dataset.time = String(time);
      diamond.setAttribute('aria-pressed', String(selected));
      diamond.title = t('timeline.keyframeAt', {
        time: formatTimelineTime(time),
      });
      diamond.setAttribute('aria-label', diamond.title);
      diamond.style.left = `${timeToPixel(shown, zoom)}px`;
      track.append(diamond);
    }
  };
  let pointer: {
    id: number;
    kind: 'clip' | 'playhead' | 'marker' | 'marquee' | 'keyframe';
    start: number;
    startY: number;
    scrollY: number;
    scroll: number;
    originalTime: number;
    moved: boolean;
    /** T3: a single clip being moved follows the lane drop rules. */
    laneMove?: {
      clipId: string;
      info: LaneDropInfo;
      /** U1: where the clip was grabbed, and its size (screen px). */
      grab: { x: number; y: number; w: number; h: number };
    };
  } | null = null;
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      cancel();
      report(error);
    }
  };
  const controller = new TimelineInteraction(engine, session, () => {
    render();
    changed();
  });
  const button = (
    text: string,
    action: string,
    id?: string,
    isHtml = false,
  ) => {
    const item = document.createElement('button');
    if (isHtml) item.innerHTML = text;
    else item.textContent = text;
    item.dataset.action = action;
    if (id) item.dataset.id = id;
    return item;
  };
  // TL-056: dedicated handles; the visible grip is CSS (hover or selection).
  const appendTrimHandles = (clip: HTMLElement) => {
    for (const edge of ['left', 'right'] as const) {
      const grip = document.createElement('span');
      grip.className = `timeline-trim ${edge}`;
      grip.dataset.trim = edge;
      grip.title = t(
        edge === 'left' ? 'timeline.trimStart' : 'timeline.trimEnd',
      );
      clip.append(grip);
    }
  };
  let renderedProject: unknown;
  let renderedIdentity = '';
  const render = () => {
    const { composition } = session.source;
    root.classList.toggle('lane-refused', controller.refused);
    const zoom = session.timelineZoom;
    const rows = timelineRows(session.source, zoom).map((row) => {
      const preview = controller.previews.find(
        (item) => item.layerId === row.layer.id,
      );
      return preview
        ? {
            ...row,
            left: timeToPixel(preview.startTime, zoom),
            width: timeToPixel(preview.duration, zoom),
          }
        : row;
    });
    const trackRows = nleTimelineRows(session.source, zoom);
    const landing = controller.landingPlan;
    const playButton = root.querySelector<HTMLElement>('[data-action="play"]')!;
    const playIcon = session.playing ? 'pause' : 'play';
    if (playButton.dataset.icon !== playIcon) {
      playButton.dataset.icon = playIcon;
      playButton.innerHTML = iconSvg(playIcon, 16);
    }
    const available = contextActions(
      session.source,
      session.selectedIds,
      session.currentTime,
    );
    for (const action of ['split', 'duplicate'])
      (
        root.querySelector(`[data-action="${action}"]`) as HTMLButtonElement
      ).disabled = !available.includes(action as EditAction);
    const focused =
      document.activeElement instanceof HTMLElement &&
      root.contains(document.activeElement)
        ? {
            id: document.activeElement.dataset.id,
            action: document.activeElement.dataset.action,
          }
        : null;
    root.querySelector('[data-composition-strip]')!.textContent =
      `${composition.name} · ${formatTimelineTime(composition.duration)}s · ${Math.round(composition.fps * 100) / 100} fps`;
    const code = root.querySelector<HTMLElement>('[data-timecode]')!;
    if (!code.querySelector('input'))
      code.textContent = t('player.timecode', {
        current: shortTimecode(session.currentTime),
        total: shortTimecode(composition.duration),
      });
    const scrub = root.querySelector<HTMLInputElement>('.player-scrub')!;
    scrub.max = String(composition.duration);
    if (document.activeElement !== scrub || !scrub.matches(':active'))
      scrub.value = String(session.currentTime);
    scrub.style.setProperty(
      '--played',
      `${composition.duration ? (session.currentTime / composition.duration) * 100 : 0}%`,
    );
    root.querySelector('[data-current-time]')!.textContent =
      `${session.currentTime.toFixed(3)}s / ${formatTimelineTime(composition.duration)}s · frame ${timeToFrame(session.currentTime, composition.fps)}`;
    root.querySelector('[data-derived-duration]')!.textContent =
      `${formatTimelineTime(composition.duration)}s content length`;
    const span = spanTime();
    const guideTime = controller.snapTime ?? pointerSnap;
    const identity = JSON.stringify([
      composition.id,
      session.selectedIds,
      zoom,
      span,
      guideTime,
      session.soloTrackIds,
      session.selectedKeyframes,
    ]);
    if (
      renderedProject === engine.state &&
      renderedIdentity === identity &&
      !controller.preview &&
      !markerPreview &&
      !marquee &&
      !keyframeDrag
    ) {
      const playhead = content.querySelector<HTMLElement>('.timeline-playhead');
      if (playhead)
        playhead.style.left = `${headerWidth + timeToPixel(session.currentTime, zoom)}px`;
      return;
    }
    renderedProject = engine.state;
    renderedIdentity =
      controller.preview || markerPreview || marquee || keyframeDrag
        ? ''
        : identity;
    content.replaceChildren();
    renderedSpan = span;
    const width = timeToPixel(span, zoom);
    content.dataset.span = String(span);
    content.style.width = `${headerWidth + width + 24}px`;
    const ruler = document.createElement('div');
    ruler.className = 'timeline-ruler';
    ruler.dataset.action = 'seek';
    ruler.style.marginLeft = `${headerWidth}px`;
    ruler.style.width = `${width}px`;
    // At least 70 CSS pixels per label, with a bounded count even for long compositions.
    const step = Math.max(
      frameToTime(1, composition.fps),
      2 ** Math.ceil(Math.log2(70 / zoom)),
      span / 1000,
    );
    for (let time = 0; time <= span + 1e-9; time += step) {
      const label = document.createElement('span');
      label.textContent = `${Number(time.toFixed(3))}s`;
      label.style.left = `${timeToPixel(time, zoom)}px`;
      ruler.append(label);
    }
    const rulerBar = document.createElement('div');
    rulerBar.className = 'timeline-ruler-bar';
    rulerBar.style.setProperty('--track-height', `${rowSpans().total}px`);
    // J10: the selected clip's span and length on the ruler.
    const picked =
      session.selectedIds.length === 1
        ? findClipByLayer(composition, session.selectedIds[0]!)
        : undefined;
    if (picked) {
      const pill = document.createElement('span');
      pill.className = 'ruler-duration';
      pill.style.left = `${timeToPixel(picked.clip.startTime, zoom)}px`;
      pill.style.width = `${Math.max(24, timeToPixel(picked.clip.duration, zoom))}px`;
      pill.textContent = t('timeline.durationPill', {
        time: formatTimelineTime(Math.round(picked.clip.duration * 100) / 100),
      });
      ruler.append(pill);
    }
    rulerBar.append(ruler);
    content.append(rulerBar);
    const trackMoves = controller.trackMoves;
    for (const [trackIndex, row] of trackRows.entries()) {
      const line = document.createElement('div');
      line.className = 'timeline-row timeline-nle-row';
      line.dataset.rowId = `track:${row.track.id}`;
      line.dataset.trackId = row.track.id;
      // J7: lanes come in groups (text and shapes, visuals, audio); a line
      // separates them, and a lane of another group refuses a dragged clip.
      const laneGroup = laneGroupOfTrack(row.track.type);
      line.dataset.laneGroup = laneGroup;
      line.style.height = `${laneHeight(laneGroup)}px`;
      line.classList.toggle(
        'lane-group-start',
        trackIndex > 0 &&
          laneGroupOfTrack(trackRows[trackIndex - 1]!.track.type) !== laneGroup,
      );
      line.classList.toggle(
        'drop-refused',
        controller.refused && controller.refusedTrackId === row.track.id,
      );
      line.classList.toggle(
        'drop-target',
        [...trackMoves.values()].includes(row.track.id),
      );
      line.classList.toggle(
        'selected',
        row.clips.some((item) => session.selectedIds.includes(item.layer.id)),
      );
      const header = document.createElement('div');
      header.className = 'timeline-row-header timeline-track-header';
      const label = document.createElement('span');
      label.className = 'track-name';
      // U1: named by kind and number in display order ("Video 1", "Shape
      // 2"), with a kind icon; the stored name is in the tooltip.
      const sameKind = trackRows.filter(
        (other) => other.track.type === row.track.type,
      );
      label.textContent = t('lane.name', {
        kind: t(`lane.kind.${row.track.type}`),
        n: sameKind.indexOf(row) + 1,
      });
      label.title = row.track.name;
      const kindIcon = document.createElement('span');
      kindIcon.className = 'track-kind-icon';
      kindIcon.setAttribute('aria-hidden', 'true');
      kindIcon.innerHTML = iconSvg(
        row.track.type === 'video'
          ? 'media'
          : row.track.type === 'audio'
            ? 'audio'
            : row.track.type === 'text'
              ? 'text'
              : 'elements',
        20,
      );
      header.append(kindIcon);
      // TL-059: every toggle exposes its state through aria-pressed.
      const toggle = (
        action: string,
        icon: string,
        pressed: boolean,
        label: string,
      ) => {
        const item = button(iconSvg(icon, 14), action, row.track.id, true);
        item.classList.add('track-toggle');
        item.setAttribute('aria-pressed', String(pressed));
        item.setAttribute('aria-label', label);
        item.title = label;
        return item;
      };
      const name = { name: row.track.name };
      const soloed = session.soloTrackIds.includes(row.track.id);
      const lock = toggle(
        'track-lock',
        row.track.locked ? 'lock' : 'unlock',
        row.track.locked,
        t(row.track.locked ? 'track.unlock' : 'track.lock', name),
      );
      const enable = toggle(
        'track-enable',
        row.track.enabled ? 'eye' : 'eyeOff',
        !row.track.enabled,
        t(row.track.enabled ? 'track.hide' : 'track.show', name),
      );
      const solo = toggle(
        'track-solo',
        'solo',
        soloed,
        t(soloed ? 'track.unsolo' : 'track.solo', name),
      );
      const mute = toggle(
        'track-mute',
        row.track.muted ? 'mute' : 'speaker',
        row.track.muted,
        t(row.track.muted ? 'track.unmute' : 'track.mute', name),
      );
      const up = button(iconSvg('arrowUp', 13), 'track-up', row.track.id, true);
      const down = button(
        iconSvg('arrowDown', 13),
        'track-down',
        row.track.id,
        true,
      );
      // J7: a lane moves only within its group.
      const group = laneGroupOfTrack(row.track.type);
      const sameGroup = (index: number) =>
        !!trackRows[index] &&
        laneGroupOfTrack(trackRows[index]!.track.type) === group;
      up.disabled = !sameGroup(trackIndex - 1);
      down.disabled = !sameGroup(trackIndex + 1);
      up.setAttribute('aria-label', `Move ${row.track.name} track up`);
      down.setAttribute('aria-label', `Move ${row.track.name} track down`);
      up.title = up.getAttribute('aria-label')!;
      down.title = down.getAttribute('aria-label')!;
      header.append(label, lock, enable, solo, mute, up, down);
      const track = document.createElement('div');
      track.className = 'timeline-track';
      track.dataset.trackId = row.track.id;
      track.style.width = `${width}px`;
      const crossTrack = controller.destinationId?.startsWith('track:');
      // TL-030 preview: where the drop inserts and which clips it pushes.
      for (const insertion of landing?.insertions ?? []) {
        if (insertion.trackId !== row.track.id) continue;
        const marker = document.createElement('div');
        marker.className = 'timeline-insert';
        marker.dataset.time = String(insertion.time);
        marker.setAttribute('aria-hidden', 'true');
        marker.style.left = `${timeToPixel(insertion.time, zoom)}px`;
        track.append(marker);
      }
      for (const entry of row.clips) {
        const moving = controller.previews.find(
          (item) => item.layerId === entry.layer.id,
        );
        // TL-058: across tracks the original stays put (dimmed); a ghost lands.
        const pushedTo = landing?.pushed.get(entry.clip.id)?.startTime;
        const preview = crossTrack
          ? undefined
          : (moving ??
            (pushedTo === undefined
              ? undefined
              : { startTime: pushedTo, duration: entry.clip.duration }));
        const clip = button(entry.clip.name, 'clip', entry.layer.id);
        clip.className = `timeline-clip nle-clip${entry.clip.enabled ? '' : ' disabled'}${crossTrack && moving ? ' drag-origin' : ''}${pushedTo === undefined ? '' : ' pushed'}${row.track.locked ? ' locked' : ''}`;
        clip.dataset.clipId = entry.clip.id;
        clip.dataset.trackId = row.track.id;
        // J10: a colour and an icon per kind of element.
        const kind = clipKind(entry.layer);
        clip.dataset.kind = kind;
        const icon = document.createElement('span');
        icon.className = 'clip-kind-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = iconSvg(CLIP_ICONS[kind], 12);
        clip.prepend(icon);
        if (highlighted === entry.layer.id)
          clip.classList.add('timing-highlight');
        clip.style.left = `${preview ? timeToPixel(preview.startTime, zoom) : entry.left}px`;
        clip.style.width = `${preview ? timeToPixel(preview.duration, zoom) : entry.width}px`;
        clip.title = `${entry.clip.name}: ${formatTimelineTime(entry.clip.startTime)}s, ${formatTimelineTime(entry.clip.duration)}s duration`;
        clip.setAttribute(
          'aria-pressed',
          String(session.selectedIds.includes(entry.layer.id)),
        );
        const effects = clipTimeEffects(entry.clip);
        const badges: [string, string, string][] = [];
        if (effects.speed !== 1)
          badges.push([
            'speed',
            t('clip.speedValue', { speed: formatNumber(effects.speed) }),
            t('clip.speedBadge', { speed: formatNumber(effects.speed) }),
          ]);
        if (effects.reversed)
          badges.push(['reverse', iconSvg('reverse', 11), t('clip.reversed')]);
        if (effects.freezeFrame !== null)
          badges.push(['freeze', iconSvg('freeze', 11), t('clip.frozen')]);
        if (clipLinkId(entry.clip))
          badges.push(['link', iconSvg('link', 11), t('clip.linked')]);
        // W5-C: the clip has animation presets.
        if (Object.keys(clipAnimation(entry.clip)).length)
          badges.push([
            'animation',
            iconSvg('animate', 11),
            t('clip.animated'),
          ]);
        for (const [kind, content, label] of badges) {
          const badge = document.createElement('span');
          badge.className = 'clip-badge';
          badge.dataset.badge = kind;
          badge.innerHTML = content;
          badge.title = label;
          badge.setAttribute('aria-label', label);
          clip.append(badge);
        }
        if (entry.layer.type === 'audio')
          appendWaveform(clip, entry.clip, zoom);
        else appendFilmstrip(clip, entry.clip, zoom);
        appendTrimHandles(clip);
        track.append(clip);
        // Keyframes inside the clip's range (the clip carries them when moved).
        appendKeyframes(
          track,
          entry.layer.id,
          keyframeTimes(entry.layer).filter(
            (time) =>
              time >= entry.clip.startTime - 1e-9 &&
              time <= entry.clip.startTime + entry.clip.duration + 1e-9,
          ),
          zoom,
        );
      }
      const spans = [...row.clips]
        .map((entry) => entry.clip)
        .sort((a, b) => a.startTime - b.startTime);
      // J12: where two clips touch, a + adds a transition; a cut that has one
      // shows a chip that opens it. Both open the Transition panel.
      for (let index = 1; index < spans.length; index++) {
        const before = spans[index - 1]!,
          after = spans[index]!;
        if (
          Math.abs(before.startTime + before.duration - after.startTime) > 1e-6
        )
          continue;
        const transition = clipTransition(
          after as unknown as { transitionMetadata: Record<string, unknown> },
        );
        const cut = document.createElement('button');
        cut.type = 'button';
        cut.dataset.action = 'transition';
        cut.dataset.id = after.id;
        cut.className = transition ? 'transition-chip' : 'transition-add';
        cut.style.left = `${timeToPixel(after.startTime, zoom)}px`;
        const label = transition
          ? t('transition.chip', {
              name: t(`transition.type.${transition.type}`),
              time: formatTimelineTime(transition.duration),
            })
          : t('transition.add');
        cut.setAttribute('aria-label', label);
        cut.title = label;
        cut.innerHTML = iconSvg(transition ? 'transitions' : 'plus', 12);
        if (row.track.locked) cut.disabled = true;
        track.append(cut);
      }
      // J11: a gap between two clips is hatched; its trash button closes it
      // (the later clips on the lane move left, one step).
      const frame = frameToTime(1, composition.fps);
      for (let index = 1; index < spans.length; index++) {
        const end = spans[index - 1]!.startTime + spans[index - 1]!.duration;
        const next = spans[index]!.startTime;
        if (next - end < frame - 1e-9) continue;
        const gap = document.createElement('div');
        gap.className = 'timeline-gap';
        gap.dataset.start = String(end);
        gap.dataset.end = String(next);
        gap.style.left = `${timeToPixel(end, zoom)}px`;
        gap.style.width = `${timeToPixel(next - end, zoom)}px`;
        if (!row.track.locked && timeToPixel(next - end, zoom) >= 18) {
          const close = button(
            iconSvg('delete', 12),
            'close-gap',
            row.track.id,
            true,
          );
          close.dataset.time = String(end);
          const label = t('timeline.closeGap', {
            time: formatTimelineTime(Math.round((next - end) * 100) / 100),
          });
          close.setAttribute('aria-label', label);
          close.title = label;
          gap.append(close);
        }
        track.append(gap);
      }
      if (crossTrack)
        for (const item of controller.previews) {
          if (trackMoves.get(item.layerId) !== row.track.id) continue;
          const origin = trackRows
            .flatMap((other) => other.clips)
            .find((entry) => entry.layer.id === item.layerId);
          if (!origin) continue;
          const ghost = document.createElement('div');
          ghost.className = 'timeline-clip-ghost';
          ghost.dataset.ghostFor = origin.clip.id;
          ghost.dataset.startTime = String(item.startTime);
          ghost.textContent = origin.clip.name;
          ghost.style.left = `${timeToPixel(item.startTime, zoom)}px`;
          ghost.style.width = `${timeToPixel(item.duration, zoom)}px`;
          track.append(ghost);
        }
      line.append(header, track);
      content.append(line);
    }
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'timeline-row';
      line.dataset.rowId = row.layer.id;
      line.classList.toggle(
        'drop-target',
        controller.destinationId === row.layer.id,
      );
      line.classList.toggle(
        'selected',
        session.selectedIds.includes(row.layer.id),
      );
      const header = document.createElement('div');
      header.className = 'timeline-row-header';
      header.draggable = true;
      header.dataset.reorderId = row.layer.id;
      const select = document.createElement('button');
      select.dataset.action = 'select';
      select.dataset.id = row.layer.id;
      const selectIcon = document.createElement('span');
      selectIcon.className = 'layer-icon';
      selectIcon.setAttribute('aria-hidden', 'true');
      selectIcon.innerHTML = iconSvg(
        row.layer.type === 'group'
          ? 'group'
          : row.layer.type === 'text'
            ? 'text'
            : row.layer.type === 'audio'
              ? 'audio'
              : row.layer.type === 'image'
                ? 'image'
                : row.layer.type === 'shape'
                  ? 'elements'
                  : 'media',
        13,
      );
      select.append(selectIcon, document.createTextNode(row.layer.name));
      select.style.paddingLeft = `${8 + row.depth * 12}px`;
      select.setAttribute(
        'aria-pressed',
        String(session.selectedIds.includes(row.layer.id)),
      );
      const up = button(iconSvg('arrowUp', 13), 'up', row.layer.id, true),
        down = button(iconSvg('arrowDown', 13), 'down', row.layer.id, true);
      up.setAttribute('aria-label', `Move ${row.layer.name} row up`);
      down.setAttribute('aria-label', `Move ${row.layer.name} row down`);
      up.title = up.getAttribute('aria-label')!;
      down.title = down.getAttribute('aria-label')!;
      up.disabled = row.index === 0;
      down.disabled = !rows.some(
        (other) =>
          other.parentId === row.parentId && other.index === row.index + 1,
      );
      header.append(select, up, down);
      const track = document.createElement('div');
      track.className = 'timeline-track';
      track.style.width = `${width}px`;
      const clip = button(row.layer.name, 'clip', row.layer.id);
      clip.className = 'timeline-clip';
      clip.style.left = `${row.left}px`;
      clip.style.width = `${row.width}px`;
      clip.title = `${row.layer.name}: ${row.layer.startTime}s, ${row.layer.duration}s duration`;
      clip.setAttribute(
        'aria-pressed',
        String(session.selectedIds.includes(row.layer.id)),
      );
      appendTrimHandles(clip);
      track.append(clip);
      appendKeyframes(track, row.layer.id, keyframeTimes(row.layer), zoom);
      line.append(header, track);
      content.append(line);
    }
    // J8, T3: a hint row stands in for each lane group that has no lane with
    // clips yet; each adds that kind of element (the shell runs it).
    const missing = (['text', 'video', 'audio'] as const).filter(
      (kind) =>
        !composition.tracks.some(
          (track) =>
            track.clips.length &&
            groupOfTrack(track.type) === (kind === 'video' ? 'visual' : kind),
        ),
    );
    if (!rows.length && missing.length) {
      const hints = document.createElement('div');
      hints.className = 'timeline-hints';
      hints.style.marginLeft = `${headerWidth}px`;
      for (const kind of missing) {
        const hint = document.createElement('button');
        hint.type = 'button';
        hint.className = 'timeline-hint';
        hint.dataset.hint = kind;
        hint.innerHTML = `${iconSvg(kind === 'text' ? 'text' : kind === 'video' ? 'media' : 'audio', 15)}<span></span>`;
        hint.querySelector('span')!.textContent = t(`timeline.hint.${kind}`);
        hint.onclick = () =>
          root.dispatchEvent(
            new CustomEvent('timeline-hint', { detail: kind, bubbles: true }),
          );
        hints.append(hint);
      }
      content.append(hints);
    }
    const playhead = button(
      iconSvg('chevronDown', 12),
      'seek',
      undefined,
      true,
    );
    playhead.className = 'timeline-playhead';
    playhead.setAttribute('aria-label', 'Drag playhead');
    playhead.style.setProperty('--track-height', `${rowSpans().total}px`);
    playhead.style.left = `${headerWidth + timeToPixel(session.currentTime, zoom)}px`;
    rulerBar.append(playhead);
    for (const marker of composition.markers) {
      const item = button(
        iconSvg('marker', 12),
        'marker-handle',
        marker.id,
        true,
      );
      item.className =
        marker.id === selectedMarkerId
          ? 'timeline-marker timeline-marker--selected'
          : 'timeline-marker';
      item.title = marker.label || 'Marker';
      item.style.left = `${headerWidth + timeToPixel(markerPreview?.id === marker.id ? markerPreview.time : marker.time, zoom)}px`;
      rulerBar.append(item);
    }
    if (guideTime !== undefined) {
      // TL-057: one line over the ruler and every row at the snapped time.
      const guide = document.createElement('div');
      guide.className = 'timeline-snap';
      guide.dataset.time = String(guideTime);
      guide.setAttribute('aria-hidden', 'true');
      guide.style.left = `${headerWidth + timeToPixel(guideTime, zoom)}px`;
      guide.style.height = `${28 + rowSpans().total}px`;
      content.append(guide);
    }
    if (marquee) {
      const box = document.createElement('div');
      box.className = 'timeline-marquee';
      box.style.left = `${headerWidth + Math.min(marquee.x, marquee.endX)}px`;
      box.style.top = `${28 + Math.min(marquee.y, marquee.endY)}px`;
      box.style.width = `${Math.abs(marquee.endX - marquee.x)}px`;
      box.style.height = `${Math.abs(marquee.endY - marquee.y)}px`;
      content.append(box);
    }
    if (focused?.action)
      [...content.querySelectorAll<HTMLElement>('[data-action]')]
        .find(
          (item) =>
            item.dataset.action === focused.action &&
            item.dataset.id === focused.id,
        )
        ?.focus({ preventScroll: true });
    // J9: a media drag in progress keeps its marks across re-renders.
    showAssetTarget();
  };
  const release = () => {
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && root.hasPointerCapture(id))
      root.releasePointerCapture(id);
  };
  const cancel = () => {
    if (pointer?.laneMove) {
      hideFloat();
      clearAssetDropTarget();
    }
    const originalTime =
      pointer?.kind === 'playhead' ? pointer.originalTime : undefined;
    const originalIds = marquee?.originalIds;
    release();
    markerPreview = undefined;
    selectedMarkerId = undefined;
    marquee = undefined;
    pointerSnap = undefined;
    keyframeDrag = undefined;
    controller.cancel();
    render();
    if (originalIds) session.selectMany(originalIds);
    if (originalTime !== undefined) session.setCurrentTime(originalTime);
    menu.hidden = true;
  };
  const seek = (x: number) =>
    session.setCurrentTime(
      pixelToTime(
        x -
          scroll.getBoundingClientRect().left +
          scroll.scrollLeft -
          headerWidth,
        session.timelineZoom,
      ),
    );
  const stepFrame = (direction: -1 | 1, big = false) => {
    session.setPlaying(false);
    session.setCurrentTime(
      session.currentTime +
        frameToTime(direction * (big ? 10 : 1), session.source.composition.fps),
    );
  };
  const update = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY))
      throw new RangeError('Invalid pointer coordinate');
    if (pointer.kind === 'keyframe') {
      const dx =
        event.clientX - pointer.start + scroll.scrollLeft - pointer.scroll;
      if (Math.abs(dx) >= 3) pointer.moved = true;
      if (!pointer.moved) return;
      const fps = session.source.composition.fps;
      keyframeDrag = {
        delta: Math.round(pixelToTime(dx, session.timelineZoom) * fps) / fps,
      };
      render();
      return;
    }
    if (pointer.kind === 'playhead') {
      if (Math.abs(event.clientX - pointer.start) >= 3) pointer.moved = true;
      if (!pointer.moved) return;
      // TL-057: a dragged playhead snaps to clip edges and markers.
      const zoom = session.timelineZoom;
      const raw = pixelToTime(
        event.clientX -
          scroll.getBoundingClientRect().left +
          scroll.scrollLeft -
          headerWidth,
        zoom,
      );
      const snapped = nearestSnap(
        raw,
        snapCandidates(session.source, zoom, [], { playhead: false }),
        zoom,
      );
      const next = snapped.snapped ? snapped.time : undefined;
      const changed = next !== pointerSnap;
      pointerSnap = next;
      session.setCurrentTime(snapped.time);
      if (changed) render();
    } else if (pointer.kind === 'marker') {
      const deltaPixels = event.clientX - pointer.start;
      if (Math.abs(deltaPixels) >= 3) pointer.moved = true;
      if (pointer.moved) {
        const zoom = session.timelineZoom;
        const snapped = nearestSnap(
          markerPreview!.origin + pixelToTime(deltaPixels, zoom),
          snapCandidates(session.source, zoom, [], {
            markerId: markerPreview!.id,
          }),
          zoom,
        );
        markerPreview!.time = Math.max(
          0,
          Math.min(session.source.composition.duration, snapped.time),
        );
        pointerSnap =
          snapped.snapped && markerPreview!.time === snapped.time
            ? snapped.time
            : undefined;
        render();
      }
    } else if (pointer.kind === 'marquee') {
      const bounds = scroll.getBoundingClientRect();
      const x = event.clientX - bounds.left + scroll.scrollLeft - headerWidth,
        y = event.clientY - bounds.top + scroll.scrollTop - 28;
      const { spans } = rowSpans();
      const selected = [
        ...nleTimelineRows(session.source, session.timelineZoom).flatMap(
          (row, index) =>
            row.clips.map((item) => ({
              id: item.layer.id,
              left: item.left,
              width: item.width,
              index,
            })),
        ),
        ...timelineRows(session.source, session.timelineZoom).map(
          (row, index) => ({
            id: row.layer.id,
            left: row.left,
            width: row.width,
            index:
              index +
              nleTimelineRows(session.source, session.timelineZoom).length,
          }),
        ),
      ]
        .filter(
          (item) =>
            item.left + item.width >= Math.min(marquee!.x, x) &&
            item.left <= Math.max(marquee!.x, x) &&
            spans[item.index]!.top + spans[item.index]!.height >=
              Math.min(marquee!.y, y) &&
            spans[item.index]!.top <= Math.max(marquee!.y, y),
        )
        .map((item) => item.id);
      marquee!.endX = x;
      marquee!.endY = y;
      session.selectMany([...marquee!.ids, ...selected]);
      render();
    } else {
      const delta =
        event.clientX - pointer.start + scroll.scrollLeft - pointer.scroll;
      const deltaY =
        event.clientY - pointer.startY + scroll.scrollTop - pointer.scrollY;
      if (Math.abs(delta) >= 3 || Math.abs(deltaY) >= 3) pointer.moved = true;
      if (pointer.moved) {
        const area = root.getBoundingClientRect();
        root.classList.toggle(
          'drag-outside',
          area.width > 0 &&
            (event.clientX < area.left ||
              event.clientX > area.right ||
              event.clientY < area.top ||
              event.clientY > area.bottom),
        );
        // U1: one clip moves freely: a clip-size copy follows the pointer
        // (keeping the grab offset), the original stays faint, and the lane
        // under the pointer decides the drop (T3 rules, never Replace).
        if (pointer.laneMove) {
          const move = pointer.laneMove;
          showFloat(move, event.clientX, event.clientY);
          laneDropAt(
            move.info,
            event.clientX,
            event.clientY,
            event.clientX - move.grab.x,
          );
          return;
        }
        const bounds = scroll.getBoundingClientRect();
        const offset = event.clientY - bounds.top + scroll.scrollTop - 28;
        const index = rowSpans().spans.findIndex(
          (span) => offset >= span.top && offset < span.top + span.height,
        );
        const destinationIds = [
          ...nleTimelineRows(session.source, session.timelineZoom).map(
            (row) => `track:${row.track.id}`,
          ),
          ...timelineRows(session.source, session.timelineZoom).map(
            (row) => row.layer.id,
          ),
        ];
        const destination =
          Math.abs(deltaY) >= 3 &&
          event.clientY >= bounds.top + 28 &&
          event.clientY < bounds.bottom
            ? destinationIds[index]
            : undefined;
        controller.update(delta, destination);
      }
    }
  };
  const pointerdown = (event: PointerEvent) =>
    safely(() => {
      if (pointer || event.button !== 0 || event.isPrimary === false) return;
      const target = event.target as HTMLElement;
      // ANI-004: a diamond selects its keyframes and starts a drag.
      const diamond = target.closest<HTMLElement>('[data-action="keyframe"]');
      if (diamond) {
        event.preventDefault();
        session.setPlaying(false);
        menu.hidden = true;
        const item = {
          layerId: diamond.dataset.id!,
          time: Number(diamond.dataset.time),
        };
        const additive = event.shiftKey || event.ctrlKey || event.metaKey;
        if (additive) session.selectKeyframes([item], true);
        else if (!isSelectedKeyframe(item.layerId, item.time)) {
          if (!session.selectedIds.includes(item.layerId))
            session.select(item.layerId);
          session.selectKeyframes([item]);
        }
        pointer = {
          id: event.pointerId,
          kind: 'keyframe',
          start: event.clientX,
          startY: event.clientY,
          scrollY: scroll.scrollTop,
          scroll: scroll.scrollLeft,
          originalTime: session.currentTime,
          moved: false,
        };
        root.setPointerCapture(event.pointerId);
        scroll.focus({ preventScroll: true });
        return;
      }
      const clip = target.closest<HTMLElement>('[data-action="clip"]');
      const ruler = target.closest('[data-action="seek"]');
      const marker = target.closest<HTMLElement>(
        '[data-action="marker-handle"]',
      );
      const empty = target.classList.contains('timeline-track');
      if (!clip && !ruler && !marker && !empty) return;
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY))
        throw new RangeError('Invalid pointer coordinate');
      event.preventDefault();
      suppressClick = false;
      session.setPlaying(false);
      menu.hidden = true;
      if (clip && (event.shiftKey || event.ctrlKey || event.metaKey)) {
        session.select(clip.dataset.id!, true);
        return;
      }
      if (empty) {
        const bounds = scroll.getBoundingClientRect();
        marquee = {
          x: event.clientX - bounds.left + scroll.scrollLeft - headerWidth,
          y: event.clientY - bounds.top + scroll.scrollTop - 28,
          endX: event.clientX - bounds.left + scroll.scrollLeft - headerWidth,
          endY: event.clientY - bounds.top + scroll.scrollTop - 28,
          originalIds: session.selectedIds,
          ids: event.shiftKey ? session.selectedIds : [],
        };
        if (!event.shiftKey) session.select(null);
      }
      if (marker) {
        const found = session.source.composition.markers.find(
          (item) => item.id === marker.dataset.id,
        )!;
        markerPreview = { id: found.id, time: found.time, origin: found.time };
      } else if (selectedMarkerId) {
        selectedMarkerId = undefined;
        render();
      }
      if (clip)
        controller.begin(
          clip.dataset.id!,
          (target.dataset.trim as TimingGesture | undefined) ?? 'move',
        );
      pointer = {
        id: event.pointerId,
        kind: clip
          ? 'clip'
          : marker
            ? 'marker'
            : empty
              ? 'marquee'
              : 'playhead',
        start: event.clientX,
        startY: event.clientY,
        scrollY: scroll.scrollTop,
        scroll: scroll.scrollLeft,
        originalTime: session.currentTime,
        moved: false,
      };
      // T3: one unlinked clip on an unlocked lane moves by the lane drop
      // rules (before, after, Replace, a new lane); several clips, linked
      // clips and trims keep the earlier rules.
      if (clip && !target.dataset.trim) {
        const found = findClipByLayer(
          session.source.composition,
          clip.dataset.id!,
        );
        if (
          found &&
          !found.track.locked &&
          session.selectedIds.length === 1 &&
          !clipLinkId(found.clip)
        ) {
          const layer = locateLayer(
            session.source.composition.layers,
            found.clip.layerId,
          )?.layer;
          // (The press may have re-rendered the timeline: measure the clip
          // as drawn now.)
          const box = (
            root.querySelector<HTMLElement>(
              `.timeline-clip[data-clip-id="${CSS.escape(found.clip.id)}"]`,
            ) ?? clip
          ).getBoundingClientRect();
          pointer.laneMove = {
            clipId: found.clip.id,
            grab: {
              x: event.clientX - box.left,
              y: event.clientY - box.top,
              w: box.width,
              h: box.height,
            },
            info: {
              group: laneGroupOfTrack(found.track.type) as LaneGroup,
              duration: found.clip.duration,
              name: found.clip.name,
              kind: layer ? clipKind(layer) : 'shape',
              moving: found.clip.id,
            },
          };
        }
      }
      root.setPointerCapture(event.pointerId);
      scroll.focus({ preventScroll: true });
      if (ruler) seek(event.clientX);
    });
  // J11: while the pointer is over the lanes (and nothing is dragged), a
  // faint playhead with a time chip follows it.
  const hoverHead = document.createElement('div');
  hoverHead.className = 'timeline-hover-head';
  hoverHead.setAttribute('aria-hidden', 'true');
  const hoverTime = document.createElement('span');
  hoverHead.append(hoverTime);
  const hideHoverHead = () => hoverHead.remove();
  const showHoverHead = (event: PointerEvent) => {
    const bounds = scroll.getBoundingClientRect();
    const x = event.clientX - bounds.left + scroll.scrollLeft - headerWidth;
    if (
      pointer ||
      x < 0 ||
      !(event.target as HTMLElement).closest('.timeline-track, .timeline-ruler')
    )
      return hideHoverHead();
    const time = pixelToTime(x, session.timelineZoom);
    hoverHead.style.left = `${headerWidth + x}px`;
    hoverHead.style.height = `${content.scrollHeight}px`;
    hoverTime.textContent = t('timeline.ghostTime', {
      time: formatTimelineTime(Math.round(time * 100) / 100),
    });
    if (hoverHead.parentElement !== content) content.append(hoverHead);
  };
  const pointermove = (event: PointerEvent) =>
    safely(() => {
      update(event);
      showHoverHead(event);
    });
  const pointerup = (event: PointerEvent) =>
    safely(() => {
      if (event.pointerId !== pointer?.id) return;
      update(event);
      const kind = pointer?.kind;
      const moved = pointer?.moved ?? false;
      const laneMove = pointer?.laneMove;
      release();
      pointerSnap = undefined;
      // J9: a clip released outside the timeline stays where it was.
      const area = root.getBoundingClientRect();
      const outside =
        area.width > 0 &&
        area.height > 0 &&
        (event.clientX < area.left ||
          event.clientX > area.right ||
          event.clientY < area.top ||
          event.clientY > area.bottom);
      root.classList.remove('drag-outside');
      if (kind === 'clip' && laneMove) {
        const target = laneDrop?.target;
        hideFloat();
        clearAssetDropTarget();
        controller.cancel();
        if (moved && !outside && target && target.mode !== 'refused')
          moveClipTo(laneMove.clipId, target);
        render();
      } else if (kind === 'clip' && outside) {
        controller.cancel();
        render();
      } else if (kind === 'clip') controller.finish();
      if (kind === 'keyframe') {
        const delta = keyframeDrag?.delta ?? 0;
        keyframeDrag = undefined;
        if (moved && delta !== 0) moveSelectedKeyframes(engine, session, delta);
      }
      if (kind === 'marker' && markerPreview) {
        const marker = session.source.composition.markers.find(
          (item) => item.id === markerPreview!.id,
        );
        const time = markerPreview.time;
        const markerId = markerPreview.id;
        markerPreview = undefined;
        if (moved && marker && marker.time !== time)
          engine.commands.transaction('Move marker', [
            {
              type: 'UPDATE_MARKER',
              compositionId: session.source.composition.id,
              marker: { ...marker, time },
            },
          ]);
        // A click with no drag selects the marker (for keyboard delete) instead of moving it.
        if (!moved) selectedMarkerId = markerId;
      }
      suppressClick = kind === 'marquee' || (kind === 'keyframe' && moved);
      marquee = undefined;
      render();
    });
  const pointercancel = (event: PointerEvent) => {
    if (event.pointerId === pointer?.id) cancel();
  };
  const click = (event: MouseEvent) =>
    safely(() => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        '[data-action]',
      );
      if (!target) {
        if ((event.target as HTMLElement).classList.contains('timeline-track'))
          session.select(null);
        return;
      }
      const id = target.dataset.id ?? menuId;
      switch (target.dataset.action) {
        case 'clip':
          if (
            id &&
            !session.selectedIds.includes(id) &&
            !(event.shiftKey || event.ctrlKey || event.metaKey)
          )
            session.select(id);
          break;
        case 'select':
          if (id)
            session.select(
              id,
              event.shiftKey || event.ctrlKey || event.metaKey,
            );
          break;
        case 'up':
        case 'down':
          if (id)
            controller.reorder(id, target.dataset.action === 'up' ? -1 : 1);
          break;
        case 'track-enable':
        case 'track-lock':
        case 'track-mute': {
          const track = session.source.composition.tracks.find(
            (item) => item.id === id,
          );
          if (track)
            engine.commands.transaction('Update track', [
              {
                type: 'SET_TRACK_STATE',
                compositionId: session.source.composition.id,
                trackId: track.id,
                enabled:
                  target.dataset.action === 'track-enable'
                    ? !track.enabled
                    : track.enabled,
                locked:
                  target.dataset.action === 'track-lock'
                    ? !track.locked
                    : track.locked,
                muted:
                  target.dataset.action === 'track-mute'
                    ? !track.muted
                    : track.muted,
              },
            ]);
          break;
        }
        case 'track-solo':
          if (id) session.toggleSolo(id);
          break;
        case 'speed':
          showSpeedMenu();
          return;
        // J14: the clip menu's own entries run registered commands (the
        // shell holds their context); Audio opens its submenu.
        case 'run-command':
          menu.hidden = true;
          root.dispatchEvent(
            new CustomEvent('timeline-command', {
              detail: target.dataset.command,
              bubbles: true,
            }),
          );
          return;
        case 'audio-menu':
          showAudioMenu();
          return;
        case 'menu-back':
          showMainMenu();
          return;
        case 'speed-preset':
          setClipSpeed(engine, session, Number(target.dataset.speed));
          break;
        case 'transition':
          root.dispatchEvent(
            new CustomEvent('timeline-transition', {
              detail: target.dataset.id,
              bubbles: true,
            }),
          );
          return;
        case 'close-gap': {
          // J11: ripple close: every later clip on the lane moves left by the
          // gap, in one step.
          const lane = session.source.composition.tracks.find(
            (track) => track.id === target.dataset.id,
          );
          const at = Number(target.dataset.time);
          if (!lane || lane.locked) break;
          const later = [...lane.clips]
            .filter((clip) => clip.startTime > at + 1e-9)
            .sort((a, b) => a.startTime - b.startTime);
          const shift = later[0] ? later[0].startTime - at : 0;
          if (shift <= 0) break;
          engine.commands.transaction(
            'Close gap',
            later.map((clip) => ({
              type: 'SET_CLIP_TIMING' as const,
              compositionId: session.source.composition.id,
              clipId: clip.id,
              startTime: clip.startTime - shift,
              duration: clip.duration,
            })),
          );
          break;
        }
        case 'track-up':
        case 'track-down': {
          const tracks = [...session.source.composition.tracks].sort(
            (a, b) => a.order - b.order,
          );
          const index = tracks.findIndex((track) => track.id === id);
          if (index >= 0)
            engine.commands.execute({
              type: 'MOVE_TRACK',
              compositionId: session.source.composition.id,
              trackId: id!,
              index: index + (target.dataset.action === 'track-up' ? -1 : 1),
            });
          break;
        }
        case 'zoom-in':
          zoomAt(session.timelineZoom * 1.25);
          break;
        case 'zoom-out':
          zoomAt(session.timelineZoom / 1.25);
          break;
        case 'play':
          playback.toggle();
          break;
        case 'stop':
          playback.stop();
          break;
        // J13, T5: the Player panel's buttons.
        case 'previous-cut':
          jumpToCut(session, -1);
          break;
        case 'first-frame':
          session.setPlaying(false);
          session.setCurrentTime(0);
          break;
        case 'last-frame':
          session.setPlaying(false);
          session.setCurrentTime(session.source.composition.duration);
          break;
        case 'timecode':
          editTimecode(target);
          break;
        case 'back-5':
        case 'forward-5':
          session.setCurrentTime(
            Math.min(
              session.source.composition.duration,
              Math.max(
                0,
                session.currentTime +
                  (target.dataset.action === 'back-5' ? -5 : 5),
              ),
            ),
          );
          break;
        case 'zoom-fit': {
          // The whole scene fits the visible lanes.
          const visible = scroll.clientWidth - headerWidth - 24;
          const duration = Math.max(1, session.source.composition.duration);
          zoomAt(visible / duration);
          scroll.scrollLeft = 0;
          break;
        }
        case 'collapse-timeline':
          root.dispatchEvent(
            new CustomEvent('timeline-collapse', { bubbles: true }),
          );
          break;
        case 'frame-back':
          stepFrame(-1);
          break;
        case 'frame-forward':
          stepFrame(1);
          break;
        case 'keyframe':
          session.setPlaying(false);
          session.setCurrentTime(Number(target.dataset.time));
          break;
        case 'kf-easing':
          setSelectedEasing(engine, session, target.dataset.easing as Easing);
          break;
        case 'kf-copy':
        case 'kf-paste':
        case 'kf-duplicate':
        case 'kf-delete':
          runKeyframeAction(
            engine,
            session,
            target.dataset.action.slice(3) as
              'copy' | 'paste' | 'duplicate' | 'delete',
          );
          break;
        case 'delete-marker':
          performEdit(engine, session, 'delete-marker', menuMarker);
          break;
        case 'marker':
          session.select(null);
          performEdit(engine, session, 'marker');
          break;
        case 'split':
        case 'duplicate':
        case 'group':
        case 'delete':
        case 'toggle-enabled':
        case 'reverse':
        case 'freeze':
        case 'cut':
        case 'copy':
        case 'paste':
        case 'link':
        case 'unlink':
        case 'detach-audio':
          performEdit(engine, session, target.dataset.action as EditAction);
          break;
      }
      menu.hidden = true;
    });
  const keydown = (event: KeyboardEvent) =>
    safely(() => {
      if ((event.target as HTMLElement).closest('input')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        return;
      }
      if (pointer) return;
      // TL-060 / TL-044 keyboard equivalents (listed in the shortcut sheet).
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault();
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          nudgeClips(
            engine,
            session,
            (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1),
          );
        else
          moveClipsToAdjacentTrack(
            engine,
            session,
            event.key === 'ArrowUp' ? -1 : 1,
          );
        return;
      }
      if (
        (event.key === '[' || event.key === ']') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        trimClipToPlayhead(
          engine,
          session,
          event.key === '[' ? 'left' : 'right',
        );
        return;
      }
      if (
        (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        jumpToCut(session, event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) engine.redo();
        else engine.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        engine.redo();
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        playback.toggle();
        return;
      }
      if (event.key.toLowerCase() === 's' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        performEdit(engine, session, 'split');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        performEdit(engine, session, 'duplicate');
        return;
      }
      if (event.key === '+' || event.key === '=' || event.key === '-') {
        event.preventDefault();
        zoomAt(session.timelineZoom * (event.key === '-' ? 0.8 : 1.25));
        return;
      }
      if (
        [
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End',
          'Delete',
          'Backspace',
        ].includes(event.key)
      ) {
        event.preventDefault();
        if (event.key === 'Delete' || event.key === 'Backspace') {
          if (selectedMarkerId) {
            const markerId = selectedMarkerId;
            selectedMarkerId = undefined;
            performEdit(engine, session, 'delete-marker', markerId);
          } else controller.deleteSelected();
        } else if (event.key === 'Home') session.setCurrentTime(0);
        else if (event.key === 'End')
          session.setCurrentTime(session.source.composition.duration);
        else stepFrame(event.key === 'ArrowLeft' ? -1 : 1, event.shiftKey);
      }
    });
  const zoomAt = (value: number, clientX?: number) => {
    const x =
      clientX === undefined
        ? Math.max(headerWidth, scroll.clientWidth / 2)
        : clientX - scroll.getBoundingClientRect().left;
    const time = pixelToTime(
      scroll.scrollLeft + x - headerWidth,
      session.timelineZoom,
    );
    session.setTimelineZoom(value);
    scroll.scrollLeft = Math.max(
      0,
      timeToPixel(time, session.timelineZoom) + headerWidth - x,
    );
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      safely(() =>
        zoomAt(
          session.timelineZoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1),
          event.clientX,
        ),
      );
    } else if (event.shiftKey) {
      event.preventDefault();
      scroll.scrollLeft += event.deltaY;
    }
  };
  const dragstart = (event: DragEvent) => {
    reorderId = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-reorder-id]',
    )?.dataset.reorderId;
    if (reorderId)
      event.dataTransfer?.setData('application/x-editor-row', reorderId);
  };
  // T3: while a library item, Media item or clip is dragged over the
  // timeline: a clip-sized ghost (kind colour, name, length) where it would
  // land with a vertical guide at its start; at a lane's top or bottom edge
  // (or the strip above the first lane or below the last) a purple line with
  // a centre + for a new lane; over a clip, its thirds insert before, insert
  // after or Replace it; a lane of another group refuses (only + lines work).
  const ghost = document.createElement('div');
  ghost.className = 'timeline-asset-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  const ghostIcon = document.createElement('span');
  ghostIcon.className = 'clip-kind-icon';
  const ghostName = document.createElement('span');
  ghostName.className = 'ghost-name';
  const ghostLabel = document.createElement('span');
  ghostLabel.className = 'ghost-duration';
  ghost.append(ghostIcon, ghostName, ghostLabel);
  const separator = document.createElement('div');
  separator.className = 'timeline-lane-insert';
  separator.setAttribute('aria-hidden', 'true');
  separator.innerHTML = `<span>${iconSvg('plus', 12)}</span>`;
  const dropLine = document.createElement('div');
  dropLine.className = 'timeline-drop-line';
  dropLine.setAttribute('aria-hidden', 'true');
  const replaceLabel = document.createElement('span');
  replaceLabel.className = 'replace-label';
  replaceLabel.textContent = t('timeline.replace');
  replaceLabel.title = t('timeline.replaceHint');
  const clearAssetDropTarget = () => {
    laneDrop = null;
    for (const item of [ghost, separator, dropLine, replaceLabel])
      item.remove();
    ghost.dataset.shown = separator.dataset.shown = 'false';
    root.classList.remove('lane-refused');
    for (const item of root.querySelectorAll(
      '.asset-drop-target, .drop-refused, .replace-target, .drag-origin',
    ))
      item.classList.remove(
        'asset-drop-target',
        'drop-refused',
        'replace-target',
        'drag-origin',
      );
  };
  /** The lanes as drawn (screen pixels), top to bottom. */
  const dropRows = (): DropRow[] =>
    [...root.querySelectorAll<HTMLElement>('.timeline-nle-row')].map((row) => {
      const box = row.getBoundingClientRect();
      const track = session.source.composition.tracks.find(
        (item) => item.id === row.dataset.trackId,
      );
      return {
        trackId: row.dataset.trackId!,
        group: (row.dataset.laneGroup ?? 'text') as LaneGroup,
        locked: !!track?.locked,
        top: box.top,
        bottom: box.bottom,
      };
    });
  const dropClips = (): DropClip[] =>
    [
      ...root.querySelectorAll<HTMLElement>(
        '.timeline-nle-row .timeline-clip[data-clip-id]',
      ),
    ].map((clip) => {
      const box = clip.getBoundingClientRect();
      return {
        clipId: clip.dataset.clipId!,
        trackId: clip.dataset.trackId!,
        left: box.left,
        right: box.right,
      };
    });
  /** A time under the pointer, snapped (8 CSS px) to 0, the playhead and
   *  clip edges by its start or its end. */
  const dropTime = (x: number, duration: number, exclude?: string) => {
    const zoom = session.timelineZoom;
    const bounds = scroll.getBoundingClientRect();
    const raw = Math.max(
      0,
      pixelToTime(x - bounds.left + scroll.scrollLeft - headerWidth, zoom),
    );
    const candidates = [0, session.currentTime];
    for (const track of session.source.composition.tracks)
      for (const clip of track.clips)
        if (clip.id !== exclude)
          candidates.push(clip.startTime, clip.startTime + clip.duration);
    let best = raw;
    let distance = SNAP_THRESHOLD_PX / zoom;
    for (const candidate of candidates)
      for (const [edge, start] of [
        [raw, candidate],
        [raw + duration, candidate - duration],
      ] as const) {
        const d = Math.abs(edge - candidate);
        if (d < distance && start >= 0) {
          distance = d;
          best = start;
        }
      }
    return best;
  };
  /** Where a lane drop lands now: the target, its start and the drop info. */
  let laneDrop: {
    target: LaneDropTarget;
    info: LaneDropInfo;
    start: number;
  } | null = null;
  /** Draws the current lane drop (again after a re-render). */
  const showAssetTarget = () => {
    const drop = laneDrop;
    root.classList.toggle(
      'lane-refused',
      controller.refused || drop?.target.mode === 'refused',
    );
    if (!drop) return;
    const { target, info, start } = drop;
    // A clip being moved leaves a faint placeholder where it was.
    if (info.moving)
      root
        .querySelector(
          `.timeline-clip[data-clip-id="${CSS.escape(info.moving)}"]`,
        )
        ?.classList.add('drag-origin');
    const zoom = session.timelineZoom;
    const contentBox = content.getBoundingClientRect();
    const row = (id: string) =>
      root.querySelector<HTMLElement>(
        `.timeline-nle-row[data-track-id="${CSS.escape(id)}"]`,
      );
    const left = headerWidth + timeToPixel(start, zoom);
    if (target.mode === 'refused') {
      row(target.trackId)?.classList.add('drop-refused');
      for (const item of [ghost, separator, dropLine]) item.remove();
      return;
    }
    if (target.mode === 'replace') {
      ghost.remove();
      separator.remove();
      dropLine.remove();
      const clip = root.querySelector<HTMLElement>(
        `.timeline-clip[data-clip-id="${CSS.escape(target.clipId)}"]`,
      );
      clip?.classList.add('replace-target');
      if (clip && replaceLabel.parentElement !== clip)
        clip.append(replaceLabel);
      return;
    }
    replaceLabel.remove();
    ghost.dataset.kind = info.kind;
    ghostIcon.innerHTML = iconSvg(
      CLIP_ICONS[info.kind as ClipKind] ?? CLIP_ICONS.shape,
      12,
    );
    ghostName.textContent = info.name;
    ghostLabel.textContent = t('timeline.ghostTime', {
      time: formatTimelineTime(Math.round(info.duration * 100) / 100),
    });
    ghost.style.left = `${left}px`;
    ghost.style.width = `${Math.max(8, timeToPixel(info.duration, zoom))}px`;
    let top: number;
    let height: number;
    if (target.mode === 'new-lane') {
      const rows = dropRows();
      const lineY =
        target.index < rows.length
          ? rows[target.index]!.top
          : (rows.at(-1)?.bottom ?? contentBox.top + 28);
      separator.style.top = `${lineY - contentBox.top}px`;
      separator.style.left = `${headerWidth}px`;
      separator.dataset.shown = 'true';
      content.append(separator);
      // The "+" line is the mark; a ghost over it would hide it.
      ghost.remove();
      dropLine.style.left = `${left}px`;
      dropLine.style.height = `${content.scrollHeight}px`;
      content.append(dropLine);
      return;
    } else {
      separator.remove();
      const lane = row(target.trackId)!;
      const box = lane.getBoundingClientRect();
      top = box.top - contentBox.top + 4;
      height = Math.max(28, box.height - 8);
    }
    ghost.style.top = `${top}px`;
    ghost.style.height = `${height}px`;
    // U1: a moved clip shows its floating copy instead of a ghost.
    if (info.moving) ghost.remove();
    else {
      ghost.dataset.shown = 'true';
      content.append(ghost);
    }
    dropLine.style.left = `${left}px`;
    dropLine.style.height = `${content.scrollHeight}px`;
    content.append(dropLine);
  };
  /** T3: the pointer of a drag is at `x`, `y`; returns the target. */
  const laneDropAt = (
    info: LaneDropInfo,
    x: number,
    y: number,
    /** U1: a moved clip's left edge (the time comes from it, not the pointer). */
    startX?: number,
  ) => {
    clearAssetDropTarget();
    const raw = dropTime(startX ?? x, info.duration, info.moving);
    // A moved clip lands on the scene's frame grid.
    const fps = session.source.composition.fps;
    const time = info.moving ? Math.round(raw * fps) / fps : raw;
    dropLine.dataset.time = String(time);
    dropLine.classList.toggle(
      'timeline-snap',
      !!info.moving &&
        Math.abs(
          raw -
            Math.max(
              0,
              pixelToTime(
                (startX ?? x) -
                  scroll.getBoundingClientRect().left +
                  scroll.scrollLeft -
                  headerWidth,
                session.timelineZoom,
              ),
            ),
        ) > 1e-9,
    );
    let target = resolveLaneDrop({
      x,
      y,
      time,
      group: info.group,
      rows: dropRows(),
      clips: dropClips(),
      ...(info.moving ? { exclude: new Set([info.moving]) } : {}),
    });
    if (!target) return null;
    // U1: a clip already on the timeline never replaces: over another clip
    // it goes before or after it, by the pointer's half.
    if (info.moving && target.mode === 'replace') {
      const replaced = target;
      const over = dropClips().find((item) => item.clipId === replaced.clipId);
      target = {
        ...replaced,
        mode: over && x < (over.left + over.right) / 2 ? 'before' : 'after',
      };
    }
    let start = time;
    if (target.mode !== 'refused')
      try {
        start = laneDropPlan(session.source.composition, target, {
          duration: info.duration,
          ...(info.moving ? { moving: info.moving } : {}),
        }).startTime;
      } catch {
        start = time;
      }
    laneDrop = { target, info, start };
    showAssetTarget();
    // U1: a snapped move's guide sits on the edge that snapped (its start
    // or its end).
    if (info.moving && dropLine.classList.contains('timeline-snap')) {
      const edges = [0, session.currentTime];
      for (const track of session.source.composition.tracks)
        for (const clip of track.clips)
          if (clip.id !== info.moving)
            edges.push(clip.startTime, clip.startTime + clip.duration);
      const near = (value: number) =>
        edges.some((edge) => Math.abs(edge - value) < 1e-6);
      const edge = near(start)
        ? start
        : near(start + info.duration)
          ? start + info.duration
          : start;
      dropLine.dataset.time = String(Math.round(edge * 1e6) / 1e6);
      dropLine.style.left = `${headerWidth + timeToPixel(edge, session.timelineZoom)}px`;
    }
    return target;
  };
  // U1: the floating copy of a clip being moved.
  const float = document.createElement('div');
  float.className = 'timeline-clip timeline-drag-float';
  float.setAttribute('aria-hidden', 'true');
  const showFloat = (
    move: {
      clipId: string;
      info: LaneDropInfo;
      grab: { x: number; y: number; w: number; h: number };
    },
    x: number,
    y: number,
  ) => {
    if (!float.isConnected) {
      float.dataset.kind = move.info.kind;
      float.textContent = move.info.name;
      float.style.width = `${move.grab.w}px`;
      float.style.height = `${move.grab.h}px`;
      document.body.append(float);
    }
    float.style.transform = `translate(${x - move.grab.x}px, ${y - move.grab.y}px)`;
    root
      .querySelector(
        `.timeline-clip[data-clip-id="${CSS.escape(move.clipId)}"]`,
      )
      ?.classList.add('drag-origin');
  };
  const hideFloat = () => float.remove();
  /** T3: moves one clip to a lane target as one undo step (a new lane,
   *  later clips pushed, a replaced clip removed). */
  const moveClipTo = (
    clipId: string,
    target: Exclude<LaneDropTarget, { mode: 'refused' }>,
  ) => {
    const composition = session.source.composition;
    const found = findClip(composition, clipId);
    if (!found) return;
    const plan = laneDropPlan(composition, target, {
      duration: found.clip.duration,
      moving: clipId,
    });
    const commands: Command[] = [];
    if (plan.removeLayerId)
      commands.push({
        type: 'DELETE_LAYER',
        compositionId: composition.id,
        layerId: plan.removeLayerId,
      });
    let trackId = plan.trackId;
    if (!trackId && target.mode === 'new-lane') {
      trackId = crypto.randomUUID();
      commands.push(
        {
          type: 'CREATE_TRACK',
          compositionId: composition.id,
          track: {
            id: trackId,
            name: nextTrackName(composition, found.track.type),
            type: found.track.type,
            order: composition.tracks.length,
            enabled: true,
            locked: false,
            muted: false,
            clips: [],
          },
        },
        {
          type: 'MOVE_TRACK',
          compositionId: composition.id,
          trackId,
          index: target.index,
        },
      );
    }
    if (!trackId) return;
    if (trackId !== found.track.id)
      commands.push({
        type: 'MOVE_CLIP',
        compositionId: composition.id,
        clipId,
        trackId,
      });
    commands.push(...plan.pushes);
    if (plan.startTime !== found.clip.startTime)
      commands.push({
        type: 'SET_CLIP_TIMING',
        compositionId: composition.id,
        clipId,
        startTime: plan.startTime,
        duration: found.clip.duration,
      });
    if (commands.length) engine.commands.transaction('Move clip', commands);
  };
  const assetOver = (event: {
    readonly target: EventTarget | null;
    readonly clientX: number;
    readonly clientY: number;
  }) => {
    const drag = assetDrag();
    if (!drag) return;
    laneDropAt(
      {
        group: laneGroupOfLayer(drag.type) as LaneGroup,
        duration: drag.duration,
        name: drag.name,
        kind: drag.type,
      },
      event.clientX,
      event.clientY,
    );
    void event.target;
  };
  const dragover = (event: DragEvent) => {
    const asset = event.dataTransfer?.types.includes(
      'application/x-editor-asset',
    );
    if (reorderId || asset) {
      event.preventDefault();
      if (asset) assetOver(event);
    }
  };
  const dragleave = (event: DragEvent) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !root.contains(event.relatedTarget)
    )
      clearAssetDropTarget();
  };
  const drop = (event: DragEvent) =>
    safely(() => {
      // A media drop is read and cleared by the shell's drop listener.
      if (!reorderId) return;
      event.preventDefault();
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        '[data-row-id]',
      )?.dataset.rowId;
      const rows = timelineRows(session.source, session.timelineZoom),
        from = rows.find((row) => row.layer.id === reorderId),
        to = rows.find((row) => row.layer.id === target);
      reorderId = undefined;
      if (
        from &&
        to &&
        from.parentId === to.parentId &&
        from.index !== to.index
      )
        engine.commands.transaction('Reorder layer', [
          {
            type: 'MOVE_LAYER',
            compositionId: session.source.composition.id,
            layerId: from.layer.id,
            parentId: from.parentId,
            index: to.index,
          },
        ]);
    });
  // T5: a click on the timecode turns it into a field; Enter (or leaving
  // it) moves the playhead there, clamped to the scene; Escape cancels.
  const editTimecode = (code: HTMLElement) => {
    if (code.querySelector('input')) return;
    session.setPlaying(false);
    const input = document.createElement('input');
    input.className = 'player-timecode-input';
    input.setAttribute('aria-label', t('player.timecodeTip'));
    input.value = timecode(session.currentTime).replace(/^0(\d)/, '$1');
    let done = false;
    const close = (commit: boolean) => {
      if (done) return;
      done = true;
      const value = parseTimecode(input.value);
      input.remove();
      if (commit && value !== null)
        session.setCurrentTime(
          Math.min(session.source.composition.duration, value),
        );
      else if (commit) report(new Error(t('player.timecodeInvalid')));
      code.textContent = t('player.timecode', {
        current: shortTimecode(session.currentTime),
        total: shortTimecode(session.source.composition.duration),
      });
      code.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      }
    });
    input.addEventListener('blur', () => close(true));
    input.addEventListener('click', (event) => event.stopPropagation());
    code.replaceChildren(input);
    input.focus();
    input.select();
  };
  // U4: the collapsed player bar's scrubber (the U2 smooth scrub).
  const scrubInput = root.querySelector<HTMLInputElement>('.player-scrub')!;
  scrubInput.addEventListener('input', () => {
    session.setPlaying(false);
    session.setCurrentTime(Number(scrubInput.value));
  });
  const timecodeButton = root.querySelector<HTMLElement>('[data-timecode]')!;
  timecodeButton.addEventListener('keydown', (event) => {
    if (
      event.target === timecodeButton &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      event.stopPropagation();
      editTimecode(timecodeButton);
    }
  });
  const menuItem = (label: string, action: string, role = 'menuitem') => {
    const item = button(label, action);
    item.setAttribute('role', role);
    return item;
  };
  // ANI-002/ANI-004: easing presets and keyframe edits for the selection.
  const showKeyframeMenu = () => {
    const items: HTMLButtonElement[] = [];
    for (const easing of [
      'linear',
      'ease-in',
      'ease-out',
      'ease-in-out',
      'hold',
    ] as const) {
      const item = menuItem(
        t(`easing.${easing}`),
        'kf-easing',
        'menuitemradio',
      );
      item.dataset.easing = easing;
      items.push(item);
    }
    for (const action of ['copy', 'paste', 'duplicate', 'delete'] as const) {
      const item = menuItem(t(`animation.${action}`), `kf-${action}`);
      if (action === 'copy') item.classList.add('timeline-menu-divider');
      if (action === 'paste') item.disabled = !hasCopiedKeyframes();
      items.push(item);
    }
    menu.replaceChildren(...items);
  };
  // J14: a Clipchamp section for the kind of clip first (each entry a
  // registered command with its shortcut), then a divider and the earlier
  // entries that are not already in it.
  const commandContext = {
    engine,
    session,
    togglePlayback: () => undefined,
  };
  const commandItem = (id: string, role = 'menuitem') => {
    const command = commands.find((item) => item.id === id)!;
    const item = menuItem(t(command.labelKey), 'run-command', role);
    item.dataset.command = id;
    // The shortcut is drawn by CSS from data-shortcut, so the entry's text
    // and accessible name stay its label (aria-keyshortcuts names the keys).
    if (command.shortcut) {
      const keys = command.shortcut.split(' / ')[0]!;
      item.dataset.shortcut = keys;
      item.setAttribute('aria-keyshortcuts', keys);
    }
    if (!command.isEnabled(commandContext)) item.disabled = true;
    return item;
  };
  const clipMenuKind = () => {
    const kinds = new Set(
      selectionRoots(session.source, session.selectedIds).map((layer) =>
        findClipByLayer(session.source.composition, layer.id)
          ? layer.type === 'video' ||
            layer.type === 'image' ||
            layer.type === 'audio'
            ? layer.type
            : 'element'
          : 'none',
      ),
    );
    return kinds.size === 1 && !kinds.has('none') ? [...kinds][0]! : null;
  };
  const kindSection = (kind: string): HTMLElement[] => {
    const items: HTMLElement[] = [
      'duplicate',
      'copy',
      'paste',
      'delete',
      'split',
    ].map((id) => commandItem(id));
    if (kind === 'video') {
      const freeze = commandItem('freeze', 'menuitemcheckbox');
      freeze.setAttribute(
        'aria-checked',
        String(
          selectionRoots(session.source, session.selectedIds).every((layer) => {
            const found = findClipByLayer(session.source.composition, layer.id);
            return !!found && clipTimeEffects(found.clip).freezeFrame !== null;
          }),
        ),
      );
      items.push(freeze);
    }
    items.push(commandItem('edit-duration'), commandItem('rename-clip'));
    if (kind === 'video' || kind === 'audio') {
      const audio = menuItem(`${t('menu.audio')} ›`, 'audio-menu');
      audio.setAttribute('aria-haspopup', 'menu');
      items.push(audio);
    }
    if (kind === 'video') {
      const cut = menuItem(t('command.autoCut'), 'auto-cut');
      cut.setAttribute('aria-disabled', 'true');
      cut.disabled = true;
      cut.title = t('menu.autoCutPlanned');
      items.push(cut);
    }
    items.push(commandItem('more-options'));
    return items;
  };
  // U3: Speed and Audio open as flyouts beside their entry: on hover after
  // 150 ms (a 300 ms grace lets the pointer travel to the flyout), on click
  // and on the Right arrow; Left or Escape closes the flyout.
  let submenu: HTMLElement | null = null;
  let subOpen = 0,
    subClose = 0;
  const closeSub = () => {
    window.clearTimeout(subClose);
    submenu?.remove();
    submenu = null;
    for (const item of menu.querySelectorAll('[aria-expanded="true"]'))
      item.setAttribute('aria-expanded', 'false');
  };
  const openSub = (action: string, items: HTMLElement[], focus: boolean) => {
    const parent = menu.querySelector<HTMLElement>(
      `:scope > [data-action="${action}"]`,
    );
    closeSub();
    if (!parent) return;
    const list = document.createElement('div');
    list.className = 'timeline-submenu';
    list.setAttribute('role', 'menu');
    list.append(...items);
    menu.append(list);
    const box = parent.getBoundingClientRect();
    const width = list.offsetWidth || 180;
    const left =
      box.right + width + 8 > window.innerWidth
        ? Math.max(8, box.left - width)
        : box.right;
    list.style.left = `${left}px`;
    list.style.top = `${Math.max(8, Math.min(box.top - 4, window.innerHeight - list.offsetHeight - 8))}px`;
    parent.setAttribute('aria-expanded', 'true');
    list.onpointerenter = () => window.clearTimeout(subClose);
    submenu = list;
    if (focus)
      list.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  };
  dismissMenuOn(
    menu,
    () => !menu.hidden,
    () => {
      closeSub();
      menu.hidden = true;
    },
  );
  menu.addEventListener('pointerover', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (!item || submenu?.contains(item)) return;
    window.clearTimeout(subOpen);
    const action = item.dataset.action;
    if (action === 'audio-menu' || action === 'speed') {
      window.clearTimeout(subClose);
      if (item.getAttribute('aria-expanded') === 'true') return;
      subOpen = window.setTimeout(
        () =>
          action === 'speed' ? showSpeedMenu(false) : showAudioMenu(false),
        150,
      );
    } else if (submenu) {
      window.clearTimeout(subClose);
      subClose = window.setTimeout(closeSub, 300);
    }
  });
  const showAudioMenu = (focus = true) => {
    const back = menuItem(`‹ ${t('menu.back')}`, 'menu-back');
    const mute = commandItem('clip-mute', 'menuitemcheckbox');
    const clips = selectionRoots(session.source, session.selectedIds).flatMap(
      (layer) => {
        const found = findClipByLayer(session.source.composition, layer.id);
        return found ? [found] : [];
      },
    );
    mute.setAttribute(
      'aria-checked',
      String(clips.length > 0 && clips.every(({ track }) => track.muted)),
    );
    void back;
    const items: HTMLElement[] = [mute];
    if (clipMenuKind() === 'video') items.push(commandItem('detach-audio'));
    openSub('audio-menu', items, focus);
  };
  // J14: the menu works from the keyboard: Up and Down move (skipping
  // disabled entries), Home and End, Right opens Audio, Left goes back.
  menu.addEventListener('keydown', (event) => {
    const list =
      (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
        '.timeline-submenu',
      ) ?? menu;
    const items = [
      ...list.querySelectorAll<HTMLButtonElement>(
        ':scope > button:not(:disabled)',
      ),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (at: number) =>
      items[(at + items.length) % items.length]?.focus();
    if (event.key === 'ArrowDown') focus(index + 1);
    else if (event.key === 'ArrowUp') focus(index < 0 ? -1 : index - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(-1);
    else if (event.key === 'Escape') {
      menu.hidden = true;
      scroll.focus();
    } else if (
      event.key === 'ArrowRight' &&
      (document.activeElement as HTMLElement | null)?.dataset.action ===
        'audio-menu'
    )
      showAudioMenu();
    else if (event.key === 'ArrowLeft' && list !== menu) {
      const parent = menu.querySelector<HTMLElement>(
        ':scope > [aria-expanded="true"]',
      );
      closeSub();
      parent?.focus();
    } else if (
      event.key === 'ArrowRight' &&
      (document.activeElement as HTMLElement | null)?.dataset.action === 'speed'
    )
      showSpeedMenu();
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  const showMainMenu = () => {
    const kind = clipMenuKind();
    const section = kind ? kindSection(kind) : [];
    const shown = new Set(
      section.flatMap((item) =>
        (item as HTMLElement).dataset.command
          ? [(item as HTMLElement).dataset.command!]
          : [],
      ),
    );
    const clips = selectionRoots(session.source, session.selectedIds).flatMap(
      (layer) => {
        const found = findClipByLayer(session.source.composition, layer.id);
        return found ? [found.clip] : [];
      },
    );
    const earlier = contextActions(
      session.source,
      session.selectedIds,
      session.currentTime,
      menuMarker,
    ).filter((action) => !shown.has(action));
    const divider = document.createElement('div');
    divider.className = 'timeline-menu-divider';
    divider.setAttribute('role', 'separator');
    menu.replaceChildren(
      ...section,
      ...(section.length && earlier.length ? [divider] : []),
      ...earlier.map((action) => {
        if (action === 'speed')
          return menuItem(`${t('command.speed')} ›`, action);
        if (CLIP_ACTIONS.includes(action))
          return menuItem(t(`command.${action}`), action);
        if (action === 'reverse' || action === 'freeze') {
          const item = menuItem(
            t(action === 'reverse' ? 'command.reverse' : 'command.freeze'),
            action,
            'menuitemcheckbox',
          );
          item.setAttribute(
            'aria-checked',
            String(
              clips.length > 0 &&
                clips.every((clip) =>
                  action === 'reverse'
                    ? clipTimeEffects(clip).reversed
                    : clipTimeEffects(clip).freezeFrame !== null,
                ),
            ),
          );
          return item;
        }
        return menuItem(
          action === 'marker'
            ? 'Add marker'
            : action === 'delete-marker'
              ? 'Delete marker'
              : action === 'toggle-enabled'
                ? 'Enable / disable clip'
                : action[0]!.toUpperCase() + action.slice(1),
          action,
        );
      }),
    );
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  };
  // VID-015: speed presets open in place of the main menu, with Back.
  const showSpeedMenu = (focus = true) => {
    const current = selectionRoots(session.source, session.selectedIds)
      .map((layer) => findClipByLayer(session.source.composition, layer.id))
      .find(Boolean)?.clip.speed;
    openSub(
      'speed',
      SPEED_PRESETS.map((speed) => {
        const item = menuItem(
          t('clip.speedValue', { speed: formatNumber(speed) }),
          'speed-preset',
          'menuitemradio',
        );
        item.dataset.speed = String(speed);
        item.setAttribute('aria-checked', String(current === speed));
        return item;
      }),
      focus,
    );
  };
  const contextmenu = (event: MouseEvent) => {
    event.preventDefault();
    const diamond = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-action="keyframe"]',
    );
    if (diamond) {
      const item = {
        layerId: diamond.dataset.id!,
        time: Number(diamond.dataset.time),
      };
      if (!isSelectedKeyframe(item.layerId, item.time)) {
        if (!session.selectedIds.includes(item.layerId))
          session.select(item.layerId);
        session.selectKeyframes([item]);
      }
      showKeyframeMenu();
      announceMenu(menu);
      menu.hidden = false;
      menu.style.left = `${Math.max(0, Math.min(root.clientWidth - 140, event.clientX - root.getBoundingClientRect().left))}px`;
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-id]',
    );
    menuMarker =
      target?.dataset.action === 'marker-handle'
        ? target.dataset.id
        : undefined;
    menuId = menuMarker ? null : (target?.dataset.id ?? null);
    if (menuId && !session.selectedIds.includes(menuId)) session.select(menuId);
    if (!target) {
      session.select(null);
      seek(event.clientX);
    }
    closeSub();
    showMainMenu();
    announceMenu(menu);
    menu.hidden = false;
    // J14: the first entry takes focus once the menu is shown.
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    menu.style.left = `${Math.max(0, Math.min(root.clientWidth - 140, event.clientX - root.getBoundingClientRect().left))}px`;
  };
  // TL-055: scrolling within half a viewport of the end extends the timeline.
  const onScroll = () =>
    safely(() => {
      const zoom = session.timelineZoom;
      const visibleEnd = pixelToTime(
        scroll.scrollLeft + viewportPixels(),
        zoom,
      );
      if (
        visibleEnd >=
        renderedSpan - pixelToTime(viewportPixels(), zoom) / 2 - 1e-9
      ) {
        reach = Math.min(MAX_SPAN, Math.max(reach, visibleEnd));
        if (spanTime() > renderedSpan + 1e-9) render();
      }
    });
  scroll.addEventListener('scroll', onScroll);
  const listeners = {
    pointerdown,
    pointermove,
    pointerleave: hideHoverHead,
    pointerup,
    pointercancel,
    lostpointercapture: pointercancel,
    click,
    ...(externalKeyboard ? {} : { keydown }),
    contextmenu,
    dragstart,
    dragleave,
    dragend: () => {
      reorderId = undefined;
      clearAssetDropTarget();
    },
    dragover,
    // J9: entering must accept the drag too, or the browser sends the next
    // dragover to the page body instead of the lane under the pointer.
    dragenter: dragover,
    drop,
    wheel,
  };
  for (const [name, listener] of Object.entries(listeners))
    root.addEventListener(name, listener as EventListener);
  window.addEventListener('blur', cancel);
  // T1: a hidden page ends a clip drag too (the same rule as every drag).
  const hidden = () => {
    if (document.visibilityState === 'hidden') cancel();
  };
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('resize', cancel);
  let observedProject = engine.state;
  let observedComposition = session.source.composition.id;
  let observedSelection = session.selectedId;
  let observedZoom = session.timelineZoom;
  const unsubscribe = session.onChange(() => {
    // Seeking itself notifies the session; only external changes invalidate its capture.
    if (
      pointer &&
      pointer.kind !== 'clip' &&
      (observedProject !== engine.state ||
        observedComposition !== session.source.composition.id ||
        (pointer.kind !== 'marquee' &&
          observedSelection !== session.selectedId) ||
        observedZoom !== session.timelineZoom)
    ) {
      release();
      markerPreview = undefined;
      selectedMarkerId = undefined;
      marquee = undefined;
    }
    observedProject = engine.state;
    observedComposition = session.source.composition.id;
    observedSelection = session.selectedId;
    observedZoom = session.timelineZoom;
    if (pointer?.kind === 'clip' && !controller.preview) release();
    menu.hidden = true;
    render();
  });
  document.addEventListener('dragend', clearAssetDropTarget);
  render();
  return {
    get active() {
      return pointer !== null && pointer !== undefined;
    },
    handleKey: keydown,
    closeMenu() {
      if (menu.hidden) return false;
      menu.hidden = true;
      return true;
    },
    controller,
    playback,
    render,
    cancel,
    /** J14: renames a layer's clip in place (Enter or leaving commits). */
    renameClip(layerId: string) {
      const clip = root.querySelector<HTMLElement>(
        `.timeline-clip[data-action="clip"][data-id="${CSS.escape(layerId)}"]`,
      );
      const layer = locateLayer(
        session.source.composition.layers,
        layerId,
      )?.layer;
      if (!clip || !layer) return;
      clip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const box = clip.getBoundingClientRect();
      const input = document.createElement('input');
      input.className = 'timeline-rename';
      input.value = layer.name;
      input.setAttribute('aria-label', t('clip.renameLabel'));
      Object.assign(input.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${Math.max(120, box.width)}px`,
        height: `${box.height}px`,
      });
      let done = false;
      const finish = (commit: boolean) => {
        if (done) return;
        done = true;
        const name = input.value.trim();
        input.remove();
        if (commit && name && name !== layer.name)
          try {
            engine.commands.transaction('Rename', [
              {
                type: 'SET_LAYER_NAME',
                compositionId: session.source.composition.id,
                layerId,
                name,
              },
            ]);
          } catch (error) {
            report(error);
          }
        scroll.focus({ preventScroll: true });
      };
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
      document.body.append(input);
      input.focus();
      input.select();
    },
    /** T3: where a drop over the timeline lands, while one is over it. */
    assetTarget: () => laneDrop?.target ?? null,
    /** T3: the drag controller's pointer is over the timeline at `x`, `y`;
     *  returns the target (null between lanes). */
    dragOverAt(info: LaneDropInfo, x: number, y: number) {
      return laneDropAt(info, x, y);
    },
    clearAssetTarget: clearAssetDropTarget,
    /** J6: highlights a layer's clip (Show element timing), or none. */
    highlight(id: string | null) {
      highlighted = id;
      renderedProject = undefined;
      render();
    },
    /** H3: scrolls so `time` is in view (Show element timing). */
    reveal(time: number) {
      const x = timeToPixel(time, session.timelineZoom);
      if (
        x < scroll.scrollLeft ||
        x > scroll.scrollLeft + scroll.clientWidth - headerWidth
      )
        scroll.scrollLeft = Math.max(0, x - 40);
      render();
    },
    dispose: () => {
      cancel();
      unsubscribe();
      controller.dispose();
      playback.dispose();
      unsubscribePreviews?.();
      unsubscribeWaveforms?.();
      for (const [name, listener] of Object.entries(listeners))
        root.removeEventListener(name, listener as EventListener);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('dragend', clearAssetDropTarget);
      window.removeEventListener('resize', cancel);
      scroll.removeEventListener('scroll', onScroll);
      root.replaceChildren();
    },
  };
}
