// FINAL3 C3: what the camera adds to the picture and to the editor view:
// its background image (Blender's camera background: a reference on the
// camera view, exported only with "Include in render"), the camera-view
// overlays (passepartout, composition guides, safe areas, sensor frame,
// name, limits) and the editable camera frame drawn while editing (the
// shot's start or end framing). Matrices map frame space (the composition
// rectangle as the camera sees it) to device pixels.
import type { AffineMatrix } from '../core';
import type { CameraBackground, CameraSpec, Frame } from '../camera/rig';
import type { CameraState } from '../camera/shots';
import type { MediaFrameRequest } from './adapter';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = readonly [number, number];

/** The background's media request at `time` (null without one). */
export function cameraBackgroundRequest(
  rig: CameraState | null,
  assets: readonly { readonly id: string; readonly type: string }[],
  time: number,
  exporting: boolean,
): MediaFrameRequest | null {
  const bg = rig?.spec.background;
  if (!bg || (exporting && !bg.render)) return null;
  const asset = assets.find((item) => item.id === bg.assetId);
  if (!asset || (asset.type !== 'image' && asset.type !== 'video')) return null;
  return {
    key: `camera-background-${bg.assetId}`,
    assetId: bg.assetId,
    kind: asset.type,
    sourceTime: Math.max(0, time),
    speed: 1,
    reversed: false,
    frozen: false,
  };
}

/** Where the background picture lies in frame space (before rotation). */
export function backgroundRect(
  bg: CameraBackground,
  frame: Frame,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  let w = frame.width,
    h = frame.height;
  if (bg.frame !== 'stretch' && width > 0 && height > 0) {
    const fit = Math.min(frame.width / width, frame.height / height);
    const cover = Math.max(frame.width / width, frame.height / height);
    const k = bg.frame === 'fit' ? fit : cover;
    w = width * k;
    h = height * k;
  }
  w *= bg.scale;
  h *= bg.scale;
  const max = Math.max(frame.width, frame.height);
  return {
    x: frame.width / 2 - w / 2 + bg.offset[0] * max,
    y: frame.height / 2 - h / 2 + bg.offset[1] * max,
    width: w,
    height: h,
  };
}

const sizeOf = (image: CanvasImageSource): [number, number] => {
  const item = image as {
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number | { baseVal?: { value: number } };
    height?: number | { baseVal?: { value: number } };
    displayWidth?: number;
    displayHeight?: number;
  };
  const w =
    item.videoWidth ||
    item.naturalWidth ||
    item.displayWidth ||
    (typeof item.width === 'number' ? item.width : 0);
  const h =
    item.videoHeight ||
    item.naturalHeight ||
    item.displayHeight ||
    (typeof item.height === 'number' ? item.height : 0);
  return [w, h];
};

/** Draws the camera background picture in frame space. */
export function drawCameraBackground(
  context: Context,
  matrix: AffineMatrix,
  bg: CameraBackground,
  frame: Frame,
  image: CanvasImageSource,
): void {
  const [iw, ih] = sizeOf(image);
  const rect = backgroundRect(bg, frame, iw, ih);
  context.save();
  try {
    context.setTransform(...matrix);
    context.beginPath();
    context.rect(0, 0, frame.width, frame.height);
    context.clip();
    const cx = rect.x + rect.width / 2,
      cy = rect.y + rect.height / 2;
    context.translate(cx, cy);
    context.rotate((bg.rotation * Math.PI) / 180);
    context.scale(bg.flipX ? -1 : 1, bg.flipY ? -1 : 1);
    context.globalAlpha = Math.max(0, Math.min(1, bg.alpha));
    context.drawImage(
      image,
      -rect.width / 2,
      -rect.height / 2,
      rect.width,
      rect.height,
    );
  } finally {
    context.restore();
  }
}

