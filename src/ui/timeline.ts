import {
  frameToTime,
  pixelToTime,
  timeToFrame,
  timeToPixel,
  effectiveLayerTiming,
  findClipByLayer,
  clipTimeEffects,
  clipTrimBounds,
  retimeClip,
  trackAcceptsLayer,
  type EditorEngine,
  type Command,
} from '../core';
import { t, formatNumber } from '../i18n';
import { locateLayer, type SceneLayer } from '../render/adapter';
import type { EditorSession } from './session';
import {
  selectionRoots,
  performEdit,
  contextActions,
  jumpToCut,
  moveClipsToAdjacentTrack,
  nudgeClips,
  setClipSpeed,
  trimClipToPlayhead,
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

const formatTimelineTime = (time: number) => String(Number(time.toFixed(3)));

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
  get previews(): readonly TimingPreview[] {
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
  get destinationId(): string | undefined {
    return this.#gesture?.destinationId;
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
    if (location?.track.locked) throw new Error('Track is locked');
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
    const layers = selectionRoots(
      this.session.source,
      this.session.selectedIds,
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
    this.#gesture = {
      ...(bounds ? { bounds } : {}),
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
      if (gesture.kind === 'move' && destinationId) {
        const clips = gesture.layers.map((layer) => ({
          layer,
          location: findClipByLayer(this.session.source.composition, layer.id),
        }));
        if (
          clips.every((item) => item.location) &&
          destinationId.startsWith('track:')
        ) {
          const trackId = destinationId.slice(6);
          const destination = this.session.source.composition.tracks.find(
            (track) => track.id === trackId,
          );
          const compatible = destination
            ? clips.every(({ layer }) =>
                trackAcceptsLayer(destination.type, layer.type),
              )
            : false;
          if (
            destination &&
            compatible &&
            !destination.locked &&
            clips.some((item) => item.location!.track.id !== destination.id)
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
    this.#gesture = null;
    if (!gesture) return;
    try {
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
        if (destinationTrackId)
          for (const layer of gesture.layers) {
            const clip = findClipByLayer(
              this.session.source.composition,
              layer.id,
            );
            if (clip && clip.track.id !== destinationTrackId)
              commands.push({
                type: 'MOVE_CLIP',
                compositionId: gesture.compositionId,
                clipId: clip.clip.id,
                trackId: destinationTrackId,
              });
          }
        else {
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
) {
  root.innerHTML = `<div class="timeline-controls"><div class="transport-group transport-clip-tools" role="group" aria-label="Clip actions"><button data-action="split">${iconSvg('split', 15)}Split</button><button data-action="duplicate">${iconSvg('duplicate', 15)}Duplicate</button><button data-action="marker">${iconSvg('marker', 15)}+ Marker</button></div><div class="transport-group transport-playback" role="group" aria-label="Playback"><button class="icon-button" data-action="frame-back" aria-label="Previous frame" title="Previous frame (←)">${iconSvg('frameBack', 15)}</button><button class="transport-play-button" data-action="play" aria-label="Play or pause" title="Play/Pause (Space)">${iconSvg('play', 18)}</button><button class="icon-button" data-action="frame-forward" aria-label="Next frame" title="Next frame (→)">${iconSvg('frameForward', 15)}</button><button class="icon-button" data-action="stop" aria-label="Stop playback" title="Stop">${iconSvg('stop', 14)}</button><div class="transport-time"><output data-current-time aria-label="Current time"></output><span class="composition-duration" data-derived-duration></span></div></div><div class="transport-group transport-meta" role="group" aria-label="Composition and zoom"><span data-composition-strip></span><span class="transport-divider" aria-hidden="true"></span><button class="icon-button" data-action="zoom-out" aria-label="Timeline zoom out">${iconSvg('zoomOut', 15)}</button><span data-zoom-label></span><button class="icon-button" data-action="zoom-in" aria-label="Timeline zoom in">${iconSvg('zoomIn', 15)}</button></div></div><div class="timeline-scroll" tabindex="0"><div class="timeline-content"></div></div><div class="timeline-menu" role="menu" hidden><button role="menuitem" data-action="select">Select</button><button role="menuitem" data-action="delete">Delete</button></div>`;
  const scroll = root.querySelector<HTMLElement>('.timeline-scroll')!;
  const content = root.querySelector<HTMLElement>('.timeline-content')!;
  const menu = root.querySelector<HTMLElement>('.timeline-menu')!;
  scroll.setAttribute('aria-label', t('timeline.keys'));
  const headerWidth = 224;
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
  let pointer: {
    id: number;
    kind: 'clip' | 'playhead' | 'marker' | 'marquee';
    start: number;
    startY: number;
    scrollY: number;
    scroll: number;
    originalTime: number;
    moved: boolean;
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
      `${composition.name} · ${formatTimelineTime(composition.duration)}s · ${composition.fps} fps`;
    root.querySelector('[data-current-time]')!.textContent =
      `${session.currentTime.toFixed(3)}s / ${formatTimelineTime(composition.duration)}s · frame ${timeToFrame(session.currentTime, composition.fps)}`;
    root.querySelector('[data-derived-duration]')!.textContent =
      `${formatTimelineTime(composition.duration)}s content length`;
    root.querySelector('[data-zoom-label]')!.textContent =
      `${zoom.toFixed(0)} px/s`;
    const span = spanTime();
    const guideTime = controller.snapTime ?? pointerSnap;
    const identity = JSON.stringify([
      composition.id,
      session.selectedIds,
      zoom,
      span,
      guideTime,
      session.soloTrackIds,
    ]);
    if (
      renderedProject === engine.state &&
      renderedIdentity === identity &&
      !controller.preview &&
      !markerPreview &&
      !marquee
    ) {
      const playhead = content.querySelector<HTMLElement>('.timeline-playhead');
      if (playhead)
        playhead.style.left = `${headerWidth + timeToPixel(session.currentTime, zoom)}px`;
      return;
    }
    renderedProject = engine.state;
    renderedIdentity =
      controller.preview || markerPreview || marquee ? '' : identity;
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
    rulerBar.style.setProperty(
      '--track-height',
      `${(trackRows.length + rows.length) * 34}px`,
    );
    rulerBar.append(ruler);
    content.append(rulerBar);
    for (const [trackIndex, row] of trackRows.entries()) {
      const line = document.createElement('div');
      line.className = 'timeline-row timeline-nle-row';
      line.dataset.rowId = `track:${row.track.id}`;
      line.dataset.trackId = row.track.id;
      line.classList.toggle(
        'drop-target',
        controller.destinationId === `track:${row.track.id}`,
      );
      line.classList.toggle(
        'selected',
        row.clips.some((item) => session.selectedIds.includes(item.layer.id)),
      );
      const header = document.createElement('div');
      header.className = 'timeline-row-header timeline-track-header';
      const label = document.createElement('span');
      label.className = 'track-name';
      // Name only, so it stays readable beside four toggles; type in the tooltip.
      label.textContent = row.track.name;
      label.title = `${row.track.type.toUpperCase()} · ${row.track.name}`;
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
      up.disabled = trackIndex === 0;
      down.disabled = trackIndex === trackRows.length - 1;
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
      for (const entry of row.clips) {
        const moving = controller.previews.find(
          (item) => item.layerId === entry.layer.id,
        );
        // TL-058: across tracks the original stays put (dimmed); a ghost lands.
        const preview = crossTrack ? undefined : moving;
        const clip = button(entry.clip.name, 'clip', entry.layer.id);
        clip.className = `timeline-clip nle-clip${entry.clip.enabled ? '' : ' disabled'}${crossTrack && moving ? ' drag-origin' : ''}`;
        clip.dataset.clipId = entry.clip.id;
        clip.dataset.trackId = row.track.id;
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
        for (const [kind, content, label] of badges) {
          const badge = document.createElement('span');
          badge.className = 'clip-badge';
          badge.dataset.badge = kind;
          badge.innerHTML = content;
          badge.title = label;
          badge.setAttribute('aria-label', label);
          clip.append(badge);
        }
        appendTrimHandles(clip);
        track.append(clip);
        const keyTimes = [
          ...new Set(
            Object.values(
              entry.layer.transform as unknown as Record<
                string,
                { readonly keyframes: readonly { readonly time: number }[] }
              >,
            ).flatMap((property) =>
              property.keyframes.map((frame) => frame.time),
            ),
          ),
        ];
        for (const time of keyTimes) {
          const diamond = button(
            iconSvg('diamondFilled', 12),
            'keyframe',
            entry.layer.id,
            true,
          );
          diamond.className = 'timeline-keyframe';
          diamond.dataset.time = String(time);
          diamond.title = `Keyframe at ${formatTimelineTime(time)}s`;
          diamond.style.left = `${timeToPixel(time, zoom)}px`;
          track.append(diamond);
        }
      }
      if (crossTrack && controller.destinationId === `track:${row.track.id}`)
        for (const item of controller.previews) {
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
      const times = [
        ...new Set(
          Object.values(
            row.layer.transform as unknown as Record<
              string,
              { readonly keyframes: readonly { readonly time: number }[] }
            >,
          ).flatMap((property) =>
            property.keyframes.map((frame) => frame.time),
          ),
        ),
      ];
      for (const time of times) {
        const diamond = button(
          iconSvg('diamondFilled', 12),
          'keyframe',
          row.layer.id,
          true,
        );
        diamond.className = 'timeline-keyframe';
        diamond.dataset.time = String(time);
        diamond.title = `Keyframe at ${time}s`;
        diamond.style.left = `${timeToPixel(time, zoom)}px`;
        track.append(diamond);
      }
      line.append(header, track);
      content.append(line);
    }
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No layers in this composition.';
      content.append(empty);
    }
    const playhead = button(
      iconSvg('chevronDown', 12),
      'seek',
      undefined,
      true,
    );
    playhead.className = 'timeline-playhead';
    playhead.setAttribute('aria-label', 'Drag playhead');
    playhead.style.setProperty(
      '--track-height',
      `${(trackRows.length + rows.length) * 34}px`,
    );
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
      guide.style.height = `${28 + (trackRows.length + rows.length) * 34}px`;
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
  };
  const release = () => {
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && root.hasPointerCapture(id))
      root.releasePointerCapture(id);
  };
  const cancel = () => {
    const originalTime =
      pointer?.kind === 'playhead' ? pointer.originalTime : undefined;
    const originalIds = marquee?.originalIds;
    release();
    markerPreview = undefined;
    selectedMarkerId = undefined;
    marquee = undefined;
    pointerSnap = undefined;
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
            (item.index + 1) * 34 >= Math.min(marquee!.y, y) &&
            item.index * 34 <= Math.max(marquee!.y, y),
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
        const bounds = scroll.getBoundingClientRect();
        const index = Math.floor(
          (event.clientY - bounds.top + scroll.scrollTop - 28) / 34,
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
      root.setPointerCapture(event.pointerId);
      scroll.focus({ preventScroll: true });
      if (ruler) seek(event.clientX);
    });
  const pointermove = (event: PointerEvent) => safely(() => update(event));
  const pointerup = (event: PointerEvent) =>
    safely(() => {
      if (event.pointerId !== pointer?.id) return;
      update(event);
      const kind = pointer?.kind;
      const moved = pointer?.moved ?? false;
      release();
      pointerSnap = undefined;
      if (kind === 'clip') controller.finish();
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
      suppressClick = kind === 'marquee';
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
        case 'menu-back':
          showMainMenu();
          return;
        case 'speed-preset':
          setClipSpeed(engine, session, Number(target.dataset.speed));
          break;
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
  const dragover = (event: DragEvent) => {
    const asset = event.dataTransfer?.types.includes(
      'application/x-editor-asset',
    );
    if (reorderId || asset) {
      event.preventDefault();
      if (asset) {
        root
          .querySelector('.asset-drop-target')
          ?.classList.remove('asset-drop-target');
        (event.target as HTMLElement)
          .closest('.timeline-nle-row')
          ?.classList.add('asset-drop-target');
      }
    }
  };
  const clearAssetDropTarget = () =>
    root
      .querySelector('.asset-drop-target')
      ?.classList.remove('asset-drop-target');
  const dragleave = (event: DragEvent) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !root.contains(event.relatedTarget)
    )
      clearAssetDropTarget();
  };
  const drop = (event: DragEvent) =>
    safely(() => {
      clearAssetDropTarget();
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
  const menuItem = (label: string, action: string, role = 'menuitem') => {
    const item = button(label, action);
    item.setAttribute('role', role);
    return item;
  };
  const showMainMenu = () => {
    const clips = selectionRoots(session.source, session.selectedIds).flatMap(
      (layer) => {
        const found = findClipByLayer(session.source.composition, layer.id);
        return found ? [found.clip] : [];
      },
    );
    menu.replaceChildren(
      ...contextActions(
        session.source,
        session.selectedIds,
        session.currentTime,
        menuMarker,
      ).map((action) => {
        if (action === 'speed')
          return menuItem(`${t('command.speed')} ›`, action);
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
  const showSpeedMenu = () => {
    const current = selectionRoots(session.source, session.selectedIds)
      .map((layer) => findClipByLayer(session.source.composition, layer.id))
      .find(Boolean)?.clip.speed;
    const back = menuItem(`‹ ${t('menu.back')}`, 'menu-back');
    menu.replaceChildren(
      back,
      ...SPEED_PRESETS.map((speed) => {
        const item = menuItem(
          t('clip.speedValue', { speed: formatNumber(speed) }),
          'speed-preset',
          'menuitemradio',
        );
        item.dataset.speed = String(speed);
        item.setAttribute('aria-checked', String(current === speed));
        return item;
      }),
    );
    back.focus();
  };
  const contextmenu = (event: MouseEvent) => {
    event.preventDefault();
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
    showMainMenu();
    menu.hidden = false;
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
    drop,
    wheel,
  };
  for (const [name, listener] of Object.entries(listeners))
    root.addEventListener(name, listener as EventListener);
  window.addEventListener('blur', cancel);
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
    render,
    cancel,
    dispose: () => {
      cancel();
      unsubscribe();
      controller.dispose();
      playback.dispose();
      for (const [name, listener] of Object.entries(listeners))
        root.removeEventListener(name, listener as EventListener);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      scroll.removeEventListener('scroll', onScroll);
      root.replaceChildren();
    },
  };
}
