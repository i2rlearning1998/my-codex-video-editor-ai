// V3: where and how each plan layer is drawn. One layer becomes one or more
// Composition Spec items (text, rectangle and ellipse shapes, media slots)
// plus a `post` record: the properties the spec cannot carry (line, arrow and
// path shapes, strokes, text effects, a soft edge, a loop, a pivot). The
// builder applies `post` through the Command Bus after the spec is built.
// DOM-free and deterministic.
import type { Asset } from '../core';
import type { PlanLayer } from './schema';
import { isKitId, kitItems, type SpecItem } from './kit';
import { getBlock } from '../blocks/starters';
import { validateParams } from '../blocks/params';

export type PlacedRole =
  | 'title'
  | 'body'
  | 'media'
  | 'kit'
  | 'shape'
  | 'block'
  | 'fallback'
  | 'voice'
  | 'narration'
  | 'music'
  | 'sfx';

export interface PostProp {
  readonly key: string;
  readonly type: 'string' | 'number' | 'boolean' | 'color';
  readonly value: string | number | boolean;
}
export interface Post {
  readonly props?: readonly PostProp[];
  /** Soft edge in px (media): which side, and how wide. */
  readonly feather?: {
    readonly px: number;
    readonly edge: 'all' | 'top' | 'bottom' | 'left' | 'right';
    readonly width: number;
    readonly height: number;
  };
  readonly loop?: 'pulse' | 'float' | 'spin' | 'wiggle';
  /** The box's top-left moves from -> to between two video times. */
  readonly move?: {
    readonly from: readonly [number, number];
    readonly to: readonly [number, number];
    readonly start: number;
    readonly end: number;
    readonly easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  };
}
export interface Emitted {
  readonly item: SpecItem;
  readonly role: PlacedRole;
  /** The key written to the layer's `planRef`. */
  readonly key: string;
  readonly enter?: string | undefined;
  readonly exit?: string | undefined;
  readonly flag?: string;
  readonly post?: Post;
}
export interface LayoutEnv {
  readonly width: number;
  readonly height: number;
  readonly palette: { background: string; text: string; accent: string };
  /** The asset found for a media key, if any. */
  assetOf(key: string): Asset | undefined;
  /** A (shared) media slot for an asset; the item points at it. */
  slotFor(asset: Asset, hint: string): string;
}

export const SIZE = { small: 0.3, medium: 0.5, large: 0.75, full: 1 } as const;

/** A box for a layer at its anchor (canvas px, top-left origin). */
export function anchorBox(
  layer: Pick<PlanLayer, 'anchor' | 'size'>,
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number } {
  const marginX = width * 0.06,
    marginY = height * 0.08;
  const left = marginX,
    right = width - marginX - boxWidth,
    midX = (width - boxWidth) / 2;
  const top = marginY,
    bottom = height - marginY - boxHeight,
    midY = (height - boxHeight) / 2;
  if (layer.size === 'full') return { x: midX, y: midY };
  switch (layer.anchor) {
    case 'top':
      return { x: midX, y: top };
    case 'bottom':
      return { x: midX, y: bottom };
    case 'left':
      return { x: left, y: midY };
    case 'right':
      return { x: right, y: midY };
    case 'top-left':
      return { x: left, y: top };
    case 'top-right':
      return { x: right, y: top };
    case 'bottom-left':
      return { x: left, y: bottom };
    case 'bottom-right':
      return { x: right, y: bottom };
    case 'lower-third':
      return { x: left, y: height * 0.72 };
    default:
      return { x: midX, y: midY };
  }
}

type Layer = Pick<
  PlanLayer,
  'anchor' | 'size' | 'at' | 'width' | 'height' | 'rotation' | 'opacity'
>;
/** The top-left of a box: at the layer's `at` centre, else by its anchor. */
function place(
  layer: Layer,
  env: LayoutEnv,
  w: number,
  h: number,
): { x: number; y: number } {
  if (layer.at)
    return {
      x: (layer.at.x / 100) * env.width - w / 2,
      y: (layer.at.y / 100) * env.height - h / 2,
    };
  return anchorBox(layer, env.width, env.height, w, h);
}
/**
 * A layer turns about its top-left corner, so a rotated box is placed where
 * its centre stays put: the top-left is the centre minus the turned half-box.
 */