/** The composition guides' lines, in frame space (Blender's eight). */
export function guideLines(spec: CameraSpec, frame: Frame): [Point, Point][] {
  const { width: w, height: h } = frame;
  const lines: [Point, Point][] = [];
  const vertical = (x: number) =>
    lines.push([
      [x, 0],
      [x, h],
    ]);
  const horizontal = (y: number) =>
    lines.push([
      [0, y],
      [w, y],
    ]);
  const g = spec.guides;
  if (g.center) {
    vertical(w / 2);
    horizontal(h / 2);
  }
  if (g.centerDiagonal) {
    lines.push([
      [0, 0],
      [w, h],
    ]);
    lines.push([
      [w, 0],
      [0, h],
    ]);
  }
  if (g.thirds)
    for (const f of [1 / 3, 2 / 3]) (vertical(w * f), horizontal(h * f));
  if (g.golden) {
    const phi = (1 + Math.sqrt(5)) / 2;
    for (const f of [1 - 1 / phi, 1 / phi])
      (vertical(w * f), horizontal(h * f));
  }
  /** The foot of the perpendicular from `p` to the line a–b. */
  const foot = (p: Point, a: Point, b: Point): Point => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const u = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    return [a[0] + u * dx, a[1] + u * dy];
  };
  /** From `p` through `q` to the frame's edge. */
  const toEdge = (p: Point, q: Point): Point => {
    const dx = q[0] - p[0],
      dy = q[1] - p[1];
    let t = Infinity;
    for (const [d, from, low, high] of [
      [dx, p[0], 0, w],
      [dy, p[1], 0, h],
    ] as const) {
      if (d > 1e-9) t = Math.min(t, (high - from) / d);
      else if (d < -1e-9) t = Math.min(t, (low - from) / d);
    }
    return Number.isFinite(t) ? [p[0] + dx * t, p[1] + dy * t] : q;
  };
  const triangles = (a: Point, b: Point, others: Point[], extend: boolean) => {
    lines.push([a, b]);
    for (const corner of others) {
      const f = foot(corner, a, b);
      lines.push([corner, extend ? toEdge(corner, f) : f]);
    }
  };
  if (g.goldenTriangleA)
    triangles(
      [0, 0],
      [w, h],
      [
        [w, 0],
        [0, h],
      ],
      false,
    );
  if (g.goldenTriangleB)
    triangles(
      [w, 0],
      [0, h],
      [
        [0, 0],
        [w, h],
      ],
      false,
    );
  if (g.harmoniousTriangleA)
    triangles(
      [0, 0],
      [w, h],
      [
        [w, 0],
        [0, h],
      ],
      true,
    );
  if (g.harmoniousTriangleB)
    triangles(
      [w, 0],
      [0, h],
      [
        [0, 0],
        [w, h],
      ],
      true,
    );
  return lines;
}

/** The safe-area rectangles in frame space (Title, Action, Center-cut). */
export function safeAreaRects(
  spec: CameraSpec,
  frame: Frame,
): { x: number; y: number; width: number; height: number }[] {
  if (!spec.safeAreas.show) return [];
  const { width: w, height: h } = frame;
  const inset = (
    x: number,
    y: number,
    width: number,
    height: number,
    m: readonly [number, number],
  ) => ({
    x: x + width * m[0],
    y: y + height * m[1],
    width: width * (1 - 2 * m[0]),
    height: height * (1 - 2 * m[1]),
  });
  const rects = [
    inset(0, 0, w, h, spec.safeAreas.title),
    inset(0, 0, w, h, spec.safeAreas.action),
  ];
  if (spec.safeAreas.centerCut) {
    // 4:3 in the middle of a wider frame.
    const cw = Math.min(w, (h * 4) / 3),
      cx = (w - cw) / 2;
    rects.push(
      inset(cx, 0, cw, h, spec.safeAreas.centerTitle),
      inset(cx, 0, cw, h, spec.safeAreas.centerAction),
    );
  }
  return rects;
}

