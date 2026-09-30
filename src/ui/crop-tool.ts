// H3: cropping a picture or video on the canvas (Canva's Crop). While the
// tool runs, the whole source stays where it is (dimmed) and a crop frame
// with corner and edge handles moves over it; drag inside the frame to move
// it. Nothing is committed until Done, which writes the crop, the new box
// size and position (so the kept part stays exactly where it was) and an
// optional rotation as one undo step. Cancel, Escape or leaving the layer
// discards the work.
import {
  invertMatrix,
  localTransformMatrix,
  multiplyMatrices,
  number,
  rotateAroundCenter,
  transformPoint,
  worldTransform,
  type AffineMatrix,
  type Command,
  type EditorEngine,
  type Point2,
  type TransformValues,
} from '../core';
import {
  layerSize,
  locateLayer,
  type CropOverlay,
  type CropView,
  type LocalRect,
  type SceneLayer,
} from '../render/adapter';
import { cropOf, FULL_CROP, type Crop } from '../render/picture';
import type { EditorSession } from './session';
import { buildTransformCommands } from './transform-commands';

export type CropHandle = 0 | 1 | 2 | 3 | 'top' | 'right' | 'bottom' | 'left';
/** Width / height of the kept frame, or null for freeform. */
export type CropRatio = number | null;
const MIN = 0.02;

interface State {
  layerId: string;
  compositionId: string;
  /** The crop stored on the layer when the tool started. */
  original: Crop;
  working: Crop;
  ratio: CropRatio;
  rotation: number;
  /** The layer's box (local units) when the tool started. */
  box: { width: number; height: number };
}

