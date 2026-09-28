// SHP-018/SHP-019 Draw tool: collects one freehand stroke in composition space
// and commits it as one "Draw" transaction creating a shape layer and its clip.
// G4: strokes are smoothed, Shift draws a straight line, and the Eraser
// removes ink by area: strokes it crosses are cut into parts (one layer each
// still), strokes it covers entirely are deleted, as one "Erase" transaction
// on release.
import {
  createLayer,
  findClipByLayer,
  invertMatrix,
  type AffineMatrix,
  number,
  transformPoint,
  vector2,
  type Command,
  type EditorEngine,
  type Point2,
} from '../core';
import type { DrawingPath } from '../render/drawing';
import {
  addPoint,
  eraseStrokes,
  formatPath,
  formatStrokes,
  segmentDistance,
  smoothStroke,
  strokeGeometry,
  type Brush,
} from '../render/drawing';
import {
  deriveRenderItems,
  locateLayer,
  type RenderItem,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import { drawingPathCommands } from './context-toolbar';
import { t } from '../i18n';
import { trackForNewClip } from './editing';
import type { DrawStyle, EditorSession } from './session';

/** A drawing's clip starts at the playhead and lasts like a dropped image. */
export const DRAWING_DURATION = 5;

const text = (value: string) => ({
  type: 'string' as const,
  value,
  animated: false,
  keyframes: [],
  constraints: [],
});
const color = (value: string) => ({
  type: 'color' as const,
  value,
  animated: false,
  keyframes: [],
  constraints: [],
});

/** Commands that add one stroke as a layer with a clip, or [] for a dot. */
export function strokeCommands(
  source: RenderSource,
  points: readonly Point2[],
  brush: Brush,
  style: DrawStyle,
  time: number,
): Command[] {
  if (new Set(points.map((point) => point.join(' '))).size < 2) return [];
  const composition = source.composition;
  const geometry = strokeGeometry(points, style.size);
  const drawings = composition.layers.filter(
    (item) => item.type === 'shape' && item.properties.path,
  ).length;
  const name = t('draw.layerName', { n: String(drawings + 1) });
  const layer = createLayer(
    crypto.randomUUID(),
    'shape',
    name,
    DRAWING_DURATION,
  );
  layer.startTime = time;
  layer.transform.position = vector2(...geometry.position);
  layer.transform.opacity = number(style.opacity);
  layer.properties = {
    width: number(geometry.width),
    height: number(geometry.height),
    path: text(formatPath(geometry.points)),
    brush: text(brush),
    stroke: color(style.color),
    strokeWidth: number(style.size),
  };
  const target = trackForNewClip(
    composition,
    'shape',
    time,
    time + DRAWING_DURATION,
  );
  return [
    ...target.commands,
    {
      type: 'CREATE_LAYER',
      compositionId: composition.id,
      parentId: null,
      layer,
    },
    {
      type: 'CREATE_CLIP',
      compositionId: composition.id,
      trackId: target.trackId,
      clip: {
        id: crypto.randomUUID(),
        name,
        layerId: layer.id,
        assetId: null,
        startTime: time,
        duration: DRAWING_DURATION,
        sourceIn: 0,
        sourceOut: DRAWING_DURATION,
        enabled: true,
        speed: 1,
        transitionMetadata: {},
        effectMetadata: {},
        metadata: {},
      },
    },
  ];
}

/** The freehand strokes an eraser can reach: drawn now, on unlocked tracks. */
export function erasableStrokes(source: RenderSource) {
  return deriveRenderItems({ ...source, animate: true }).items.flatMap(
    (item: RenderItem) => {
      if (!item.path) return [];
      const root = item.ancestors[0] ?? item.id;
      if (findClipByLayer(source.composition, root)?.track.locked) return [];
      const inverse = invertMatrix(item.matrix);
      if (!inverse) return [];
      const [a, b, c, d] = item.matrix;
      const scale = Math.sqrt(Math.abs(a * d - b * c));
      return [
        {
          id: item.id,
          path: item.path,
          matrix: item.matrix as AffineMatrix,
          inverse,
          scale,
          points: item.path.strokes.flatMap((stroke) =>
            stroke.map((point) => transformPoint(item.matrix, point)),
          ),
          halfWidth: (item.path.width / 2) * scale,
        },
      ];
    },
  );
}

/**
 * Ids of the strokes an eraser of diameter `size` touches while moving from
 * `from` to `to` (composition space). The eraser path is sampled finely
 * enough that no stroke is skipped.
 */
export function strokesTouched(
  strokes: ReturnType<typeof erasableStrokes>,
  from: Point2,
  to: Point2,
  size: number,
): string[] {
  const radius = size / 2;
  const steps = Math.max(
    1,
    Math.ceil(
      Math.hypot(to[0] - from[0], to[1] - from[1]) / Math.max(1, radius / 2),
    ),
  );
  const samples = Array.from({ length: steps + 1 }, (_, i): Point2 => [
    from[0] + ((to[0] - from[0]) * i) / steps,
    from[1] + ((to[1] - from[1]) * i) / steps,
  ]);
  return strokes
    .filter(({ points, halfWidth }) =>
      samples.some((sample) =>
        points.some(
          (point, i) =>
            segmentDistance(
              sample,
              point,
              points[Math.min(i + 1, points.length - 1)]!,
            ) <=
            radius + halfWidth,
        ),
      ),
    )
    .map(({ id }) => id);
}

/**
 * G4: the composition with the eraser's results in place, for the preview
 * before release: a layer's path is replaced by what remains of it, and a
 * layer with nothing left is left out.
 */
export function withErasedPaths<T extends { layers: readonly SceneLayer[] }>(
  composition: T,
  erased: ReadonlyMap<string, readonly (readonly Point2[])[]>,
): T {
  const visit = (layers: readonly SceneLayer[]): SceneLayer[] =>
    layers.flatMap((layer) => {
      const pieces = erased.get(layer.id);
      if (pieces && !pieces.length) return [];
      const path = layer.properties.path;
      const properties: Record<string, unknown> = { ...layer.properties };
      if (pieces && path?.type === 'string')
        properties.path = Object.assign({}, path, {
          value: formatStrokes(pieces),
        });
      const next = pieces
        ? (Object.assign({}, layer, { properties }) as unknown as SceneLayer)
        : layer;
      return [
        next.children.length
          ? (Object.assign({}, next, {
              children: visit(next.children),
            }) as unknown as SceneLayer)
          : next,
      ];
    });
  return { ...composition, layers: visit(composition.layers) };
}

/**
 * Commands that apply an erase: a drawing with nothing left is deleted; a
 * cut one keeps its parts (local units) in one layer, re-padded so its box
 * fits them, with the ink left where it was.
 */
export function eraseCommands(
  source: RenderSource,
  erased: ReadonlyMap<string, readonly (readonly Point2[])[]>,
): Command[] {
  const compositionId = source.composition.id;
  return [...erased].flatMap(([layerId, pieces]): Command[] => {
    const found = locateLayer(source.composition.layers, layerId);
    const width = found?.layer.properties.strokeWidth;
    if (!found || width?.type !== 'number') return [];
    if (!pieces.length)
      return [{ type: 'DELETE_LAYER', compositionId, layerId }];
    const pad = width.value / 2;
    const all = pieces.flat();
    const minX = Math.min(...all.map((point) => point[0])),
      minY = Math.min(...all.map((point) => point[1]));
    const maxX = Math.max(...all.map((point) => point[0])),
      maxY = Math.max(...all.map((point) => point[1]));
    const shift: Point2 = [pad - minX, pad - minY];
    return drawingPathCommands(
      compositionId,
      found.layer,
      pieces.map((piece) =>
        piece.map(([x, y]): Point2 => [x + shift[0], y + shift[1]]),
      ),
      shift,
      maxX - minX + width.value,
      maxY - minY + width.value,
    );
  });
}

/** The stroke in progress. Nothing is committed until `finish`. */
export class DrawTool {
  #points: Point2[] | null = null;
  /** G4: Shift held on the last move: a straight line from the start. */
  #straight = false;
  /** G4: the area erase in progress: what remains of each stroke touched. */
  #erase: {
    strokes: ReturnType<typeof erasableStrokes>;
    last: Point2;
    pieces: Map<string, Point2[][]>;
  } | null = null;
  constructor(
    private readonly engine: EditorEngine,
    private readonly session: EditorSession,
    private readonly changed: () => void,
  ) {}
  get active(): boolean {
    return this.#points !== null || this.#erase !== null;
  }
  /** What remains of the strokes the eraser has touched (local units). */
  get erased(): ReadonlyMap<string, readonly (readonly Point2[])[]> {
    return this.#erase?.pieces ?? new Map();
  }
  /** The points to draw or commit: straight, or smoothed. */
  #stroke(): Point2[] {
    const points = this.#points ?? [];
    if (this.#straight && points.length > 1)
      return [points[0]!, points.at(-1)!];
    return smoothStroke(points);
  }
  /** The live preview for the renderer. */
  get preview(): (DrawingPath & { opacity: number }) | undefined {
    const brush = this.session.drawBrush;
    if (!this.#points || !brush || brush === 'eraser' || !this.#points.length)
      return undefined;
    const style = this.session.drawStyle;
    const stroke = this.#stroke();
    return {
      strokes: [stroke.length === 1 ? [stroke[0]!, stroke[0]!] : stroke],
      width: style.size,
      color: style.color,
      brush,
      opacity: style.opacity,
    };
  }
  begin(point: Point2): void {
    this.#straight = false;
    if (this.session.drawBrush === 'eraser') {
      const strokes = erasableStrokes(this.session.source);
      this.#erase = { strokes, last: point, pieces: new Map() };
      this.#touch(point);
      return;
    }
    this.#points = [];
    addPoint(this.#points, point);
    this.changed();
  }
  /** Erases along the eraser's path from the last point to `point`. */
  #touch(point: Point2): void {
    const erase = this.#erase!;
    const radius = this.session.drawStyle.size / 2;
    const touched = strokesTouched(
      erase.strokes,
      erase.last,
      point,
      radius * 2,
    );
    const steps = Math.max(
      1,
      Math.ceil(
        Math.hypot(point[0] - erase.last[0], point[1] - erase.last[1]) /
          Math.max(0.5, radius / 2),
      ),
    );
    const samples = Array.from({ length: steps + 1 }, (_, i): Point2 => [
      erase.last[0] + ((point[0] - erase.last[0]) * i) / steps,
      erase.last[1] + ((point[1] - erase.last[1]) * i) / steps,
    ]);
    erase.last = point;
    let changed = false;
    for (const id of touched) {
      const stroke = erase.strokes.find((item) => item.id === id)!;
      const current =
        erase.pieces.get(id) ??
        stroke.path.strokes.map((points) => [...points]);
      if (!current.length) continue;
      const next = eraseStrokes(
        current,
        stroke.path.width,
        samples.map((sample) => transformPoint(stroke.inverse, sample)),
        radius / Math.max(stroke.scale, 1e-9),
      );
      if (JSON.stringify(next) === JSON.stringify(current)) continue;
      erase.pieces.set(id, next);
      changed = true;
    }
    if (changed) this.changed();
  }
  add(point: Point2, straight = false): void {
    if (this.#erase) return this.#touch(point);
    if (!this.#points) return;
    const added = addPoint(this.#points, point);
    if (added || straight !== this.#straight) {
      this.#straight = straight;
      this.changed();
    }
  }
  finish(): void {
    const erase = this.#erase;
    if (erase) {
      this.#erase = null;
      try {
        const commands = eraseCommands(this.session.source, erase.pieces);
        if (commands.length)
          this.engine.commands.transaction('Erase', commands);
      } finally {
        this.changed();
      }
      return;
    }
    const brush = this.session.drawBrush;
    const points = this.#points ? this.#stroke() : null;
    this.#points = null;
    this.#straight = false;
    try {
      if (!points || !brush || brush === 'eraser') return;
      const commands = strokeCommands(
        this.session.source,
        points,
        brush,
        this.session.drawStyle,
        this.session.currentTime,
      );
      if (commands.length) this.engine.commands.transaction('Draw', commands);
    } finally {
      this.changed();
    }
  }
  cancel(): void {
    if (!this.#points && !this.#erase) return;
    this.#points = null;
    this.#erase = null;
    this.#straight = false;
    this.changed();
  }
}