export function turnedBox(
  x: number,
  y: number,
  w: number,
  h: number,
  degrees: number,
): { x: number; y: number } {
  const a = (degrees * Math.PI) / 180;
  const hx = w / 2,
    hy = h / 2;
  return {
    x: x + hx - (hx * Math.cos(a) - hy * Math.sin(a)),
    y: y + hy - (hx * Math.sin(a) + hy * Math.cos(a)),
  };
}
/** Spec transform with the layer's opacity and rotation. */
const transformOf = (layer: Layer, x: number, y: number, w = 0, h = 0) => {
  const turn = layer.rotation
    ? turnedBox(x, y, w, h, layer.rotation)
    : { x, y };
  return {
    x: rounded(turn.x),
    y: rounded(turn.y),
    ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}),
    ...(layer.rotation ? { rotation: layer.rotation } : {}),
  };
};

const ease = (kind: string, p: number) =>
  kind === 'ease-in'
    ? p * p
    : kind === 'ease-out'
      ? 1 - (1 - p) * (1 - p)
      : kind === 'ease-in-out'
        ? p * p * (3 - 2 * p)
        : p;
/**
 * A layer's `move` as the box's position at the start and end of one item
 * (a pose shows only part of the layer's time, so it starts part-way).
 */
function movement(
  layer: PlanLayer,
  env: LayoutEnv,
  when: { start: number; duration: number },
  segment: { start: number; end: number },
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number; move?: NonNullable<Post['move']> } {
  const move = layer.move;
  if (!move) return { x, y };
  const dx = (move.to.x / 100) * env.width - (x + w / 2),
    dy = (move.to.y / 100) * env.height - (y + h / 2);
  const ms = when.start + (move.start ?? 0),
    me = Math.min(
      when.start + when.duration,
      ms + (move.duration ?? when.duration - (move.start ?? 0)),
    );
  const at = (time: number) => {
    const p = Math.min(1, Math.max(0, (time - ms) / Math.max(0.05, me - ms)));
    return ease(move.easing, p);
  };
  const whole = segment.start <= ms + 1e-6 && segment.end >= me - 1e-6;
  const p0 = at(segment.start),
    p1 = at(segment.end);
  if (p0 === p1) return { x: x + dx * p0, y: y + dy * p0 };
  return {
    x: x + dx * p0,
    y: y + dy * p0,
    move: {
      from: [x + dx * p0, y + dy * p0],
      to: [x + dx * p1, y + dy * p1],
      start: Math.max(segment.start, ms),
      end: Math.min(segment.end, me),
      easing: whole ? move.easing : 'linear',
    },
  };
}

interface Timing {
  start: number;
  duration: number;
}

const prop = (
  key: string,
  type: PostProp['type'],
  value: PostProp['value'],
): PostProp => ({ key, type, value });
const ring = (points: [number, number][]) => points;
const rounded = (n: number) => Math.round(n * 100) / 100;

