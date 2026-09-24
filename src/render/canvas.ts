import {
  invertMatrix,
  multiplyMatrices,
  transformPoint,
  type AffineMatrix,
  type Point2,
} from '../core';
import {
  TEXT_FONT,
  fallbackTextMeasure,
  type TextMeasurer,
} from './text-layout';
import { selectionGeometry } from './selection';
import type { DrawingPath } from './drawing';
import { deriveRenderItems, hitTest, type RenderSource } from './adapter';

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly matrix: AffineMatrix;
}
export interface RenderReport {
  readonly warnings: readonly string[];
  readonly zoom: number;
}
export interface CompositionRenderer {
  readonly measureText?: TextMeasurer;
  render(
    canvas: HTMLCanvasElement,
    source: RenderSource,
    viewport: Viewport,
    selectedId: string | null,
  ): RenderReport;
}

/** View-only fit transform; project coordinates and device-pixel coordinates stay distinct. */
export function fitViewport(
  width: number,
  height: number,
  composition: RenderSource['composition'],
  pixelRatio = 1,
): Viewport {
  if (
    ![width, height, composition.width, composition.height, pixelRatio].every(
      Number.isFinite,
    ) ||
    width <= 0 ||
    height <= 0 ||
    pixelRatio <= 0 ||
    composition.width <= 0 ||
    composition.height <= 0
  )
    throw new RangeError('Invalid viewport');
  // Prefer 40px per side. When that cannot fit, retain up to one logical
  // pixel of content, never more than the actual viewport dimension.
  const availableWidth = Math.min(width, Math.max(1, width - 80));
  const availableHeight = Math.min(height, Math.max(1, height - 80));
  const zoom = Math.min(
    availableWidth / composition.width,
    availableHeight / composition.height,
    1,
  );
  // Extremely small ratios can underflow to zero; never return a collapsed fit.
  if (!Number.isFinite(zoom) || zoom <= 0)
    throw new RangeError('Unrepresentable viewport fit');
  return {
    width,
    height,
    pixelRatio: Math.min(pixelRatio, 2),
    matrix: [
      zoom,
      0,
      0,
      zoom,
      (width - composition.width * zoom) / 2,
      (height - composition.height * zoom) / 2,
    ],
  };
}
export function pickLayer(
  source: RenderSource,
  viewport: Viewport,
  point: Point2,
): string | null {
  try {
    const inverse = invertMatrix(viewport.matrix);
    return inverse ? hitTest(source, transformPoint(inverse, point)) : null;
  } catch {
    return null;
  }
}

