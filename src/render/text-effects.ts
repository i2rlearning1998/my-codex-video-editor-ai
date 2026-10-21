// FINAL3 (Canva text effects): one Style effect per text — Shadow, Lift,
// Hollow, Splice, Echo, Outline, Glow, Background, Glitch or Neon — and the
// Shape effect Curve, plus a gradient text colour (up to 10 colours) and
// the typewriter reveal. They are text properties (schema unchanged, JSON
// strings read defensively) and are drawn by one function for the preview
// and the export, so both show the same pixels.
import type { SceneLayer } from './adapter';
import {
  clusters,
  drawRich,
  placeRich,
  richClusterCount,
  type PlacedLine,
  type RichLayout,
  type TextPaint,
} from './rich-text';
import { canvasGradient, parseGradient, type Gradient } from './paint';
import type { TextBox } from './text-box';
import type { TextStyle } from './text-style';

export const TEXT_EFFECTS = [
  'shadow',
  'lift',
  'hollow',
  'splice',
  'echo',
  'outline',
  'glow',
  'background',
  'glitch',
  'neon',
] as const;
export type TextEffectType = (typeof TEXT_EFFECTS)[number];
/** Every effect's settings; each effect shows the ones that apply. */
export interface TextEffect {
  readonly type: TextEffectType;
  /** 0 to 100: offset, thickness, blur or strength, by effect. */
  readonly intensity: number;
  readonly color: string;
  /** Second colour (Glitch). */
  readonly color2: string;
  /** Degrees, −180 to 180 (0: to the right, 90: down). */
  readonly direction: number;
  /** 0 (opaque) to 100 (invisible). */
  readonly transparency: number;
  /** Background: corner roundness and spread, 0 to 100. */
  readonly roundness: number;
  readonly spread: number;
}
/** The settings each effect shows (Canva's sliders). */
export const EFFECT_FIELDS: Readonly<
  Record<TextEffectType, readonly (keyof TextEffect)[]>
> = {
  shadow: ['intensity', 'direction', 'transparency', 'color'],
  lift: ['intensity'],
  hollow: ['intensity'],
  splice: ['intensity', 'direction', 'color'],
  echo: ['intensity', 'direction', 'color'],
  outline: ['intensity', 'color'],
  glow: ['intensity', 'transparency', 'color'],
  background: ['roundness', 'spread', 'transparency', 'color'],
  glitch: ['intensity', 'direction', 'color', 'color2'],
  neon: ['intensity'],
};
export const EFFECT_DEFAULTS: Readonly<Record<TextEffectType, TextEffect>> =
  Object.fromEntries(
    TEXT_EFFECTS.map((type) => [
      type,
      Object.freeze({
        type,
        intensity: type === 'hollow' || type === 'outline' ? 40 : 50,
        color:
          type === 'background'
            ? '#ffd23f'
            : type === 'glitch'
              ? '#00e5ff'
              : type === 'glow'
                ? '#ffe066'
                : type === 'splice'
                  ? '#ff6f61'
                  : '#000000',
        color2: '#ff2d6f',
        direction: type === 'glitch' ? 0 : 45,
        transparency: type === 'shadow' ? 40 : 0,
        roundness: 50,
        spread: 50,
      }),
    ]),
  ) as Record<TextEffectType, TextEffect>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (value: unknown, low: number, high: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(low, Math.min(high, number))
    : fallback;
};
/** A valid effect, or null (none, unknown or malformed). */
export function parseTextEffect(text: string | undefined): TextEffect | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (!(TEXT_EFFECTS as readonly string[]).includes(String(raw.type)))
      return null;
    const base = EFFECT_DEFAULTS[raw.type as TextEffectType];
    const color = (value: unknown, fallback: string) =>
      typeof value === 'string' && HEX.test(value)
        ? value.toLowerCase()
        : fallback;
    return {
      type: base.type,
      intensity: clamp(raw.intensity, 0, 100, base.intensity),
      color: color(raw.color, base.color),
      color2: color(raw.color2, base.color2),
      direction: clamp(raw.direction, -180, 180, base.direction),
      transparency: clamp(raw.transparency, 0, 100, base.transparency),
      roundness: clamp(raw.roundness, 0, 100, base.roundness),
      spread: clamp(raw.spread, 0, 100, base.spread),
    };
  } catch {
    return null;
  }
}
export const formatTextEffect = (effect: TextEffect) => JSON.stringify(effect);