/** One layer as spec items and post-properties. */
export function layoutLayer(
  layer: PlanLayer,
  key: string,
  prefix: string,
  when: Timing,
  env: LayoutEnv,
): Emitted[] {
  const { width, height, palette } = env;
  const short = Math.min(width, height);
  const px = (value: number) => (value * short) / 1080;
  const out: Emitted[] = [];
  const emit = (e: Emitted) => out.push(e);

  if (layer.kind === 'media') {
    const poses = [...(layer.poses ?? [])].sort((a, b) => a.start - b.start);
    // The base picture shows until the first pose; each pose until the next.
    const segments: { key: string; start: number; end: number }[] = [];
    const end = when.start + when.duration;
    const firstPose = poses[0] ? when.start + poses[0].start : end;
    if (!poses.length || firstPose > when.start + 1e-6)
      segments.push({
        key,
        start: when.start,
        end: Math.min(end, firstPose),
      });
    poses.forEach((pose, n) => {
      const start = when.start + pose.start;
      const next = poses[n + 1] ? when.start + poses[n + 1]!.start : end;
      if (start < end - 1e-6)
        segments.push({ key: `${key}#p${n}`, start, end: Math.min(end, next) });
    });
    segments.forEach((segment, n) =>
      emitMedia(
        layer,
        when,
        { ...segment, first: n === 0, last: n === segments.length - 1 },

        `${prefix}${n ? `p${n}` : 'm'}`,
        env,
        emit,
      ),
    );
    return out;
  }

  if (layer.kind === 'kit') {
    const built =
      layer.kit && isKitId(layer.kit)
        ? kitItems(layer.kit, {
            width,
            height,
            palette,
            text: layer.text ?? '',
            ...when,
            idPrefix: `${prefix}k`,
          })
        : null;
    built?.forEach((item, n) =>
      emit({
        item,
        role: 'kit',
        key: n ? `${key}#${n}` : key,
        enter: layer.enter,
        exit: layer.exit,
      }),
    );
    return out;
  }

  if (layer.kind === 'block') {
    const info = layer.block ? getBlock(layer.block) : undefined;
    if (!info) return out;
    // A block draws on a canvas-sized transparent frame; its own settings
    // say where things go. The layer only decides when it shows.
    emit({
      item: {
        id: `${prefix}b`,
        name: `${info.name} ${layer.id}`.slice(0, 100),
        ...when,
        kind: 'code-block',
        blockId: info.id,
        blockVersion: info.version,
        params: { ...validateParams(info.params, layer.params ?? {}) },
        seed: 1,
        transform: {
          x: 0,
          y: 0,
          ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}),
        },
      },
      role: 'block',
      key,
      enter: layer.enter,
      exit: layer.exit,
    });
    return out;
  }
  if (layer.kind === 'shape') return layoutShape(layer, key, prefix, when, env);
  if (layer.kind === 'bubble')
    return layoutBubble(layer, key, prefix, when, env);

  // Title and text.
  const title = layer.kind === 'title';
  const size = Math.round(
    layer.fontSize !== undefined
      ? px(layer.fontSize)
      : short *
          (title ? 0.08 : 0.045) *
          (layer.size === 'large' ? 1.3 : layer.size === 'small' ? 0.75 : 1),
  );
  const w =
    layer.width !== undefined
      ? (layer.width / 100) * width
      : width *
        Math.min(
          0.88,
          SIZE[layer.size === 'full' ? 'large' : layer.size] + 0.3,
        );
  const lineCount = Math.max(
    1,
    Math.ceil(((layer.text ?? '').length * size * 0.55) / w),
  );
  const h = size * 1.25 * lineCount;
  const spot = place(layer, env, w, h);
  const at = movement(
    layer,
    env,
    when,
    { start: when.start, end: when.start + when.duration },
    spot.x,
    spot.y,
    w,
    h,
  );
  const props: PostProp[] = [];
  if (layer.weight) props.push(prop('fontWeight', 'number', layer.weight));
  if (layer.highlight)
    props.push(
      prop(
        'textEffect',
        'string',
        JSON.stringify({
          type: 'background',
          color: layer.highlight,
          roundness: 40,
          spread: 45,
          intensity: 50,
          transparency: 0,
        }),
      ),
    );
  else if (layer.outline)
    props.push(
      prop(
        'textEffect',
        'string',
        JSON.stringify({
          type: 'outline',
          color: layer.outline,
          intensity: 45,
        }),
      ),
    );
  emit({
    item: {
      id: `${prefix}x`,
      name: (layer.text ?? layer.id).slice(0, 100),
      kind: 'text',
      text: (layer.text ?? '').slice(0, 1000) || ' ',
      fontSize: size,
      fill: layer.color ?? palette.text,
      ...when,
      transform: transformOf(layer, at.x, at.y, w, h),
      width: w,
      height: h,
    },
    role: title ? 'title' : 'body',
    key,
    enter: layer.enter,
    exit: layer.exit,
    post: {
      props,
      ...(layer.loop ? { loop: layer.loop } : {}),
      ...(at.move ? { move: at.move } : {}),
    },
  });
  return out;
}

