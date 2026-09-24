// SHP-018/SHP-019 Draw tool: collects one freehand stroke in composition space
// and commits it as one "Draw" transaction creating a shape layer and its clip.
import {
  createLayer,
  number,
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
import type { RenderSource } from '../render/adapter';
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

/** The stroke in progress. Nothing is committed until `finish`. */
export class DrawTool {
  #points: Point2[] | null = null;
  constructor(
    private readonly engine: EditorEngine,
    private readonly session: EditorSession,
    private readonly changed: () => void,
  ) {}
  get active(): boolean {
    return this.#points !== null;
  }
  /** The live preview for the renderer. */
  get preview(): (DrawingPath & { opacity: number }) | undefined {
    const brush = this.session.drawBrush;
    if (!this.#points || !brush || this.#points.length < 1) return undefined;
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
    this.#points = [];
    addPoint(this.#points, point);
    this.changed();
  }
  add(point: Point2): void {
    if (this.#points && addPoint(this.#points, point)) this.changed();
  }
  finish(): void {
    const points = this.#points;
    const brush = this.session.drawBrush;
    this.#points = null;
    try {
      if (!points || !brush) return;
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
    if (!this.#points) return;
    this.#points = null;
    this.changed();
  }
}
