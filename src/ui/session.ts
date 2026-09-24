import type { TextMeasurer } from '../render/text-layout';
import { clampTime, compositionAt, type EditorEngine } from '../core';
import { locateLayer, type RenderSource } from '../render/adapter';
import { keyframeTimes } from './keyframes';
import {
  BRUSH_DEFAULTS,
  DEFAULT_DRAW_COLOR,
  MAX_BRUSH,
  MIN_BRUSH,
  type Brush,
} from '../render/drawing';

export interface SelectedKeyframe {
  readonly layerId: string;
  readonly time: number;
}
/** SHP-018 brush settings; transient like the selection. */
export interface DrawStyle {
  readonly size: number;
  readonly color: string;
  readonly opacity: number;
}

/** Transient identifiers, time and zoom only; canonical objects resolve on every read. */
export class EditorSession {
  #currentTime = 0;
  #timelineZoom = 80;
  #selection: readonly string[] = Object.freeze([]);
  /** Transient preview monitoring (TL-059): never saved, never history. */
  #solo: readonly string[] = Object.freeze([]);
  /** CV-022 group isolation: canvas clicks resolve to this group's children. */
  #enteredGroup: string | null = null;
  #playing = false;
  /** CV-025: align relative to the canvas instead of the selection. */
  #alignToCanvas = false;
  /** ANI-004: selected timeline keyframes (a layer and a time); transient. */
  #keyframes: readonly SelectedKeyframe[] = Object.freeze([]);
  /** SHP-018 draw mode: the active brush, or null when not drawing. */
  #drawBrush: Brush | null = null;
  #drawStyle: DrawStyle = {
    ...BRUSH_DEFAULTS.pen,
    color: DEFAULT_DRAW_COLOR,
  };
  #canvasZoom = 1;
  #compositionId: string;
  #listeners = new Set<() => void>();
  #unsubscribe: () => void;
  constructor(
    private readonly engine: EditorEngine,
    private readonly measureText?: TextMeasurer,
  ) {
    this.#compositionId = engine.state.compositions[0]!.id;
    this.#unsubscribe = engine.on('state:changed', ({ reason }) => {
      if (
        reason === 'load' ||
        !engine.state.compositions.some(
          (item) => item.id === this.#compositionId,
        )
      ) {
        this.#compositionId = engine.state.compositions[0]!.id;
        this.#selection = Object.freeze([]);
        this.#keyframes = Object.freeze([]);
        this.#solo = Object.freeze([]);
        this.#enteredGroup = null;
        this.#currentTime = 0;
      }
      if (
        this.#enteredGroup &&
        locateLayer(this.source.composition.layers, this.#enteredGroup)?.layer
          .type !== 'group'
      )
        this.#enteredGroup = null;
      this.#solo = Object.freeze(
        this.#solo.filter((id) =>
          this.source.composition.tracks.some((track) => track.id === id),
        ),
      );
      this.#selection = Object.freeze(
        this.#selection.filter((id) =>
          locateLayer(this.source.composition.layers, id),
        ),
      );
      this.#keyframes = Object.freeze(
        this.#keyframes.filter((item) => {
          const layer = locateLayer(
            this.source.composition.layers,
            item.layerId,
          )?.layer;
          return !!layer && keyframeTimes(layer).includes(item.time);
        }),
      );
      this.#playing = false;
      this.#currentTime = clampTime(
        this.#currentTime,
        this.source.composition.duration,
      );
      this.#notify();
    });
  }
  get currentTime(): number {
    return this.#currentTime;
  }
  get timelineZoom(): number {
    return this.#timelineZoom;
  }
  setCurrentTime(value: number): void {
    const next = clampTime(value, this.source.composition.duration);
    if (next === this.#currentTime) return;
    this.#currentTime = next;
    this.#notify();
  }
  setTimelineZoom(value: number): void {
    if (!Number.isFinite(value)) throw new RangeError('Invalid timeline zoom');
    const next = Math.max(10, Math.min(400, value));
    if (next === this.#timelineZoom) return;
    this.#timelineZoom = next;
    this.#notify();
  }
  get selectedId(): string | null {
    return this.#selection.at(-1) ?? null;
  }
  get source(): RenderSource {
    const project = this.engine.state;
    return {
      // W5-B: animated values evaluated at the playhead (same code as export).
      composition: compositionAt(
        project.compositions.find((item) => item.id === this.#compositionId)!,
        this.#currentTime,
      ),
      assets: project.assets,
      currentTime: this.#currentTime,
      selectedIds: this.#selection,
      ...(this.#solo.length ? { soloTrackIds: this.#solo } : {}),
      ...(this.measureText ? { measureText: this.measureText } : {}),
      background: project.settings.backgroundColor,
    };
  }
  get drawBrush(): Brush | null {
    return this.#drawBrush;
  }
  get drawStyle(): DrawStyle {
    return this.#drawStyle;
  }
  /** Entering draw mode applies the brush's default size and opacity. */
  setDrawBrush(brush: Brush | null): void {
    if (brush === this.#drawBrush) return;
    this.#drawBrush = brush;
    if (brush)
      this.#drawStyle = { ...this.#drawStyle, ...BRUSH_DEFAULTS[brush] };
    this.#notify();
  }
  setDrawStyle(style: Partial<DrawStyle>): void {
    const next = { ...this.#drawStyle, ...style };
    if (
      !(next.size >= MIN_BRUSH && next.size <= MAX_BRUSH) ||
      !(next.opacity >= 0 && next.opacity <= 1) ||
      !/^#[0-9a-fA-F]{6}$/.test(next.color)
    )
      throw new RangeError('Invalid brush settings');
    this.#drawStyle = Object.freeze(next);
    this.#notify();
  }
  get selectedKeyframes(): readonly SelectedKeyframe[] {
    return this.#keyframes;
  }
  /** Selects timeline keyframes; `add` toggles them into the current set. */
  selectKeyframes(items: readonly SelectedKeyframe[], add = false): void {
    let next = add ? [...this.#keyframes] : [];
    for (const item of items) {
      const at = next.findIndex(
        (other) => other.layerId === item.layerId && other.time === item.time,
      );
      if (at >= 0 && add) next.splice(at, 1);
      else if (at < 0) next.push(Object.freeze({ ...item }));
    }
    next = next.sort((a, b) => a.time - b.time);
    this.#keyframes = Object.freeze(next);
    this.#notify();
  }
  get alignToCanvas(): boolean {
    return this.#alignToCanvas;
  }
  setAlignToCanvas(value: boolean): void {
    if (value === this.#alignToCanvas) return;
    this.#alignToCanvas = value;
    this.#notify();
  }
  get soloTrackIds(): readonly string[] {
    return this.#solo;
  }
  toggleSolo(trackId: string): void {
    if (!this.source.composition.tracks.some((track) => track.id === trackId))
      throw new Error('Unknown track');
    this.#solo = Object.freeze(
      this.#solo.includes(trackId)
        ? this.#solo.filter((id) => id !== trackId)
        : [...this.#solo, trackId],
    );
    this.#notify();
  }
  get enteredGroupId(): string | null {
    return this.#enteredGroup;
  }
  /** Enter a group (double-click) or leave isolation with null. */
  enterGroup(id: string | null): void {
    if (
      id !== null &&
      locateLayer(this.source.composition.layers, id)?.layer.type !== 'group'
    )
      throw new Error('Only groups can be entered');
    if (id === this.#enteredGroup) return;
    this.#enteredGroup = id;
    this.#notify();
  }
  /** Escape out of the entered group: select it and step up one level. */
  exitGroup(): boolean {
    const group = this.#enteredGroup;
    if (!group) return false;
    const found = locateLayer(this.source.composition.layers, group);
    this.#enteredGroup =
      found?.parent?.type === 'group' ? found.parent.id : null;
    this.#selection = Object.freeze(found ? [group] : []);
    this.#notify();
    return true;
  }
  get selectedIds(): readonly string[] {
    return this.#selection;
  }
  get playing(): boolean {
    return this.#playing;
  }
  setPlaying(value: boolean): void {
    if (this.#playing === value) return;
    this.#playing = value;
    this.#notify();
  }
  get canvasZoom(): number {
    return this.#canvasZoom;
  }
  setCanvasZoom(value: number): void {
    if (!Number.isFinite(value)) throw new RangeError('Invalid Canvas zoom');
    this.#canvasZoom = Math.max(0.25, Math.min(4, value));
    this.#notify();
  }
  selectMany(ids: readonly string[]): void {
    const next = [...new Set(ids)].filter((id) =>
      locateLayer(this.source.composition.layers, id),
    );
    if (JSON.stringify(next) === JSON.stringify(this.#selection)) return;
    this.#selection = Object.freeze(next);
    this.#notify();
  }
  select(id: string | null, toggle = false): void {
    // Selecting layers clears the keyframe selection (ANI-004).
    if (this.#keyframes.length) {
      this.#keyframes = Object.freeze([]);
      this.#notify();
    }
    this.selectMany(
      id
        ? toggle
          ? this.#selection.includes(id)
            ? this.#selection.filter((item) => item !== id)
            : [...this.#selection, id]
          : [id]
        : [],
    );
  }
  selectComposition(id: string): void {
    if (!this.engine.state.compositions.some((item) => item.id === id))
      throw new Error('Unknown composition');
    this.#playing = false;
    this.#compositionId = id;
    this.#currentTime = 0;
    this.#selection = Object.freeze([]);
    this.#keyframes = Object.freeze([]);
    this.#solo = Object.freeze([]);
    this.#enteredGroup = null;
    this.#notify();
  }
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
  dispose(): void {
    this.#unsubscribe();
    this.#listeners.clear();
  }
}