function emitMedia(
  layer: PlanLayer,
  layerWhen: Timing,
  segment: {
    key: string;
    start: number;
    end: number;
    first?: boolean;
    last?: boolean;
  },
  idBase: string,
  env: LayoutEnv,
  emit: (e: Emitted) => void,
) {
  const { width, height, palette } = env;
  const short = Math.min(width, height);
  const asset = env.assetOf(segment.key);
  const icon =
    layer.mediaIntent?.type === 'icon' || layer.mediaIntent?.type === 'emoji';
  const aspect =
    asset?.width && asset.height ? asset.width / asset.height : 16 / 9;
  const frac = SIZE[layer.size];
  let w =
    layer.size === 'full' && layer.width === undefined
      ? width
      : layer.width !== undefined
        ? (layer.width / 100) * width
        : width * frac * (icon ? 0.6 : 1);
  let h =
    layer.height !== undefined ? (layer.height / 100) * height : w / aspect;
  if (layer.size === 'full' && layer.width === undefined) {
    // Cover the canvas.
    const k = Math.max(width / w, height / h);
    w *= k;
    h *= k;
  } else if (layer.height === undefined && h > height * 0.9) {
    h = height * 0.9;
    w = h * aspect;
  }
  const spot = place(layer, env, w, h);
  const when = {
    start: segment.start,
    duration: Math.max(0.2, segment.end - segment.start),
  };
  const at = movement(layer, env, layerWhen, segment, spot.x, spot.y, w, h);
  const name = (layer.mediaIntent?.query ?? 'media').slice(0, 100);
  if (asset) {
    // A video plays once: its clip ends with the video.
    if (asset.type === 'video' && asset.duration && asset.duration > 0.2)
      when.duration = Math.min(when.duration, asset.duration);
    emit({
      item: {
        id: idBase,
        name,
        kind: 'media-slot',
        slot: env.slotFor(asset, name),
        ...when,
        transform: transformOf(layer, at.x, at.y, w, h),
        width: w,
        height: h,
      },
      role: 'media',
      key: segment.key,
      // Poses cut straight into each other: only the first picture fades in
      // and only the last fades out.
      enter: segment.first === false ? 'none' : layer.enter,
      exit: segment.last === false ? 'none' : layer.exit,
      post: {
        ...(layer.feather
          ? {
              feather: {
                px: layer.feather * (short / 1080),
                edge: layer.featherEdge ?? 'all',
                width: w,
                height: h,
              },
            }
          : {}),
        ...(layer.loop ? { loop: layer.loop } : {}),
        ...(at.move ? { move: at.move } : {}),
      },
    });
    return;
  }
  // Fallback card: a soft panel naming what is needed.
  emit({
    item: {
      id: `${idBase}f`,
      name: `Needs: ${name}`.slice(0, 100),
      kind: 'shape',
      shape: 'rectangle',
      fill: palette.accent,
      ...when,
      transform: { x: at.x, y: at.y, opacity: 0.35 },
      width: w,
      height: h,
    },
    role: 'fallback',
    key: segment.key,
    enter: layer.enter,
    exit: layer.exit,
    flag: 'needs-asset',
  });
  emit({
    item: {
      id: `${idBase}t`,
      name: 'Needs asset',
      kind: 'text',
      text: `Needs: ${name}`.slice(0, 1000),
      fontSize: Math.round(short * 0.035),
      fill: palette.text,
      ...when,
      transform: { x: at.x + w * 0.05, y: at.y + h / 2 - short * 0.03 },
      width: w * 0.9,
      height: short * 0.06,
    },
    role: 'fallback',
    key: `${segment.key}#label`,
    flag: 'needs-asset',
  });
}