/** Replaceable Canvas 2D boundary. No engine, subscriptions, commands, or retained scene data. */
export class Canvas2DRenderer implements CompositionRenderer {
  #metrics: CanvasRenderingContext2D | null | undefined;
  readonly measureText: TextMeasurer = (text, fontSize) => {
    if (this.#metrics === undefined)
      this.#metrics = document.createElement('canvas').getContext('2d');
    if (!this.#metrics) return fallbackTextMeasure(text, fontSize);
    this.#metrics.font = TEXT_FONT(fontSize);
    return this.#metrics.measureText(text).width;
  };
  render(
    canvas: HTMLCanvasElement,
    source: RenderSource,
    viewport: Viewport,
    selectedId: string | null,
  ): RenderReport {
    canvas.width = Math.max(
      1,
      Math.round(viewport.width * viewport.pixelRatio),
    );
    canvas.height = Math.max(
      1,
      Math.round(viewport.height * viewport.pixelRatio),
    );
    const context = canvas.getContext('2d');
    if (!context)
      return {
        warnings: [
          'Canvas 2D is unavailable in this browser. Use the scene list and inspector.',
        ],
        zoom: viewport.matrix[0],
      };
    return drawComposition(context, source, viewport, selectedId);
  }
}

export interface DrawOptions {
  /** Selection handles and the composition border (false for export, W5-A). */
  readonly overlays?: boolean;
  /** Fill for the area outside the composition (letterbox); cleared when absent. */
  readonly surround?: string;
}

function strokePath(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  path: DrawingPath,
) {
  context.strokeStyle = path.color;
  context.lineWidth = path.width;
  context.lineCap = path.cap;
  context.lineJoin = path.cap === 'butt' ? 'miter' : 'round';
  context.beginPath();
  context.moveTo(...path.points[0]!);
  for (const point of path.points.slice(1)) context.lineTo(...point);
  context.stroke();
}

export function drawComposition(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: RenderSource,
  viewport: Viewport,
  selectedId: string | null,
  options: DrawOptions = {},
): RenderReport {
  const pixels: AffineMatrix = [
    viewport.pixelRatio,
    0,
    0,
    viewport.pixelRatio,
    0,
    0,
  ];
  const view = multiplyMatrices(pixels, viewport.matrix);
  const { items, warnings } = deriveRenderItems(source);
  const errors = [...warnings];
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(
    0,
    0,
    viewport.width * viewport.pixelRatio,
    viewport.height * viewport.pixelRatio,
  );
  if (options.surround) {
    context.fillStyle = options.surround;
    context.fillRect(
      0,
      0,
      viewport.width * viewport.pixelRatio,
      viewport.height * viewport.pixelRatio,
    );
  }
  context.save();
  try {
    context.setTransform(...view);
    context.globalAlpha = 1;
    context.fillStyle = source.background;
    context.fillRect(0, 0, source.composition.width, source.composition.height);
    context.beginPath();
    context.rect(0, 0, source.composition.width, source.composition.height);
    context.clip();
    for (const item of items) {
      context.save();
      try {
        context.setTransform(...multiplyMatrices(view, item.matrix));
        context.globalAlpha = item.opacity;
        // W4-B: decoded media replaces the placeholder once its frame is ready.
        const frame = item.media
          ? source.frames?.frame(item.media, source.playing ?? false)
          : null;
        if (frame) {
          context.drawImage(frame, 0, 0, item.size.width, item.size.height);
          continue;
        }
        // SHP-019: a drawing strokes its path; it has no box fill or clip.
        if (item.path) {
          strokePath(context, item.path);
          continue;
        }
        context.fillStyle = item.fill;
        if (item.kind !== 'text')
          context.fillRect(0, 0, item.size.width, item.size.height);
        context.beginPath();
        context.rect(0, 0, item.size.width, item.size.height);
        context.clip();
        if (item.kind !== 'rectangle') {
          context.textBaseline = 'top';
          context.font =
            item.kind === 'text'
              ? TEXT_FONT(item.fontSize)
              : '16px Arial, sans-serif';
          context.fillStyle = item.kind === 'text' ? item.fill : '#ffffff';
          const lineHeight = item.kind === 'text' ? item.fontSize * 1.2 : 22;
          // Wrapped records supply lines; legacy text keeps explicit newlines. Cap drawing to visible lines.
          const lines =
            item.lines ??
            item.text.split(
              '\n',
              Math.min(1000, Math.ceil(item.size.height / lineHeight)),
            );
          lines.forEach((line, index) =>
            context.fillText(
              line,
              item.kind === 'text' ? 0 : 16,
              (item.kind === 'text' ? 0 : 16) + index * lineHeight,
            ),
          );
        }
      } catch {
        errors.push(`Could not draw layer ${item.id}.`);
      } finally {
        context.restore();
      }
    }
    // SHP-018: the stroke being drawn, in composition space.
    if (source.drawing) {
      context.setTransform(...view);
      context.globalAlpha = source.drawing.opacity;
      strokePath(context, source.drawing);
    }
  } finally {
    context.restore();
  }
  if (options.overlays === false)
    return { warnings: errors, zoom: viewport.matrix[0] };
  context.setTransform(...view);
  context.globalAlpha = 1;
  context.strokeStyle = '#666975';
  context.lineWidth = 1 / viewport.matrix[0];
  context.strokeRect(0, 0, source.composition.width, source.composition.height);
  // CV-013: snap guides across the composition, 1 CSS px at any zoom.
  if (source.guides?.length) {
    context.setTransform(...pixels);
    context.strokeStyle = '#ff4fa3';
    context.lineWidth = 1;
    context.beginPath();
    for (const guide of source.guides) {
      const from = transformPoint(
        viewport.matrix,
        guide.axis === 'x' ? [guide.value, 0] : [0, guide.value],
      );
      const to = transformPoint(
        viewport.matrix,
        guide.axis === 'x'
          ? [guide.value, source.composition.height]
          : [source.composition.width, guide.value],
      );
      context.moveTo(...from);
      context.lineTo(...to);
    }
    context.stroke();
  }
  for (const id of source.selectedIds ?? []) {
    if (id === selectedId) continue;
    const box = selectionGeometry(source, id, viewport.matrix);
    if (!box) continue;
    context.setTransform(...pixels);
    context.globalAlpha = 1;
    context.strokeStyle = '#b7a2ff';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(...box.corners[0]!);
    box.corners.slice(1).forEach((point) => context.lineTo(...point));
    context.closePath();
    context.stroke();
  }
  const geometry = selectionGeometry(source, selectedId, viewport.matrix);
  if (geometry) {
    context.setTransform(...pixels);
    context.globalAlpha = 1;
    context.strokeStyle = '#b7a2ff';
    context.fillStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(...geometry.corners[0]!);
    geometry.corners.slice(1).forEach((point) => context.lineTo(...point));
    context.closePath();
    if (
      (source.selectedIds?.length ?? 1) === 1 &&
      geometry.handles.some((handle) => handle.id === 'rotate')
    ) {
      context.moveTo(...geometry.top);
      context.lineTo(...geometry.rotation);
    }
    context.stroke();
    for (const handle of (source.selectedIds?.length ?? 1) > 1
      ? []
      : geometry.handles) {
      const [x, y] = handle.point;
      context.fillStyle =
        source.hoveredHandle === handle.id ? '#b7a2ff' : '#ffffff';
      if (handle.kind === 'rotate') {
        context.setTransform(...pixels);
        context.beginPath();
        context.arc(x, y, 8, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = '#302548';
        context.font = '14px Arial, sans-serif';
        context.textBaseline = 'middle';
        context.fillText('\u21bb', x - 6, y);
      } else {
        const width =
          handle.kind === 'text-width' ? 5 : handle.kind === 'edge' ? 6 : 8;
        const height = handle.kind === 'text-width' ? 14 : width;
        context.setTransform(...multiplyMatrices(pixels, handle.matrix));
        context.fillRect(-width / 2, -height / 2, width, height);
        context.strokeRect(-width / 2, -height / 2, width, height);
      }
    }
  }
  return { warnings: errors, zoom: viewport.matrix[0] };
}