export class CropTool {
  #state: State | null = null;
  #drag: {
    handle: CropHandle | 'move';
    start: Point2;
    from: Crop;
  } | null = null;
  constructor(
    private readonly engine: EditorEngine,
    private readonly session: EditorSession,
    private readonly changed: () => void,
  ) {}
  get active(): boolean {
    return this.#state !== null;
  }
  get layerId(): string | null {
    return this.#state?.layerId ?? null;
  }
  /** The Crop panel's chosen ratio button ('freeform', 'original', '16:9'…). */
  get ratioChoice(): string {
    return this.#choice;
  }
  #choice = 'freeform';
  get ratio(): CropRatio {
    return this.#state?.ratio ?? null;
  }
  get rotation(): number {
    return this.#state?.rotation ?? 0;
  }
  get working(): Crop | null {
    return this.#state?.working ?? null;
  }
  #layer(): SceneLayer | null {
    const state = this.#state;
    return state
      ? (locateLayer(this.session.source.composition.layers, state.layerId)
          ?.layer ?? null)
      : null;
  }
  /** Starts cropping a picture or video layer. */
  start(layerId: string): boolean {
    const source = this.session.source;
    const layer = locateLayer(source.composition.layers, layerId)?.layer;
    if (!layer || (layer.type !== 'image' && layer.type !== 'video'))
      return false;
    const size = layerSize(layer, source.assets);
    if (!size || size.width <= 0 || size.height <= 0) return false;
    const original = cropOf(layer) ?? FULL_CROP;
    this.#state = {
      layerId,
      compositionId: source.composition.id,
      original,
      working: original,
      ratio: null,
      rotation: layer.transform.rotation.value,
      box: { width: size.width, height: size.height },
    };
    this.#choice = 'freeform';
    this.session.setCropLayer(layerId);
    this.changed();
    return true;
  }
  /** The whole source in the layer's local units, from the stored crop. */
  #sourceRect(): LocalRect {
    const { original, box } = this.#state!;
    const width = box.width / original.width,
      height = box.height / original.height;
    return {
      x: -original.x * width,
      y: -original.y * height,
      width,
      height,
    };
  }
  #frameRect(crop: Crop): LocalRect {
    const source = this.#sourceRect();
    return {
      x: source.x + crop.x * source.width,
      y: source.y + crop.y * source.height,
      width: crop.width * source.width,
      height: crop.height * source.height,
    };
  }
  /** For the renderer: the source and the kept frame in local units. */
  get view(): CropView | null {
    const state = this.#state;
    if (!state) return null;
    return {
      layerId: state.layerId,
      source: this.#sourceRect(),
      frame: this.#frameRect(state.working),
    };
  }
  #screenMatrix(view: AffineMatrix): AffineMatrix | null {
    const state = this.#state;
    if (!state) return null;
    try {
      return multiplyMatrices(
        view,
        worldTransform(this.session.source.composition, state.layerId).matrix,
      );
    } catch {
      return null;
    }
  }
  /** For the renderer: the frame and source quads in canvas CSS px. */
  overlay(view: AffineMatrix): CropOverlay | null {
    const matrix = this.#screenMatrix(view);
    const state = this.#state;
    if (!matrix || !state) return null;
    const quad = (rect: LocalRect): Point2[] =>
      (
        [
          [rect.x, rect.y],
          [rect.x + rect.width, rect.y],
          [rect.x + rect.width, rect.y + rect.height],
          [rect.x, rect.y + rect.height],
        ] as Point2[]
      ).map((point) => transformPoint(matrix, point));
    return {
      frame: quad(this.#frameRect(state.working)),
      source: quad(this.#sourceRect()),
    };
  }
  /** The handle (or the frame body) under a canvas point. */
  hit(view: AffineMatrix, point: Point2): CropHandle | 'move' | null {
    const overlay = this.overlay(view);
    if (!overlay) return null;
    const [a, b, c, d] = overlay.frame as [Point2, Point2, Point2, Point2];
    const mid = (p: Point2, q: Point2): Point2 => [
      (p[0] + q[0]) / 2,
      (p[1] + q[1]) / 2,
    ];
    const candidates: [CropHandle, Point2][] = [
      [0, a],
      [1, b],
      [2, c],
      [3, d],
      ['top', mid(a, b)],
      ['right', mid(b, c)],
      ['bottom', mid(c, d)],
      ['left', mid(d, a)],
    ];
    for (const [id, at] of candidates)
      if (Math.hypot(point[0] - at[0], point[1] - at[1]) <= 12) return id;
    const local = this.#toCrop(view, point);
    const crop = this.#state!.working;
    return local &&
      local[0] >= crop.x &&
      local[0] <= crop.x + crop.width &&
      local[1] >= crop.y &&
      local[1] <= crop.y + crop.height
      ? 'move'
      : null;
  }
  /** A canvas point as source fractions (0..1 across the whole source). */
  #toCrop(view: AffineMatrix, point: Point2): Point2 | null {
    const matrix = this.#screenMatrix(view);
    const inverse = matrix && invertMatrix(matrix);
    if (!inverse) return null;
    const local = transformPoint(inverse, point);
    const source = this.#sourceRect();
    return [
      (local[0] - source.x) / source.width,
      (local[1] - source.y) / source.height,
    ];
  }
  begin(view: AffineMatrix, point: Point2): boolean {
    const handle = this.hit(view, point);
    const at = this.#toCrop(view, point);
    if (!handle || !at || !this.#state) return false;
    this.#drag = { handle, start: at, from: this.#state.working };
    return true;
  }
  get dragging(): boolean {
    return this.#drag !== null;
  }
  update(view: AffineMatrix, point: Point2): void {
    const drag = this.#drag,
      state = this.#state;
    const at = this.#toCrop(view, point);
    if (!drag || !state || !at) return;
    const dx = at[0] - drag.start[0],
      dy = at[1] - drag.start[1];
    const from = drag.from;
    if (drag.handle === 'move') {
      state.working = {
        ...from,
        x: Math.min(1 - from.width, Math.max(0, from.x + dx)),
        y: Math.min(1 - from.height, Math.max(0, from.y + dy)),
      };
    } else {
      let left = from.x,
        top = from.y,
        right = from.x + from.width,
        bottom = from.y + from.height;
      const h = drag.handle;
      const moveLeft = h === 0 || h === 3 || h === 'left';
      const moveRight = h === 1 || h === 2 || h === 'right';
      const moveTop = h === 0 || h === 1 || h === 'top';
      const moveBottom = h === 2 || h === 3 || h === 'bottom';
      if (moveLeft) left = Math.min(right - MIN, Math.max(0, left + dx));
      if (moveRight) right = Math.max(left + MIN, Math.min(1, right + dx));
      if (moveTop) top = Math.min(bottom - MIN, Math.max(0, top + dy));
      if (moveBottom) bottom = Math.max(top + MIN, Math.min(1, bottom + dy));
      let crop: Crop = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
      if (state.ratio !== null) {
        // Keep the ratio: the moved side leads, the fixed side stays.
        const k = this.#fractionRatio(state.ratio);
        const vertical = h === 'top' || h === 'bottom';
        let width = vertical ? crop.height * k : crop.width;
        let height = vertical ? crop.height : crop.width / k;
        const maxWidth = moveLeft ? right : 1 - left;
        const maxHeight = moveTop ? bottom : 1 - top;
        const shrink = Math.min(1, maxWidth / width, maxHeight / height);
        width *= shrink;
        height *= shrink;
        crop = {
          x: moveLeft ? right - width : left,
          y: moveTop ? bottom - height : top,
          width,
          height,
        };
      }
      state.working = crop;
    }
    this.changed();
  }
  end(): void {
    this.#drag = null;
  }
  /** Source-fraction width / height for a frame ratio (width / height). */
  #fractionRatio(ratio: number): number {
    const source = this.#sourceRect();
    return (ratio * source.height) / source.width;
  }
  /** Sets a ratio (null freeform, 'original' the source's) and fits the frame. */
  setRatio(ratio: CropRatio | 'original', choice?: string): void {
    const state = this.#state;
    if (!state) return;
    this.#choice =
      choice ??
      (ratio === null
        ? 'freeform'
        : ratio === 'original'
          ? 'original'
          : String(ratio));
    const source = this.#sourceRect();
    const value = ratio === 'original' ? source.width / source.height : ratio;
    state.ratio = value;
    if (value !== null) {
      // The largest frame of that ratio, centred on the current frame.
      const k = this.#fractionRatio(value);
      let width = 1,
        height = 1 / k;
      if (height > 1) {
        height = 1;
        width = k;
      }
      const cx = state.working.x + state.working.width / 2,
        cy = state.working.y + state.working.height / 2;
      state.working = {
        x: Math.min(1 - width, Math.max(0, cx - width / 2)),
        y: Math.min(1 - height, Math.max(0, cy - height / 2)),
        width,
        height,
      };
    }
    this.changed();
  }
  setRotation(degrees: number): void {
    if (!this.#state || !Number.isFinite(degrees)) return;
    this.#state.rotation = Math.max(-180, Math.min(180, degrees));
    this.changed();
  }
  reset(): void {
    const state = this.#state;
    if (!state) return;
    state.working = FULL_CROP;
    state.ratio = null;
    this.#choice = 'freeform';
    this.changed();
  }
  cancel(): void {
    if (!this.#state) return;
    this.#state = null;
    this.#drag = null;
    this.session.setCropLayer(null);
    this.changed();
  }
  /** The commands Done runs (exported for unit tests through `done`). */
  commands(): Command[] {
    const state = this.#state,
      layer = this.#layer();
    if (!state || !layer) return [];
    const { working, original, box } = state;
    const frame = this.#frameRect(working);
    const property = (key: string, value: number): Command =>
      ({
        type: 'SET_PROPERTY',
        compositionId: state.compositionId,
        layerId: layer.id,
        target: { kind: 'property', key },
        property: number(value),
      }) as Command;
    const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    const unchanged =
      same(working.x, original.x) &&
      same(working.y, original.y) &&
      same(working.width, original.width) &&
      same(working.height, original.height);
    const commands: Command[] = [];
    let transform = layer.transform as TransformValues;
    if (!unchanged) {
      commands.push(
        property('cropX', working.x),
        property('cropY', working.y),
        property('cropW', working.width),
        property('cropH', working.height),
        property('width', frame.width),
        property('height', frame.height),
      );
      // The kept part stays where it is: the new local origin is the frame's
      // top-left corner in the old local space.
      const origin = transformPoint(localTransformMatrix(transform), [
        frame.x,
        frame.y,
      ]);
      transform = { ...transform, position: { value: origin } };
    }
    if (!same(state.rotation, layer.transform.rotation.value))
      transform = rotateAroundCenter(
        transform,
        {
          x: 0,
          y: 0,
          width: unchanged ? box.width : frame.width,
          height: unchanged ? box.height : frame.height,
        },
        state.rotation,
      );
    commands.push(
      ...buildTransformCommands(
        state.compositionId,
        layer,
        transform,
        undefined,
        this.session.currentTime,
      ),
    );
    return commands;
  }
  /** Commits the crop as one undo step and leaves the tool. */
  done(): void {
    const commands = this.commands();
    this.#state = null;
    this.#drag = null;
    this.session.setCropLayer(null);
    if (commands.length) this.engine.commands.transaction('Crop', commands);
    this.changed();
  }
}