/** An annular sector (an arc with thickness) as a polygon ring. */
function sector(
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  from: number,
  to: number,
): [number, number][] {
  const inner = Math.max(0.5, radius - thickness / 2),
    outer = radius + thickness / 2;
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 3));
  const at = (r: number, a: number): [number, number] => [
    cx + r * Math.cos((a * Math.PI) / 180),
    cy + r * Math.sin((a * Math.PI) / 180),
  ];
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++)
    points.push(at(outer, from + ((to - from) * i) / steps));
  for (let i = steps; i >= 0; i--)
    points.push(at(inner, from + ((to - from) * i) / steps));
  return ring(points);
}
/** A thin quad from a to b of a given thickness. */
function quad(
  a: [number, number],
  b: [number, number],
  thickness: number,
): [number, number][] {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * (thickness / 2),
    ny = (dx / length) * (thickness / 2);
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}
/** Polygons as a path layer: the box that holds them, and the JSON. */
function pathBox(polygons: [number, number][][]) {
  const xs = polygons.flat().map((p) => p[0]),
    ys = polygons.flat().map((p) => p[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - x),
    h = Math.max(1, Math.max(...ys) - y);
  const local = polygons.map((poly) => [
    poly.map(([px, py]) => [rounded(px - x), rounded(py - y)]),
  ]);
  return { x, y, w, h, json: JSON.stringify(local) };
}

function layoutShape(
  layer: PlanLayer,
  key: string,
  prefix: string,
  when: Timing,
  env: LayoutEnv,
): Emitted[] {
  const { width, height, palette } = env;
  const short = Math.min(width, height);
  const px = (value: number) => (value * short) / 1080;
  const out: Emitted[] = [];
  const stroke = layer.stroke ?? layer.color ?? palette.accent;
  const sw = px(layer.strokeWidth ?? 8);
  const base = {
    name: `${layer.shape ?? 'shape'} ${layer.id}`.slice(0, 100),
    ...when,
  };
  const common = { enter: layer.enter, exit: layer.exit } as const;

  if (layer.shape === 'rectangle' || layer.shape === 'ellipse') {
    const w = ((layer.width ?? 30) / 100) * width;
    const h =
      layer.height !== undefined
        ? (layer.height / 100) * height
        : layer.shape === 'ellipse'
          ? w
          : w * 0.5;
    const spot = place(layer, env, w, h);
    const at = movement(
      layer,
      env,
      when,
      { start: when.start, end: when.start + when.duration },
      spot.x,
      spot.y,
      w,
      h,
    );
    const props: PostProp[] = [];
    if (layer.stroke)
      props.push(
        prop('stroke', 'color', layer.stroke),
        prop('strokeWidth', 'number', sw),
        prop('strokeDash', 'string', layer.dash ?? 'solid'),
      );
    // A stroke without a colour is an outline: no fill.
    if (layer.stroke && !layer.color)
      props.push(prop('fillEnabled', 'boolean', false));
    if (layer.shape === 'rectangle')
      props.push(prop('cornerRadius', 'number', Math.round(px(16))));
    out.push({
      item: {
        id: `${prefix}s`,
        ...base,
        kind: 'shape',
        shape: layer.shape,
        fill: layer.color ?? palette.accent,
        transform: transformOf(layer, at.x, at.y, w, h),
        width: w,
        height: h,
      },
      role: 'shape',
      key,
      ...common,
      post: {
        ...(layer.feather
          ? {
              feather: {
                px: layer.feather * (short / 1080),
                edge: layer.featherEdge ?? 'all',
                width: w,
                height: h,
              },
            }
          : {}),
        props,
        ...(layer.loop ? { loop: layer.loop } : {}),
        ...(at.move ? { move: at.move } : {}),
      },
    });
    return out;
  }

  if (layer.shape === 'line' || layer.shape === 'arrow') {
    const x1 = (layer.from!.x / 100) * width,
      y1 = (layer.from!.y / 100) * height,
      x2 = (layer.to!.x / 100) * width,
      y2 = (layer.to!.y / 100) * height;
    const length = Math.max(2, Math.hypot(x2 - x1, y2 - y1));
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const head = layer.shape === 'arrow' ? Math.max(12, sw * 3) : 0;
    const boxH = Math.max(sw, head, 2);
    const cx = (x1 + x2) / 2,
      cy = (y1 + y2) / 2;
    out.push({
      item: {
        id: `${prefix}s`,
        ...base,
        kind: 'shape',
        shape: 'rectangle',
        fill: stroke,
        transform: {
          ...turnedBox(cx - length / 2, cy - boxH / 2, length, boxH, angle),
          rotation: rounded(angle),
          ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}),
        },
        width: length,
        height: boxH,
      },
      role: 'shape',
      key,
      ...common,
      post: {
        props: [
          prop('shapeKind', 'string', layer.shape),
          prop('stroke', 'color', stroke),
          prop('strokeWidth', 'number', sw),
          prop('strokeDash', 'string', layer.dash ?? 'solid'),
          ...(layer.arrowStart ? [prop('arrowStart', 'boolean', true)] : []),
        ],
      },
    });
    return out;
  }

  const cx = (layer.at!.x / 100) * width,
    cy = (layer.at!.y / 100) * height;
  const radius = (layer.radius! / 100) * short;
  if (layer.shape === 'arc') {
    const poly = sector(cx, cy, radius, sw, layer.startAngle!, layer.endAngle!);
    const box = pathBox([poly]);
    out.push({
      item: {
        id: `${prefix}s`,
        ...base,
        kind: 'shape',
        shape: 'rectangle',
        fill: stroke,
        transform: {
          x: box.x,
          y: box.y,
          ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}),
        },
        width: box.w,
        height: box.h,
      },
      role: 'shape',
      key,
      ...common,
      post: {
        props: [
          prop('shapeKind', 'string', 'path'),
          prop('polygon', 'string', box.json),
          prop('fill', 'color', stroke),
        ],
      },
    });
    return out;
  }

  // Protractor: a half ring, its base line and a tick every 10 degrees as one
  // path, then a label every 30 degrees (0 on the right, 180 on the left).
  const thick = Math.max(2, radius * 0.025);
  const polys: [number, number][][] = [
    sector(cx, cy, radius, thick, 180, 360),
    quad([cx - radius - thick, cy], [cx + radius + thick, cy], thick),
  ];
  for (let degrees = 0; degrees <= 180; degrees += 10) {
    const a = ((180 + degrees) * Math.PI) / 180;
    const long = degrees % 30 === 0;
    const r1 = radius - (long ? radius * 0.14 : radius * 0.07);
    polys.push(
      quad(
        [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)],
        [cx + radius * Math.cos(a), cy + radius * Math.sin(a)],
        thick * (long ? 0.9 : 0.6),
      ),
    );
  }
  const box = pathBox(polys);
  out.push({
    item: {
      id: `${prefix}s`,
      ...base,
      kind: 'shape',
      shape: 'rectangle',
      fill: stroke,
      transform: {
        x: box.x,
        y: box.y,
        ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}),
      },
      width: box.w,
      height: box.h,
    },
    role: 'shape',
    key,
    ...common,
    post: {
      props: [
        prop('shapeKind', 'string', 'path'),
        prop('polygon', 'string', box.json),
        prop('fill', 'color', stroke),
      ],
    },
  });
  const labelSize = Math.max(10, Math.round(radius * 0.09));
  for (let degrees = 0; degrees <= 180; degrees += 30) {
    const a = ((180 + degrees) * Math.PI) / 180;
    const r2 = radius - radius * 0.26;
    const lw = labelSize * 3;
    out.push({
      item: {
        id: `${prefix}d${degrees}`,
        name: `${degrees}°`,
        kind: 'text',
        text: `${degrees}°`,
        fontSize: labelSize,
        fill: stroke,
        ...when,
        transform: {
          x: cx + r2 * Math.cos(a) - lw / 2,
          y: cy + r2 * Math.sin(a) - labelSize * 0.65,
        },
        width: lw,
        height: labelSize * 1.3,
      },
      role: 'body',
      key: `${key}#${degrees}`,
      ...common,
    });
  }
  return out;
}