/** The render item fields a text's effects add. */
export interface TextLook {
  readonly textEffect?: TextEffect;
  readonly textCurve?: number;
  readonly textCurveDrop?: number;
  readonly textGradient?: Gradient;
  /** FINAL3 T6: grapheme clusters shown (typewriter); all when unset. */
  readonly textReveal?: number;
}
const stringOf = (layer: SceneLayer, key: string) => {
  const value = layer.properties[key];
  return value?.type === 'string' ? value.value : undefined;
};
/** A text layer's effects, curve, gradient and reveal, for its render item. */
export function textEffectsOf(layer: SceneLayer, box: TextBox): TextLook {
  const effect = parseTextEffect(stringOf(layer, 'textEffect'));
  const gradient = parseGradient(stringOf(layer, 'textGradient'), 10);
  const reveal = layer.properties.presetTextReveal;
  const fraction =
    reveal?.type === 'number' && Number.isFinite(reveal.value)
      ? Math.max(0, Math.min(1, reveal.value))
      : null;
  const byWords = stringOf(layer, 'presetTextRevealBy') === 'words';
  return {
    ...(effect ? { textEffect: effect } : {}),
    ...(box.curve
      ? { textCurve: box.curve, textCurveDrop: box.curveDrop }
      : {}),
    ...(gradient ? { textGradient: gradient } : {}),
    ...(fraction !== null && fraction < 1
      ? { textReveal: revealCount(box.layout, fraction, byWords) }
      : {}),
  };
}
/**
 * FINAL3 T6: how many clusters show at `fraction` of a typewriter (by
 * cluster, so a conjunct appears whole) or a word-by-word reveal (whole
 * words only).
 */