/** The camera-view overlays (editor only). */
export function drawCameraViewOverlays(
  context: Context,
  matrix: AffineMatrix,
  rig: CameraState,
  frame: Frame,
  device: { readonly width: number; readonly height: number },
  pixelRatio: number,
): void {
  const spec = rig.spec;
  const scale = Math.hypot(matrix[0], matrix[1]) || 1;
  const line = (spec.display.size * pixelRatio) / scale;
  context.save();
  try {
    if (spec.passepartout.show && spec.passepartout.alpha > 0) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.beginPath();
      context.rect(0, 0, device.width, device.height);
      const corners: Point[] = [
        [0, 0],
        [frame.width, 0],
        [frame.width, frame.height],
        [0, frame.height],
      ].map(([x, y]) => [
        matrix[0] * x! + matrix[2] * y! + matrix[4],
        matrix[1] * x! + matrix[3] * y! + matrix[5],
      ]);
      context.moveTo(...corners[0]!);
      for (const corner of corners.slice(1)) context.lineTo(...corner);
      context.closePath();
      context.globalAlpha = Math.min(1, spec.passepartout.alpha);
      context.fillStyle = '#000000';
      context.fill('evenodd');
    }
    context.setTransform(...matrix);
    context.globalAlpha = 0.75;
    context.strokeStyle = '#ffffff';
    context.lineWidth = line;
    const guides = guideLines(spec, frame);
    if (guides.length) {
      context.beginPath();
      for (const [a, b] of guides) {
        context.moveTo(...a);
        context.lineTo(...b);
      }
      context.stroke();
    }
    const safe = safeAreaRects(spec, frame);
    if (safe.length) {
      context.setLineDash([6 * line, 4 * line]);
      for (const rect of safe)
        context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.setLineDash([]);
    }
    if (spec.display.showSensor) {
      context.lineWidth = line * 2;
      context.strokeRect(0, 0, frame.width, frame.height);
    }
    const labels: string[] = [];
    if (spec.display.showName) labels.push(spec.name);
    if (spec.showLimits)
      labels.push(`${round(spec.clipStart)} – ${round(spec.clipEnd)}`);
    if (labels.length) {
      const size = 13 * line;
      context.font = `600 ${size}px system-ui, sans-serif`;
      context.textBaseline = 'top';
      context.fillStyle = '#ffffff';
      context.shadowColor = 'rgba(0,0,0,0.6)';
      context.shadowBlur = 3 * pixelRatio;
      labels.forEach((text, index) =>
        context.fillText(text, 8 * line, 8 * line + index * size * 1.3),
      );
    }
  } finally {
    context.restore();
  }
}
const round = (value: number) => Math.round(value * 100) / 100;

/** The editable camera frame (composition corners), editor only. */
export interface CameraFrameOverlay {
  readonly corners: readonly [Point, Point, Point, Point];
  readonly label: string;
}
/** The frame's rotate handle, in composition space (above the top side). */
export function frameRotateHandle(
  corners: readonly Point[],
  distance: number,
): Point {
  const [a, b, , d] = corners as [Point, Point, Point, Point];
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const ux = a[0] - d[0],
    uy = a[1] - d[1];
  const length = Math.hypot(ux, uy) || 1;
  return [mid[0] + (ux / length) * distance, mid[1] + (uy / length) * distance];
}
export function drawCameraFrame(
  context: Context,
  pixels: AffineMatrix,
  viewport: AffineMatrix,
  overlay: CameraFrameOverlay,
  device: { readonly width: number; readonly height: number },
): void {
  const toScreen = ([x, y]: Point): Point => [
    viewport[0] * x + viewport[2] * y + viewport[4],
    viewport[1] * x + viewport[3] * y + viewport[5],
  ];
  const ratio = pixels[0];
  const corners = overlay.corners.map(toScreen);
  const zoom = Math.hypot(viewport[0], viewport[1]) || 1;
  context.save();
  try {
    context.setTransform(...pixels);
    // Outside the camera's view is dimmed.
    context.beginPath();
    context.rect(0, 0, device.width / ratio, device.height / ratio);
    context.moveTo(...corners[0]!);
    for (const corner of corners.slice(1)) context.lineTo(...corner);
    context.closePath();
    context.globalAlpha = 0.35;
    context.fillStyle = '#000000';
    context.fill('evenodd');
    context.globalAlpha = 1;
    context.strokeStyle = '#ffb547';
    context.lineWidth = 1.5;
    context.setLineDash([8, 4]);
    context.beginPath();
    context.moveTo(...corners[0]!);
    for (const corner of corners.slice(1)) context.lineTo(...corner);
    context.closePath();
    context.stroke();
    context.setLineDash([]);
    const rotate = toScreen(frameRotateHandle(overlay.corners, 28 / zoom));
    context.beginPath();
    context.moveTo(
      (corners[0]![0] + corners[1]![0]) / 2,
      (corners[0]![1] + corners[1]![1]) / 2,
    );
    context.lineTo(...rotate);
    context.stroke();
    context.fillStyle = '#ffffff';
    for (const point of [...corners, rotate]) {
      context.beginPath();
      context.arc(point[0], point[1], 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.font = '600 12px system-ui, sans-serif';
    context.textBaseline = 'bottom';
    context.fillStyle = '#ffb547';
    context.fillText(overlay.label, corners[0]![0] + 6, corners[0]![1] - 6);
  } finally {
    context.restore();
  }
}