function layoutBubble(
  layer: PlanLayer,
  key: string,
  prefix: string,
  when: Timing,
  env: LayoutEnv,
): Emitted[] {
  const { width, height, palette } = env;
  const short = Math.min(width, height);
  const px = (value: number) => (value * short) / 1080;
  const out: Emitted[] = [];
  const text = layer.text ?? '';
  const fontSize = Math.round(
    layer.fontSize !== undefined ? px(layer.fontSize) : short * 0.04,
  );
  const w =
    layer.width !== undefined ? (layer.width / 100) * width : width * 0.55;
  const inner = w * 0.84;
  const lines = Math.max(1, Math.ceil((text.length * fontSize * 0.55) / inner));
  const textH = fontSize * 1.25 * lines;
  const h =
    layer.height !== undefined
      ? (layer.height / 100) * height
      : textH + fontSize * 1.6;
  const thought = layer.bubble === 'thought';
  const at = place(layer, env, w, h);
  const fill = layer.color ?? '#ffffff';
  const line = layer.stroke ?? '#2b2b2b';
  const sw = px(layer.strokeWidth ?? 4);
  const common = { enter: layer.enter, exit: layer.exit } as const;
  const strokeProps = [
    prop('stroke', 'color', line),
    prop('strokeWidth', 'number', sw),
  ];
  const opacity = layer.opacity !== undefined ? { opacity: layer.opacity } : {};
  // Top to bottom: the text, the body, then the tail.
  out.push({
    item: {
      id: `${prefix}x`,
      name: text.slice(0, 100),
      kind: 'text',
      text: text.slice(0, 1000),
      fontSize,
      fill: palette.text === '#ffffff' ? '#222222' : palette.text,
      ...when,
      transform: {
        x: at.x + (w - inner) / 2,
        y: at.y + (h - textH) / 2,
        ...opacity,
      },
      width: inner,
      height: textH,
    },
    role: 'body',
    key,
    ...common,
  });
  out.push({
    item: {
      id: `${prefix}b`,
      name: 'Bubble',
      kind: 'shape',
      shape: thought ? 'ellipse' : 'rectangle',
      fill,
      ...when,
      transform: { x: at.x, y: at.y, ...opacity },
      width: w,
      height: h,
    },
    role: 'shape',
    key: `${key}#body`,
    ...common,
    post: {
      props: [
        ...strokeProps,
        ...(thought
          ? []
          : [prop('cornerRadius', 'number', Math.round(px(36)))]),
      ],
    },
  });
  const tail = layer.tail ?? 'left';
  if (tail !== 'none') {
    const dir = tail === 'left' ? -1 : 1;
    const baseX = at.x + w / 2 + dir * w * 0.22;
    const baseY = at.y + h - sw;
    if (thought) {
      // Two small circles trailing down from the bubble.
      [
        [0.07, 0.32],
        [0.04, 0.55],
      ].forEach(([scale, drop], n) => {
        const d = Math.max(8, w * scale!);
        out.push({
          item: {
            id: `${prefix}t${n}`,
            name: 'Thought dot',
            kind: 'shape',
            shape: 'ellipse',
            fill,
            ...when,
            transform: {
              x: baseX + dir * w * 0.04 * n - d / 2,
              y: baseY + h * drop! * 0.9,
              ...opacity,
            },
            width: d,
            height: d,
          },
          role: 'shape',
          key: `${key}#dot${n}`,
          ...common,
          post: { props: strokeProps },
        });
      });
    } else {
      const tw = w * 0.14,
        th = h * 0.42;
      const poly: [number, number][] = [
        [baseX - tw / 2, baseY - sw * 2],
        [baseX + tw / 2, baseY - sw * 2],
        [baseX + dir * tw * 0.9, baseY + th],
      ];
      const box = pathBox([poly]);
      out.push({
        item: {
          id: `${prefix}t`,
          name: 'Bubble tail',
          kind: 'shape',
          shape: 'rectangle',
          fill,
          ...when,
          transform: { x: box.x, y: box.y, ...opacity },
          width: box.w,
          height: box.h,
        },
        role: 'shape',
        key: `${key}#tail`,
        ...common,
        post: {
          props: [
            prop('shapeKind', 'string', 'path'),
            prop('polygon', 'string', box.json),
            prop('fill', 'color', fill),
            ...strokeProps,
          ],
        },
      });
    }
  }
  return out;
}
