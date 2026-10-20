// H3: how a picture or video layer is framed. Stored as ordinary layer
// properties (schema unchanged, read defensively like shapes, D-081):
// - cropX, cropY, cropW, cropH: the part of the source shown, as fractions of
//   the source (0 to 1); missing means the whole source;
// - cornerRadius: rounded corners in layer units;
// - stroke, strokeWidth, strokeDash: a border drawn inside the box.
// The preview and the export worker draw through drawPicture, so they match.
import type { SceneLayer } from './adapter';
import { STROKE_DASHES, type StrokeDash } from './shapes';

export interface Crop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface PictureStyle {
  readonly crop: Crop | null;
  readonly radius: number;
  readonly border: {
    readonly color: string;
    readonly width: number;
    readonly dash: StrokeDash;
  } | null;
  /** FIX1 F2: a one-colour recolour of an icon (its ink becomes this colour). */
  readonly tint?: string | null;
}
export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };
const COLOR = /^#[0-9a-fA-F]{6}$/;
export const MAX_BORDER = 200;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export function cropOf(layer: SceneLayer): Crop | null {
  const p = layer.properties;
  const read = (key: string) =>
    p[key]?.type === 'number' && Number.isFinite(p[key]!.value)
      ? (p[key]!.value as number)
      : undefined;
  const x = read('cropX'),
    y = read('cropY'),
    width = read('cropW'),
    height = read('cropH');
  if (
    x === undefined &&
    y === undefined &&
    width === undefined &&
    height === undefined
  )
    return null;
  const crop = {
    x: clamp01(x ?? 0),
    y: clamp01(y ?? 0),
    width: clamp01(width ?? 1),
    height: clamp01(height ?? 1),
  };
  if (crop.width <= 0.001 || crop.height <= 0.001) return null;
  // Never past the source's far edge.
  return {
    ...crop,
    width: Math.min(crop.width, 1 - crop.x),
    height: Math.min(crop.height, 1 - crop.y),
  };
}
export function pictureOf(layer: SceneLayer): PictureStyle | null {
  if (layer.type !== 'image' && layer.type !== 'video') return null;
  const p = layer.properties;
  const numeric = (key: string) =>
    p[key]?.type === 'number' && Number.isFinite(p[key]!.value)
      ? (p[key]!.value as number)
      : 0;
  const color = p.stroke?.type === 'color' ? p.stroke.value.slice(0, 7) : '';
  const width = Math.min(MAX_BORDER, Math.max(0, numeric('strokeWidth')));
  const dash = p.strokeDash?.type === 'string' ? p.strokeDash.value : 'solid';
  const tint =
    layer.type === 'image' && p.tint?.type === 'color'
      ? p.tint.value.slice(0, 7)
      : '';
  return {
    ...(COLOR.test(tint) ? { tint } : {}),
    crop: cropOf(layer),
    radius: Math.max(0, numeric('cornerRadius')),
    border:
      width > 0 && COLOR.test(color)
        ? {
            color,
            width,
            dash: (STROKE_DASHES as readonly string[]).includes(dash)
              ? (dash as StrokeDash)
              : 'solid',
          }
        : null,
  };
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** A rounded rectangle path (radius clamped to half the shorter side). */
export function roundedRect(
  context: Context,
  width: number,
  height: number,
  radius: number,
  inset = 0,
) {
  const r = Math.max(
    0,
    Math.min(radius - inset, (Math.min(width, height) - 2 * inset) / 2),
  );
  context.beginPath();
  if (r <= 0) {
    context.rect(inset, inset, width - 2 * inset, height - 2 * inset);
    return;
  }
  context.roundRect(inset, inset, width - 2 * inset, height - 2 * inset, r);
}
const sourceSize = (frame: CanvasImageSource) => {
  const source = frame as {
    videoWidth?: number;
    videoHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number | { baseVal: { value: number } };
    height?: number | { baseVal: { value: number } };
  };
  const plain = (value: unknown) =>
    typeof value === 'number' ? value : undefined;
  const width =
    source.videoWidth ||
    source.displayWidth ||
    source.naturalWidth ||
    plain(source.width) ||
    0;
  const height =
    source.videoHeight ||
    source.displayHeight ||
    source.naturalHeight ||
    plain(source.height) ||
    0;
  return { width, height };
};

/** The last tinted bitmap per source (one icon redraws every frame). */
const tints = new WeakMap<object, { key: string; canvas: OffscreenCanvas }>();
/**
 * FIX1 F2: the picture's ink recoloured: drawn at the size it shows on
 * screen, then every opaque pixel takes the tint (source-in). Icons are one
 * colour, so this is the same as replacing their currentColor fill.
 */
function tinted(
  context: Context,
  frame: CanvasImageSource,
  style: PictureStyle,
  width: number,
  height: number,
): OffscreenCanvas {
  const m = context.getTransform();
  const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d), 1);
  const w = Math.max(1, Math.min(4096, Math.ceil(width * scale)));
  const h = Math.max(1, Math.min(4096, Math.ceil(height * scale)));
  const crop = style.crop ?? FULL_CROP;
  const key = `${style.tint}|${w}|${h}|${crop.x},${crop.y},${crop.width},${crop.height}`;
  const cached = tints.get(frame as object);
  if (cached?.key === key) return cached.canvas;
  const canvas = new OffscreenCanvas(w, h);
  const c = canvas.getContext('2d')!;
  const size = sourceSize(frame);
  if (size.width > 0 && size.height > 0)
    c.drawImage(
      frame,
      crop.x * size.width,
      crop.y * size.height,
      crop.width * size.width,
      crop.height * size.height,
      0,
      0,
      w,
      h,
    );
  else c.drawImage(frame, 0, 0, w, h);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = style.tint!;
  c.fillRect(0, 0, w, h);
  tints.set(frame as object, { key, canvas });
  return canvas;
}

/**
 * Draws a picture (or its placeholder fill when there is no frame yet) into
 * a width × height box, clipped to rounded corners, with its crop and border.
 */
export function drawPicture(
  context: Context,
  style: PictureStyle,
  frame: CanvasImageSource | null,
  width: number,
  height: number,
  placeholder: string,
) {
  context.save();
  try {
    if (style.radius > 0) {
      roundedRect(context, width, height, style.radius);
      context.clip();
    }
    if (frame && style.tint) {
      context.drawImage(
        tinted(context, frame, style, width, height),
        0,
        0,
        width,
        height,
      );
    } else if (frame) {
      const crop = style.crop ?? FULL_CROP;
      const size = sourceSize(frame);
      if (size.width > 0 && size.height > 0 && style.crop)
        context.drawImage(
          frame,
          crop.x * size.width,
          crop.y * size.height,
          crop.width * size.width,
          crop.height * size.height,
          0,
          0,
          width,
          height,
        );
      else context.drawImage(frame, 0, 0, width, height);
    } else {
      context.fillStyle = placeholder;
      context.fillRect(0, 0, width, height);
    }
    if (style.border) {
      const { color, width: line, dash } = style.border;
      context.strokeStyle = color;
      context.lineWidth = line;
      context.setLineDash(
        dash === 'dash'
          ? [line * 3, line * 2]
          : dash === 'dot'
            ? [0, line * 2]
            : [],
      );
      context.lineCap = dash === 'dot' ? 'round' : 'butt';
      roundedRect(context, width, height, style.radius, line / 2);
      context.stroke();
      context.setLineDash([]);
    }
  } finally {
    context.restore();
  }
}