export function revealCount(
  layout: RichLayout,
  fraction: number,
  byWords = false,
): number {
  const total = richClusterCount(layout);
  if (!byWords) return Math.floor(total * fraction + 1e-9);
  // Word ends, in clusters.
  const ends: number[] = [];
  let count = 0;
  for (const line of layout.lines) {
    for (const span of line.spans) {
      for (const cluster of clusters(span.text)) {
        if (/^\s+$/u.test(cluster) && count && ends.at(-1) !== count)
          ends.push(count);
        count++;
      }
    }
    if (ends.at(-1) !== count) ends.push(count);
  }
  const words = ends.length;
  const shown = Math.floor(words * fraction + 1e-9);
  return shown ? ends[shown - 1]! : 0;
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** Canvas shadows are in output pixels: map a composition-space offset. */
function deviceVector(context: Context, dx: number, dy: number) {
  const m = context.getTransform();
  return { x: m.a * dx + m.c * dy, y: m.b * dx + m.d * dy };
}
const deviceScale = (context: Context) => {
  const m = context.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
};
const alphaOf = (transparency: number) => 1 - transparency / 100;
function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}
function mix(hex: string, other: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16),
    b = parseInt(other.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(
      ((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount,
    );
  return `#${[16, 8, 0].map((s) => channel(s).toString(16).padStart(2, '0')).join('')}`;
}

export interface TextDrawInput extends TextLook {
  readonly layout: RichLayout;
  readonly style: TextStyle;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly color: string;
}
/**
 * Draws a text with its effect, curve, gradient and reveal. Every pass uses
 * the same placed lines, so copies line up with the text exactly.
 */
export function drawTextWithEffects(context: Context, input: TextDrawInput) {
  // A downward curve lifts the line ends: the text moves down to make room.
  const top =
    input.textCurve && input.textCurve < 0 ? (input.textCurveDrop ?? 0) : 0;
  const height = input.height - (input.textCurveDrop ?? 0);
  const placed = placeRich(
    context,
    input.layout,
    input.style,
    input.width,
    Math.max(1, height),
  ).map((line) =>
    top
      ? { ...line, top: line.top + top, baseline: line.baseline + top }
      : line,
  );
  const fill = input.textGradient
    ? canvasGradient(context, input.textGradient, input.width, input.height)
    : undefined;
  const common: TextPaint = {
    ...(input.textReveal !== undefined ? { reveal: input.textReveal } : {}),
    ...(input.textCurve ? { curve: input.textCurve } : {}),
  };
  const draw = (paint: TextPaint = {}) =>
    drawRich(
      context,
      input.layout,
      input.style,
      input.width,
      height,
      { ...common, ...paint },
      placed,
    );
  const effect = input.textEffect;
  const size = input.fontSize;
  const text = (paint: TextPaint = {}) =>
    draw({ ...(fill ? { color: fill } : {}), ...paint });
  if (!effect) return text();
  const k = effect.intensity / 100;
  const angle = (effect.direction * Math.PI) / 180;
  const along = (distance: number) => ({
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
  });
  const shadow = (
    color: string,
    blur: number,
    offset: { dx: number; dy: number },
    paint: TextPaint,
  ) => {
    context.save();
    const device = deviceVector(context, offset.dx, offset.dy);
    context.shadowColor = color;
    context.shadowBlur = blur * deviceScale(context);
    context.shadowOffsetX = device.x;
    context.shadowOffsetY = device.y;
    draw(paint);
    context.restore();
  };
  switch (effect.type) {
    case 'shadow': {
      shadow(
        withAlpha(effect.color, alphaOf(effect.transparency)),
        size * 0.12 * k,
        along(size * 0.15 * k),
        fill ? { color: fill } : {},
      );
      return;
    }
    case 'lift': {
      shadow(
        withAlpha('#000000', 0.25 + 0.45 * k),
        size * (0.15 + 0.5 * k),
        { dx: 0, dy: size * 0.05 },
        fill ? { color: fill } : {},
      );
      return;
    }
    case 'hollow':
      return text({ stroke: Math.max(0.5, size * 0.06 * k), bare: true });
    case 'splice': {
      draw({
        color: effect.color,
        ...along(size * 0.12 * k + size * 0.02),
        bare: true,
      });
      return text({ stroke: Math.max(0.5, size * 0.04), bare: true });
    }
    case 'echo': {
      const step = along(size * 0.1 * k + size * 0.02);
      context.save();
      context.globalAlpha *= 0.25;
      draw({
        color: effect.color,
        dx: step.dx * 2,
        dy: step.dy * 2,
        bare: true,
      });
      context.restore();
      context.save();
      context.globalAlpha *= 0.5;
      draw({ color: effect.color, dx: step.dx, dy: step.dy, bare: true });
      context.restore();
      return text();
    }
    case 'outline':
      draw({
        color: effect.color,
        stroke: Math.max(0.5, size * 0.16 * k),
        bare: true,
      });
      return text();
    case 'glow':
      shadow(
        withAlpha(effect.color, alphaOf(effect.transparency)),
        size * (0.1 + 0.5 * k),
        { dx: 0, dy: 0 },
        fill ? { color: fill } : {},
      );
      return;
    case 'background': {
      drawBackgrounds(context, placed, effect, size);
      return text();
    }
    case 'glitch': {
      const offset = along(size * 0.06 * k + size * 0.01);
      draw({ color: effect.color, dx: -offset.dx, dy: -offset.dy, bare: true });
      draw({ color: effect.color2, dx: offset.dx, dy: offset.dy, bare: true });
      return text();
    }
    case 'neon': {
      const glow = input.color;
      shadow(
        glow,
        size * (0.2 + 0.6 * k),
        { dx: 0, dy: 0 },
        { color: mix(glow, '#ffffff', 0.55) },
      );
      shadow(
        glow,
        size * 0.08,
        { dx: 0, dy: 0 },
        { color: mix(glow, '#ffffff', 0.55) },
      );
      return;
    }
  }
}

/** Background: a rounded box behind every line (spread and roundness). */
function drawBackgrounds(
  context: Context,
  placed: readonly PlacedLine[],
  effect: TextEffect,
  size: number,
) {
  context.save();
  context.fillStyle = withAlpha(effect.color, alphaOf(effect.transparency));
  for (const line of placed) {
    if (!line.line.spans.length && !line.marker) continue;
    const pad = size * (0.05 + 0.35 * (effect.spread / 100));
    const left = (line.marker ? Math.min(line.marker.x, line.x) : line.x) - pad;
    const right = line.x + line.width + pad;
    const top = line.top - pad * 0.6;
    const height = line.line.lineHeight + pad * 1.2;
    const radius =
      Math.min(height / 2, (right - left) / 2) * (effect.roundness / 100);
    context.beginPath();
    context.roundRect(left, top, right - left, height, radius);
    context.fill();
  }
  context.restore();
}
