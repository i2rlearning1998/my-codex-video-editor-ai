// SHP-018/SHP-019 Draw tool: collects one freehand stroke in composition space
// and commits it as one "Draw" transaction creating a shape layer and its clip.
// SHP-020: with the Eraser it collects the strokes the pointer touches and
// deletes them as one "Erase" transaction on release.
import {
  createLayer,
  findClipByLayer,
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
  formatPath,
  strokeGeometry,
  type Brush,
} from '../render/drawing';
import {
  deriveRenderItems,
  type RenderItem,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
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

const segmentDistance = (point: Point2, a: Point2, b: Point2) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length),
      )
    : 0;
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
};

/** The freehand strokes an eraser can remove: drawn now, on unlocked tracks. */
export function erasableStrokes(source: RenderSource) {
  return deriveRenderItems({ ...source, animate: true }).items.flatMap(
    (item: RenderItem) => {
      if (!item.path) return [];
      const root = item.ancestors[0] ?? item.id;
      if (findClipByLayer(source.composition, root)?.track.locked) return [];
      const [a, b, c, d] = item.matrix;
      const scale = Math.sqrt(Math.abs(a * d - b * c));
      return [
        {
          id: item.id,
          points: item.path.points.map((point) =>
            transformPoint(item.matrix, point),
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

/** The composition without `ids`, for previewing an erase before release. */
export function withoutLayers<T extends { layers: readonly SceneLayer[] }>(
  composition: T,
  ids: ReadonlySet<string>,
): T {
  const strip = (layers: readonly SceneLayer[]): SceneLayer[] =>
    layers
      .filter((layer) => !ids.has(layer.id))
      .map((layer) =>
        layer.children.length
          ? { ...layer, children: strip(layer.children) }
          : layer,
      );
  return { ...composition, layers: strip(composition.layers) };
}

/** The stroke in progress. Nothing is committed until `finish`. */
export class DrawTool {
  #points: Point2[] | null = null;
  /** SHP-020: the erase in progress (strokes touched so far). */
  #erase: {
    strokes: ReturnType<typeof erasableStrokes>;
    last: Point2;
    ids: Set<string>;
  } | null = null;
  constructor(
    private readonly engine: EditorEngine,
    private readonly session: EditorSession,
    private readonly changed: () => void,
  ) {}
  get active(): boolean {
    return this.#points !== null || this.#erase !== null;
  }
  /** Strokes the eraser has touched; hidden until the erase commits. */
  get erased(): ReadonlySet<string> {
    return this.#erase?.ids ?? new Set();
  }
  /** The live preview for the renderer. */
  get preview(): (DrawingPath & { opacity: number }) | undefined {
    const brush = this.session.drawBrush;
    if (!this.#points || !brush || brush === 'eraser' || !this.#points.length)
      return undefined;
    const style = this.session.drawStyle;
    const points =
      this.#points.length === 1
        ? [this.#points[0]!, this.#points[0]!]
        : this.#points;
    return {
      points,
      width: style.size,
      color: style.color,
      cap: brush === 'highlighter' ? 'butt' : 'round',
      opacity: style.opacity,
    };
  }
  begin(point: Point2): void {
    if (this.session.drawBrush === 'eraser') {
      const strokes = erasableStrokes(this.session.source);
      this.#erase = { strokes, last: point, ids: new Set() };
      this.#touch(point);
      return;
    }
    this.#points = [];
    addPoint(this.#points, point);
    this.changed();
  }
  #touch(point: Point2): void {
    const erase = this.#erase!;
    const size = this.session.drawStyle.size;
    const before = erase.ids.size;
    for (const id of strokesTouched(erase.strokes, erase.last, point, size))
      erase.ids.add(id);
    erase.last = point;
    if (erase.ids.size !== before) this.changed();
  }
  add(point: Point2): void {
    if (this.#erase) return this.#touch(point);
    if (this.#points && addPoint(this.#points, point)) this.changed();
  }
  finish(): void {
    const erase = this.#erase;
    if (erase) {
      this.#erase = null;
      try {
        if (erase.ids.size)
          this.engine.commands.transaction(
            'Erase',
            [...erase.ids].map((layerId) => ({
              type: 'DELETE_LAYER' as const,
              compositionId: this.session.source.composition.id,
              layerId,
            })),
          );
      } finally {
        this.changed();
      }
      return;
    }
    const points = this.#points;
    const brush = this.session.drawBrush;
    this.#points = null;
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
    this.changed();
  }
}
