import { drawRich } from './rich-text';
import { drawPicture } from './picture';
import {
  boundsCorners,
  invertMatrix,
  multiplyMatrices,
  transformPoint,
  type AffineMatrix,
  type Point2,
} from '../core';
import {
  TEXT_FONT,
  fallbackTextMeasure,
  lineOffsets,
  type TextMeasurer,
} from './text-layout';
import { DEFAULT_TEXT_STYLE, measureWithContext, textFont } from './text-style';
import {
  multiSelectionGeometry,
  selectionGeometry,
  type SelectionHandle,
} from './selection';
import { brushCap, type DrawingPath } from './drawing';
import { drawShape } from './shapes';
import {
  deriveRenderItems,
  hitTest,
  type RenderItem,
  type RenderSource,
} from './adapter';

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

/** H2: how the editor fits the artboard (24 px per side, may enlarge). */
export const EDITOR_FIT = Object.freeze({ padding: 24, upscale: true });
/** View-only fit transform; project coordinates and device-pixel coordinates stay distinct. */
export function fitViewport(
  width: number,
  height: number,
  composition: RenderSource['composition'],
  pixelRatio = 1,
  /**
   * H2: the editor fits with `padding` CSS px per side and may enlarge a
   * small composition to use the whole free area. The defaults (40 px, never
   * above 100%) are the earlier behaviour.
   */
  options: { padding?: number; upscale?: boolean } = {},
): Viewport {
  const padding = options.padding ?? 40;
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
  // Prefer `padding` px per side. When that cannot fit, retain up to one
  // logical pixel of content, never more than the actual viewport dimension.
  const availableWidth = Math.min(width, Math.max(1, width - 2 * padding));
  const availableHeight = Math.min(height, Math.max(1, height - 2 * padding));
  const zoom = Math.min(
    availableWidth / composition.width,
    availableHeight / composition.height,
    options.upscale ? Infinity : 1,
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

/**
 * W2-F5: draws a text item's laid-out lines with its font, alignment, letter
 * spacing, line height and paragraph spacing. Justified lines spread their
 * word gaps; a paragraph's last line stays left-aligned.
 */
function drawText(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  item: RenderItem,
) {
  const layout = item.textLayout!;
  const style = item.textStyle ?? DEFAULT_TEXT_STYLE;
  const width = item.size.width;
  const measure = (text: string) =>
    measureWithContext(context, text, item.fontSize, style);
  context.font = textFont(style, item.fontSize);
  context.textBaseline = 'top';
  context.fillStyle = item.fill;
  const offsets = lineOffsets(layout);
  const visible = Math.min(1000, layout.lines.length);
  // H3: the text's vertical anchor in a box taller than its lines.
  const room = Math.max(0, item.size.height - layout.height);
  const shift =
    style.anchor === 'middle' ? room / 2 : style.anchor === 'bottom' ? room : 0;
  // H3: underline and strikethrough follow each drawn line.
  const decorate = (x: number, y: number, lineWidth: number) => {
    const thickness = Math.max(1, item.fontSize / 15);
    if (style.underline)
      context.fillRect(x, y + item.fontSize * 0.95, lineWidth, thickness);
    if (style.strike)
      context.fillRect(x, y + item.fontSize * 0.52, lineWidth, thickness);
  };
  for (let index = 0; index < visible; index++) {
    const line = layout.lines[index]!;
    const y = offsets[index]! + shift;
    if (y > item.size.height) break;
    const words = line
      .split(/(\s+)/u)
      .filter((part) => part && !/^\s+$/u.test(part));
    if (
      style.align === 'justify' &&
      !layout.paragraphEnds[index] &&
      words.length > 1
    ) {
      const used = words.reduce((sum, word) => sum + measure(word), 0);
      const gap = (width - used) / (words.length - 1);
      let x = 0;
      for (const word of words) {
        fillSpaced(context, word, x, y, style.letterSpacing);
        x += measure(word) + gap;
      }
      decorate(0, y, width);
      continue;
    }
    const lineWidth = measure(line);
    const x =
      style.align === 'center'
        ? (width - lineWidth) / 2
        : style.align === 'right'
          ? width - lineWidth
          : 0;
    fillSpaced(context, line, x, y, style.letterSpacing);
    if (line.trim()) decorate(x, y, lineWidth);
  }
}

/** Fills text with letter spacing (Canvas `letterSpacing`, Chrome 99+). */
function fillSpaced(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  context.letterSpacing = `${spacing}px`;
  context.fillText(text, x, y);
  context.letterSpacing = '0px';
}

/** Replaceable Canvas 2D boundary. No engine, subscriptions, commands, or retained scene data. */
export class Canvas2DRenderer implements CompositionRenderer {
  #metrics: CanvasRenderingContext2D | null | undefined;
  readonly measureText: TextMeasurer = (text, fontSize, style) => {
    if (this.#metrics === undefined)
      this.#metrics = document.createElement('canvas').getContext('2d');
    if (!this.#metrics) return fallbackTextMeasure(text, fontSize, style);
    return measureWithContext(this.#metrics, text, fontSize, style);
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

/**
 * G3, J6: the opacity of layer parts outside the composition in the editor.
 * 0.3 made elements left outside the page (after Resize canvas to
 * selection) look disabled; 0.6 reads as "outside the page" but still active.
 */
const OUTSIDE_FADE = 0.6;
export interface DrawOptions {
  /** Selection handles and the composition border (false for export, W5-A). */
  readonly overlays?: boolean;
  /** Fill for the area outside the composition (letterbox); cleared when absent. */
  readonly surround?: string;
}

/**
 * G4: each brush draws differently. Pen: a round, solid line. Marker: a
 * round line with a softer, lighter rim. Highlighter: a flat-ended (chisel)
 * line that multiplies with what is under it, so text stays readable. Glow
 * pen: a bright core with a halo of its colour.
 */
function strokePath(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  path: DrawingPath,
) {
  const trace = () => {
    context.beginPath();
    for (const stroke of path.strokes) {
      context.moveTo(...stroke[0]!);
      for (const point of stroke.slice(1)) context.lineTo(...point);
    }
  };
  const line = (width: number, color: string) => {
    context.lineWidth = width;
    context.strokeStyle = color;
    trace();
    context.stroke();
  };
  context.lineCap = brushCap(path.brush);
  context.lineJoin = path.brush === 'highlighter' ? 'miter' : 'round';
  const alpha = context.globalAlpha;
  switch (path.brush) {
    case 'marker':
      context.globalAlpha = alpha * 0.55;
      line(path.width, path.color);
      context.globalAlpha = alpha;
      line(path.width * 0.7, path.color);
      return;
    case 'highlighter':
      context.globalCompositeOperation = 'multiply';
      line(path.width, path.color);
      context.globalCompositeOperation = 'source-over';
      return;
    case 'glow': {
      // shadowBlur is in device pixels: scale it with the current transform.
      const { a, b } = context.getTransform();
      context.shadowColor = path.color;
      context.shadowBlur = path.width * 1.5 * Math.hypot(a, b);
      line(path.width, path.color);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.globalAlpha = alpha * 0.85;
      line(path.width * 0.4, '#ffffff');
      context.globalAlpha = alpha;
      return;
    }
    default:
      line(path.width, path.color);
  }
}

/** H3: the crop frame: a dark veil is not needed (the source is dimmed);
 *  an outline, thirds and corner marks. Points are canvas CSS px. */
function drawCropOverlay(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pixels: AffineMatrix,
  crop: NonNullable<RenderSource['crop']>,
) {
  const [a, b, c, d] = crop.frame as [Point2, Point2, Point2, Point2];
  const lerp = (p: Point2, q: Point2, t: number): Point2 => [
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
  ];
  context.setTransform(...pixels);
  context.globalAlpha = 1;
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  context.beginPath();
  for (const t of [1 / 3, 2 / 3]) {
    context.moveTo(...lerp(a, b, t));
    context.lineTo(...lerp(d, c, t));
    context.moveTo(...lerp(a, d, t));
    context.lineTo(...lerp(b, c, t));
  }
  context.stroke();
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(...a);
  for (const point of [b, c, d]) context.lineTo(...point);
  context.closePath();
  context.stroke();
  // Corner marks: short thick L shapes along both sides of each corner.
  context.lineWidth = 4;
  context.lineCap = 'round';
  const corners: [Point2, Point2, Point2][] = [
    [a, b, d],
    [b, c, a],
    [c, d, b],
    [d, a, c],
  ];
  context.beginPath();
  for (const [corner, next, previous] of corners) {
    const along = (to: Point2) => {
      const length = Math.hypot(to[0] - corner[0], to[1] - corner[1]) || 1;
      const k = Math.min(14, length / 3) / length;
      return [
        corner[0] + (to[0] - corner[0]) * k,
        corner[1] + (to[1] - corner[1]) * k,
      ] as Point2;
    };
    context.moveTo(...along(next));
    context.lineTo(...corner);
    context.lineTo(...along(previous));
  }
  context.stroke();
  context.lineCap = 'butt';
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
  const drawItems = (fade: number, only?: (item: RenderItem) => boolean) => {
    for (const item of items) {
      if (only && !only(item)) continue;
      context.save();
      try {
        context.setTransform(...multiplyMatrices(view, item.matrix));
        context.globalAlpha = item.opacity * fade;
        // W5-C Wipe: only the revealed part of the box is drawn.
        if (item.reveal !== undefined) {
          context.beginPath();
          const shown = item.size.width * item.reveal;
          context.rect(
            item.revealFrom === 'right' ? item.size.width - shown : 0,
            0,
            shown,
            item.size.height,
          );
          context.clip();
        }
        // W4-B: decoded media replaces the placeholder once its frame is ready.
        const frame = item.media
          ? source.frames?.frame(item.media, source.playing ?? false)
          : null;
        // I1.7: deleted or missing media draws a clear hatched placeholder.
        if (item.missing) {
          drawMissing(
            context,
            item.size.width,
            item.size.height,
            source.missingLabel ?? 'Missing media',
          );
          continue;
        }
        // H3: cropping shows the whole source dimmed and the kept part bright.
        if (item.cropView) {
          const { source: full, frame: kept } = item.cropView;
          const paint = (alpha: number) => {
            context.globalAlpha = item.opacity * fade * alpha;
            if (frame)
              context.drawImage(frame, full.x, full.y, full.width, full.height);
            else {
              context.fillStyle = item.fill;
              context.fillRect(full.x, full.y, full.width, full.height);
            }
          };
          paint(0.35);
          context.beginPath();
          context.rect(kept.x, kept.y, kept.width, kept.height);
          context.clip();
          paint(1);
          continue;
        }
        if (frame) {
          if (item.picture)
            drawPicture(
              context,
              item.picture,
              frame,
              item.size.width,
              item.size.height,
              item.fill,
            );
          else
            context.drawImage(frame, 0, 0, item.size.width, item.size.height);
          continue;
        }
        // H3: a placeholder with rounded corners or a border keeps them.
        if (item.picture && (item.picture.radius > 0 || item.picture.border)) {
          drawPicture(
            context,
            item.picture,
            null,
            item.size.width,
            item.size.height,
            item.fill,
          );
          continue;
        }
        // SHP-019: a drawing strokes its path; it has no box fill or clip.
        if (item.path) {
          strokePath(context, item.path);
          continue;
        }
        // W5-D: shapes draw their own fill and stroke, unclipped.
        if (item.shape) {
          drawShape(context, item.shape, item.size.width, item.size.height);
          continue;
        }
        context.fillStyle = item.fill;
        if (item.kind !== 'text')
          context.fillRect(0, 0, item.size.width, item.size.height);
        context.beginPath();
        context.rect(0, 0, item.size.width, item.size.height);
        context.clip();
        // J4: text being edited is drawn by the editor over the canvas.
        if (item.editing) {
          // Nothing: the box stays for its outline and handles.
        } else if (item.kind === 'text' && item.richLayout) {
          drawRich(
            context,
            item.richLayout,
            item.textStyle ?? DEFAULT_TEXT_STYLE,
            item.size.width,
            item.size.height,
          );
        } else if (item.kind === 'text' && item.textLayout) {
          drawText(context, item);
        } else if (item.kind !== 'rectangle') {
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
  };
  // G3: in the editor (not export), what lies outside the composition shows
  // faintly, so it can be seen and selected; the artboard then covers it.
  if (options.overlays !== false && !source.playing) {
    context.save();
    try {
      context.setTransform(...view);
      const { width, height } = source.composition;
      drawItems(OUTSIDE_FADE, (item) =>
        boundsCorners({ x: 0, y: 0, ...item.size }).some((corner) => {
          const [x, y] = transformPoint(item.matrix, corner);
          return x < 0 || y < 0 || x > width || y > height;
        }),
      );
    } finally {
      context.restore();
    }
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
    drawItems(1);
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
  // H3: overlays (editor only). Colours are fixed, not themed: they sit on
  // project content, which is never themed.
  const ACCENT = '#8b6cff';
  const OUTLINE = '#b7a2ff';
  const outline = (
    corners: readonly Point2[],
    width: number,
    color: string,
  ) => {
    context.setTransform(...pixels);
    context.globalAlpha = 1;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(...corners[0]!);
    corners.slice(1).forEach((point) => context.lineTo(...point));
    context.closePath();
    context.stroke();
  };
  // Hovering the empty artboard outlines the page.
  if (source.hoverArtboard && !source.cropLayerId) {
    const { width, height } = source.composition;
    outline(
      (
        [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ] as Point2[]
      ).map((point) => transformPoint(viewport.matrix, point)),
      1.5,
      ACCENT,
    );
  }
  // Hovering an unselected object outlines it (1.5 px accent).
  if (
    source.hoverId &&
    !source.cropLayerId &&
    !(source.selectedIds ?? []).includes(source.hoverId)
  ) {
    const box = selectionGeometry(source, source.hoverId, viewport.matrix);
    if (box) outline(box.corners, 1.5, ACCENT);
  }
  for (const id of [
    ...(source.selectedIds ?? []),
    ...(source.highlightIds ?? []),
  ]) {
    if (id === selectedId) continue;
    const box = selectionGeometry(source, id, viewport.matrix);
    if (box) outline(box.corners, 1.5, OUTLINE);
  }
  const shadowed = (draw: () => void) => {
    context.save();
    context.shadowColor = 'rgba(16, 18, 27, 0.35)';
    context.shadowBlur = 4 * viewport.pixelRatio;
    context.shadowOffsetY = 1 * viewport.pixelRatio;
    draw();
    context.restore();
  };
  const drawHandles = (handles: readonly SelectionHandle[]) => {
    for (const handle of handles) {
      const [x, y] = handle.point;
      const hovered = source.hoveredHandle === handle.id;
      context.strokeStyle = hovered ? ACCENT : '#c9ccd6';
      context.lineWidth = 1;
      context.fillStyle = hovered ? OUTLINE : '#ffffff';
      if (handle.kind === 'rotate') {
        // A round button with a turning arrow.
        context.setTransform(...pixels);
        shadowed(() => {
          context.beginPath();
          context.arc(x, y, 10, 0, Math.PI * 2);
          context.fill();
        });
        context.beginPath();
        context.arc(x, y, 10, 0, Math.PI * 2);
        context.stroke();
        context.strokeStyle = '#302548';
        context.lineWidth = 1.5;
        context.lineCap = 'round';
        context.beginPath();
        context.arc(x, y, 4.5, -Math.PI * 0.2, Math.PI * 1.35);
        context.stroke();
        const tip: Point2 = [
          x + 4.5 * Math.cos(-Math.PI * 0.2),
          y + 4.5 * Math.sin(-Math.PI * 0.2),
        ];
        context.beginPath();
        context.moveTo(tip[0] - 3, tip[1] - 1);
        context.lineTo(tip[0], tip[1]);
        context.lineTo(tip[0] + 0.5, tip[1] - 3.2);
        context.stroke();
        context.lineCap = 'butt';
      } else if (handle.kind === 'corner') {
        // White circles at the corners.
        context.setTransform(...pixels);
        shadowed(() => {
          context.beginPath();
          context.arc(x, y, 6, 0, Math.PI * 2);
          context.fill();
        });
        context.beginPath();
        context.arc(x, y, 6, 0, Math.PI * 2);
        context.stroke();
      } else {
        // Pills along the edges (and the text width grips), turning with
        // the box.
        const along = handle.kind === 'text-width' ? 6 : 16;
        const across = 6;
        context.setTransform(...multiplyMatrices(pixels, handle.matrix));
        const vertical =
          handle.id === 'left' ||
          handle.id === 'right' ||
          handle.kind === 'text-width';
        const w = vertical ? across : along,
          h = vertical ? (handle.kind === 'text-width' ? 16 : along) : across;
        shadowed(() => {
          context.beginPath();
          context.roundRect(-w / 2, -h / 2, w, h, 3);
          context.fill();
        });
        context.beginPath();
        context.roundRect(-w / 2, -h / 2, w, h, 3);
        context.stroke();
      }
    }
  };
  const multi = (source.selectedIds?.length ?? 1) > 1;
  const geometry = source.cropLayerId
    ? null
    : selectionGeometry(source, selectedId, viewport.matrix);
  if (geometry) {
    outline(geometry.corners, 1.5, OUTLINE);
    if (!multi && geometry.handles.some((handle) => handle.id === 'rotate')) {
      context.strokeStyle = OUTLINE;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(...geometry.stem);
      context.lineTo(...geometry.rotation);
      context.stroke();
    }
    if (!multi) drawHandles(geometry.handles);
  }
  // CV-040/CV-041: one dashed box around the whole multi-selection, with its
  // own corner, edge and rotate handles.
  const outer = source.cropLayerId
    ? null
    : multiSelectionGeometry(source, viewport.matrix);
  if (outer) {
    context.setTransform(...pixels);
    context.globalAlpha = 1;
    context.strokeStyle = ACCENT;
    context.lineWidth = 1.5;
    context.setLineDash([6, 4]);
    context.beginPath();
    context.moveTo(...outer.corners[0]!);
    outer.corners.slice(1).forEach((point) => context.lineTo(...point));
    context.closePath();
    context.stroke();
    context.setLineDash([]);
    if (outer.handles.some((handle) => handle.id === 'rotate')) {
      context.beginPath();
      context.moveTo(...outer.stem);
      context.lineTo(...outer.rotation);
      context.stroke();
    }
    drawHandles(outer.handles);
  }
  if (source.cropLayerId && source.crop)
    drawCropOverlay(context, pixels, source.crop);
  return { warnings: errors, zoom: viewport.matrix[0] };
}

/** I1.7: a hatched box with a label, for a layer whose media is missing. */
function drawMissing(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  label: string,
) {
  context.save();
  try {
    context.fillStyle = '#3b3f4a';
    context.fillRect(0, 0, width, height);
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
    context.strokeStyle = '#555a66';
    context.lineWidth = Math.max(2, Math.min(width, height) / 60);
    const step = Math.max(16, Math.min(width, height) / 8);
    for (let x = -height; x < width; x += step) {
      context.beginPath();
      context.moveTo(x, height);
      context.lineTo(x + height, 0);
      context.stroke();
    }
    const size = Math.max(12, Math.min(height / 8, width / 10));
    context.font = `600 ${size}px Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const textWidth = context.measureText(label).width;
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(
      width / 2 - textWidth / 2 - size / 2,
      height / 2 - size,
      textWidth + size,
      size * 2,
    );
    context.fillStyle = '#ffffff';
    context.fillText(label, width / 2, height / 2);
  } finally {
    context.restore();
  }
}
