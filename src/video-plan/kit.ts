// FINAL3 V2.5: the starter kit. Each item is a few Composition Spec v1 items
// (shapes and text) placed in fractions of the canvas, so it fits every
// aspect, and coloured from the plan's palette (a theme changes it). Ids are
// in kit-ids.ts; an unknown id is a warning, never a failure.
import { captionStyle, type CaptionStyle } from '../captions/styles';
import type { CaptionStyleId } from '../captions/styles';
import {
  KIT_BACKGROUNDS,
  KIT_ITEMS,
  type KitCaptionStyle,
  type KitTransition,
} from './kit-ids';

export type SpecItem = Record<string, unknown>;
export interface KitContext {
  readonly width: number;
  readonly height: number;
  readonly palette: { background: string; text: string; accent: string };
  /** The layer's text (a kit item's main line; `|` splits a second line). */
  readonly text: string;
  readonly start: number;
  readonly duration: number;
  /** Spec item ids start with this (letters first, unique per layer). */
  readonly idPrefix: string;
}

const lines = (text: string) => {
  const [first = '', ...rest] = text.split('|').map((part) => part.trim());
  return { main: first, sub: rest.join(' ') };
};
/** A readable text colour on a fill (black or white by luminance). */
export function onColor(fill: string): string {
  const n = parseInt(fill.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4 ? '#111111' : '#ffffff';
}

function builder(ctx: KitContext) {
  const { width: w, height: h } = ctx;
  const short = Math.min(w, h);
  let n = 0;
  const base = (name: string) => ({
    id: `${ctx.idPrefix}-${++n}`,
    name,
    start: ctx.start,
    duration: ctx.duration,
  });
  const rect = (
    name: string,
    x: number,
    y: number,
    rw: number,
    rh: number,
    fill: string,
    shape: 'rectangle' | 'ellipse' = 'rectangle',
    opacity = 1,
  ): SpecItem => ({
    ...base(name),
    kind: 'shape',
    shape,
    fill,
    transform: { x: x * w, y: y * h, opacity },
    width: Math.max(1, rw * w),
    height: Math.max(1, rh * h),
  });
  const label = (
    name: string,
    value: string,
    x: number,
    y: number,
    rw: number,
    size: number,
    fill: string,
  ): SpecItem => ({
    ...base(name),
    kind: 'text',
    text: value.slice(0, 1000) || ' ',
    fontSize: Math.max(8, Math.round(size * short)),
    fill,
    transform: { x: x * w, y: y * h },
    width: Math.max(1, rw * w),
    height: Math.max(1, size * short * 1.3),
  });
  return { rect, label, w, h, short };
}

type KitBuild = (ctx: KitContext) => SpecItem[];
const lowerThird =
  (variant: 1 | 2 | 3): KitBuild =>
  (ctx) => {
    const { rect, label } = builder(ctx);
    const { main, sub } = lines(ctx.text);
    const { accent, text } = ctx.palette;
    if (variant === 1)
      return [
        rect('Lower third bar', 0.05, 0.74, 0.42, 0.14, accent),
        label(
          'Lower third name',
          main,
          0.07,
          0.755,
          0.38,
          0.045,
          onColor(accent),
        ),
        ...(sub
          ? [
              label(
                'Lower third role',
                sub,
                0.07,
                0.82,
                0.38,
                0.03,
                onColor(accent),
              ),
            ]
          : []),
      ];
    if (variant === 2)
      return [
        rect('Lower third line', 0.05, 0.74, 0.006, 0.13, accent),
        label('Lower third name', main, 0.065, 0.745, 0.5, 0.05, text),
        ...(sub
          ? [label('Lower third role', sub, 0.065, 0.82, 0.5, 0.03, text)]
          : []),
      ];
    return [
      rect(
        'Lower third card',
        0.05,
        0.72,
        0.5,
        0.17,
        '#000000',
        'rectangle',
        0.55,
      ),
      rect('Lower third accent', 0.05, 0.72, 0.5, 0.012, accent),
      label('Lower third name', main, 0.07, 0.745, 0.46, 0.045, '#ffffff'),
      ...(sub
        ? [label('Lower third role', sub, 0.07, 0.81, 0.46, 0.03, accent)]
        : []),
    ];
  };
const titleCard =
  (variant: 1 | 2 | 3 | 4 | 5): KitBuild =>
  (ctx) => {
    const { rect, label } = builder(ctx);
    const { main, sub } = lines(ctx.text);
    const { accent, text, background } = ctx.palette;
    switch (variant) {
      case 1:
        return [
          label('Title', main, 0.1, 0.38, 0.8, 0.09, text),
          ...(sub ? [label('Subtitle', sub, 0.1, 0.54, 0.8, 0.04, text)] : []),
        ];
      case 2:
        return [
          rect('Title band', 0, 0.34, 1, 0.3, accent),
          label('Title', main, 0.08, 0.4, 0.84, 0.09, onColor(accent)),
          ...(sub
            ? [label('Subtitle', sub, 0.08, 0.54, 0.84, 0.035, onColor(accent))]
            : []),
        ];
      case 3:
        return [
          rect('Title frame', 0.08, 0.2, 0.84, 0.6, background),
          rect('Title rule', 0.12, 0.62, 0.2, 0.01, accent),
          label('Title', main, 0.12, 0.32, 0.76, 0.09, text),
          ...(sub
            ? [label('Subtitle', sub, 0.12, 0.66, 0.76, 0.035, text)]
            : []),
        ];
      case 4:
        return [
          rect(
            'Title circle',
            0.35,
            0.18,
            0.3,
            0.3 * (ctx.width / ctx.height),
            accent,
            'ellipse',
            0.85,
          ),
          label('Title', main, 0.08, 0.66, 0.84, 0.08, text),
          ...(sub
            ? [label('Subtitle', sub, 0.08, 0.78, 0.84, 0.035, text)]
            : []),
        ];
      default:
        return [
          rect('Title side', 0, 0, 0.36, 1, accent),
          label('Title', main, 0.42, 0.36, 0.54, 0.08, text),
          ...(sub
            ? [label('Subtitle', sub, 0.42, 0.5, 0.54, 0.035, text)]
            : []),
        ];
    }
  };
const KIT: Record<string, KitBuild> = {
  'lower-third-1': lowerThird(1),
  'lower-third-2': lowerThird(2),
  'lower-third-3': lowerThird(3),
  'title-card-1': titleCard(1),
  'title-card-2': titleCard(2),
  'title-card-3': titleCard(3),
  'title-card-4': titleCard(4),
  'title-card-5': titleCard(5),
  'end-card': (ctx) => {
    const { rect, label } = builder(ctx);
    const { main, sub } = lines(ctx.text || 'Thanks for watching');
    return [
      rect(
        'End card video 1',
        0.08,
        0.5,
        0.38,
        0.38,
        '#000000',
        'rectangle',
        0.35,
      ),
      rect(
        'End card video 2',
        0.54,
        0.5,
        0.38,
        0.38,
        '#000000',
        'rectangle',
        0.35,
      ),
      label('End card title', main, 0.08, 0.16, 0.84, 0.08, ctx.palette.text),
      ...(sub
        ? [
            label(
              'End card note',
              sub,
              0.08,
              0.3,
              0.84,
              0.035,
              ctx.palette.text,
            ),
          ]
        : []),
    ];
  },
  'subscribe-cta': (ctx) => {
    const { rect, label } = builder(ctx);
    return [
      rect('Subscribe button', 0.38, 0.78, 0.24, 0.1, '#e53935'),
      label(
        'Subscribe',
        ctx.text || 'Subscribe',
        0.4,
        0.8,
        0.2,
        0.04,
        '#ffffff',
      ),
    ];
  },
  'callout-arrow': (ctx) => {
    const { rect, label } = builder(ctx);
    return [
      rect(
        'Callout dot',
        0.6,
        0.4,
        0.04,
        0.04 * (ctx.width / ctx.height),
        ctx.palette.accent,
        'ellipse',
      ),
      rect('Callout line', 0.64, 0.42, 0.12, 0.006, ctx.palette.accent),
      rect('Callout label', 0.76, 0.37, 0.2, 0.1, ctx.palette.accent),
      label(
        'Callout text',
        ctx.text || 'Look here',
        0.77,
        0.385,
        0.18,
        0.03,
        onColor(ctx.palette.accent),
      ),
    ];
  },
  'number-counter': (ctx) => {
    const { label } = builder(ctx);
    const { main, sub } = lines(ctx.text || '100');
    return [
      label('Number', main, 0.1, 0.32, 0.8, 0.18, ctx.palette.accent),
      ...(sub
        ? [label('Number label', sub, 0.1, 0.6, 0.8, 0.04, ctx.palette.text)]
        : []),
    ];
  },
  'quote-card': (ctx) => {
    const { rect, label } = builder(ctx);
    const { main, sub } = lines(ctx.text || 'A quote');
    return [
      rect('Quote card', 0.1, 0.2, 0.8, 0.6, ctx.palette.background),
      label('Quote mark', '“', 0.13, 0.22, 0.1, 0.12, ctx.palette.accent),
      label('Quote', main, 0.16, 0.36, 0.68, 0.05, ctx.palette.text),
      ...(sub
        ? [
            label(
              'Quote author',
              `— ${sub}`,
              0.16,
              0.66,
              0.68,
              0.03,
              ctx.palette.text,
            ),
          ]
        : []),
    ];
  },
  'background-solid': (ctx) => [
    builder(ctx).rect('Background', 0, 0, 1, 1, ctx.palette.background),
  ],
  'background-band': (ctx) => {
    const { rect } = builder(ctx);
    return [
      rect('Background', 0, 0, 1, 1, ctx.palette.background),
      rect(
        'Background band',
        0,
        0.82,
        1,
        0.18,
        ctx.palette.accent,
        'rectangle',
        0.6,
      ),
    ];
  },
  'background-frame': (ctx) => {
    const { rect } = builder(ctx);
    return [
      rect('Background frame', 0, 0, 1, 1, ctx.palette.accent),
      rect(
        'Background',
        0.03,
        0.03 * (ctx.width / ctx.height),
        0.94,
        1 - 0.06 * (ctx.width / ctx.height),
        ctx.palette.background,
      ),
    ];
  },
  'background-spotlight': (ctx) => {
    const { rect } = builder(ctx);
    return [
      rect('Background', 0, 0, 1, 1, ctx.palette.background),
      rect(
        'Background spot',
        0.2,
        0.05,
        0.6,
        0.9,
        ctx.palette.accent,
        'ellipse',
        0.18,
      ),
    ];
  },
};
/** Every starter kit id (items and backgrounds). */
export const KIT_IDS: readonly string[] = [...KIT_ITEMS, ...KIT_BACKGROUNDS];
export const isKitId = (id: string) => id in KIT;
/** The spec items for a kit id, or null when the id is unknown. */
export function kitItems(id: string, ctx: KitContext): SpecItem[] | null {
  const build = KIT[id];
  return build ? build(ctx) : null;
}

/** A kit transition as the editor's scene transition id (null: a cut). */
export function transitionId(kit: KitTransition): string | null {
  return kit === 'cut'
    ? null
    : kit === 'dip-to-black'
      ? 'fade-black'
      : kit === 'dip-to-white'
        ? 'fade-white'
        : kit;
}
/** A kit caption style as a captions-engine style. */
export function kitCaptionStyle(id: KitCaptionStyle | undefined): CaptionStyle {
  if (id === 'headline')
    return {
      ...captionStyle('bold-box'),
      id: 'headline',
      name: 'Headline',
      fontSize: 72,
      fontWeight: 800,
      textCase: 'upper',
      maxLines: 1,
      maxCharsPerLine: 28,
      position: 'middle',
    } as CaptionStyle;
  return captionStyle((id ?? 'clean') as CaptionStyleId);
}
