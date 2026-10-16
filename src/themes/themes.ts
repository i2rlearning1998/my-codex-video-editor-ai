import { z } from 'zod';
import { isManualColor } from '../core/manual-color';
export { markManualColor, isManualColor } from '../core/manual-color';

export const MOTION_STYLES = {
  calm: { easing: 'ease-in-out', durationScale: 1.3 },
  snappy: { easing: 'ease-out', durationScale: 0.6 },
  bouncy: { easing: 'ease-out', durationScale: 0.8 },
  cinematic: { easing: 'ease-in-out', durationScale: 1.6 },
} as const;
export type MotionStyle = keyof typeof MOTION_STYLES;
export const PALETTE_SLOTS = [
  'background',
  'primary',
  'accent',
  'text',
  'extra',
] as const;
export type PaletteSlot = (typeof PALETTE_SLOTS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const themeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,64}$/),
    name: z.string().min(1).max(40),
    palette: z
      .object({
        background: hex,
        primary: hex,
        accent: hex,
        text: hex,
        extra: hex.optional(),
      })
      .strict(),
    fonts: z
      .object({
        heading: z.string().min(1).max(40),
        body: z.string().min(1).max(40),
      })
      .strict(),
    motion: z.enum(['calm', 'snappy', 'bouncy', 'cinematic']),
    caption: z.string().max(40).optional(),
  })
  .strict();
export type Theme = z.infer<typeof themeSchema>;

const theme = (
  id: string,
  name: string,
  palette: [string, string, string, string, string?],
  heading: string,
  body: string,
  motion: MotionStyle,
): Theme => ({
  id,
  name,
  palette: {
    background: palette[0],
    primary: palette[1],
    accent: palette[2],
    text: palette[3],
    ...(palette[4] ? { extra: palette[4] } : {}),
  },
  fonts: { heading, body },
  motion,
});
/** The 8 built-in themes (original palettes; fonts the editor has). */
export const BUILT_IN_THEMES: readonly Theme[] = [
  theme(
    'clean-light',
    'Clean Light',
    ['#ffffff', '#2563eb', '#f59e0b', '#111827', '#e5e7eb'],
    'Inter',
    'Inter',
    'calm',
  ),
  theme(
    'dark-neon',
    'Dark Neon',
    ['#0b0b1a', '#7c3aed', '#22d3ee', '#f8fafc', '#f472b6'],
    'Poppins',
    'Inter',
    'snappy',
  ),
  theme(
    'documentary',
    'Documentary',
    ['#1c1917', '#d6d3d1', '#ca8a04', '#fafaf9'],
    'Georgia',
    'Verdana',
    'cinematic',
  ),
  theme(
    'playful-pop',
    'Playful Pop',
    ['#fff7ed', '#ec4899', '#22c55e', '#1e1b4b', '#facc15'],
    'Poppins',
    'Poppins',
    'bouncy',
  ),
  theme(
    'corporate-blue',
    'Corporate Blue',
    ['#f8fafc', '#1d4ed8', '#0ea5e9', '#0f172a', '#cbd5e1'],
    'Arial',
    'Arial',
    'calm',
  ),
  theme(
    'warm-story',
    'Warm Story',
    ['#fef3c7', '#b45309', '#dc2626', '#422006'],
    'Georgia',
    'Trebuchet MS',
    'calm',
  ),
  theme(
    'minimal-mono',
    'Minimal Mono',
    ['#fafafa', '#171717', '#737373', '#0a0a0a'],
    'Inter',
    'Courier New',
    'snappy',
  ),
  theme(
    'cinematic-teal',
    'Cinematic Teal',
    ['#042f2e', '#14b8a6', '#fb923c', '#f0fdfa', '#99f6e4'],
    'Poppins',
    'Inter',
    'cinematic',
  ),
];

// --- Storage in the project (reserved markers) -----------------------------

export const THEME_PREFIX = 'aive:theme ';
export const CURRENT_THEME_PREFIX = 'aive:theme-current ';
interface MarkerLike {
  readonly id: string;
  readonly time: number;
  readonly label: string;
}
type Compact = {
  i: string;
  n: string;
  p: string[];
  f: [string, string];
  m: MotionStyle;
  c?: string;
};
export function encodeTheme(value: Theme): string {
  const compact: Compact = {
    i: value.id,
    n: value.name,
    p: [
      value.palette.background,
      value.palette.primary,
      value.palette.accent,
      value.palette.text,
      ...(value.palette.extra ? [value.palette.extra] : []),
    ],
    f: [value.fonts.heading, value.fonts.body],
    m: value.motion,
    ...(value.caption ? { c: value.caption } : {}),
  };
  return THEME_PREFIX + JSON.stringify(compact);
}
export function decodeTheme(label: string): Theme | null {
  if (!label.startsWith(THEME_PREFIX)) return null;
  try {
    const raw = JSON.parse(label.slice(THEME_PREFIX.length)) as Compact;
    const parsed = themeSchema.safeParse({
      id: raw.i,
      name: raw.n,
      palette: {
        background: raw.p[0],
        primary: raw.p[1],
        accent: raw.p[2],
        text: raw.p[3],
        ...(raw.p[4] ? { extra: raw.p[4] } : {}),
      },
      fonts: { heading: raw.f[0], body: raw.f[1] },
      motion: raw.m,
      ...(raw.c ? { caption: raw.c } : {}),
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
/** The project's saved themes (My themes) and current theme id. */
export function projectThemes(markers: readonly MarkerLike[]): {
  current: string | null;
  saved: Theme[];
} {
  const current = markers.find((marker) =>
    marker.label.startsWith(CURRENT_THEME_PREFIX),
  );
  return {
    current: current
      ? current.label.slice(CURRENT_THEME_PREFIX.length).trim() || null
      : null,
    saved: markers.flatMap((marker) => {
      const value = decodeTheme(marker.label);
      return value ? [value] : [];
    }),
  };
}

// --- Applying a theme -------------------------------------------------------

type PropertyRecord = Readonly<
  Record<
    string,
    { readonly type?: string; readonly value?: unknown } | undefined
  >
>;
export interface ThemeLayer {
  readonly id: string;
  readonly type: string;
  readonly properties: object;
  readonly children: readonly ThemeLayer[];
}
export interface ThemeScene {
  readonly id: string;
  readonly backgroundColor: string;
  readonly layers: readonly ThemeLayer[];
  readonly markers: readonly MarkerLike[];
}
export const slotOf = (properties: object): PaletteSlot | null => {
  const value = (properties as PropertyRecord).paletteSlot;
  return value?.type === 'string' &&
    PALETTE_SLOTS.includes(value.value as PaletteSlot)
    ? (value.value as PaletteSlot)
    : null;
};
export const colorOf = (palette: Theme['palette'], slot: PaletteSlot) =>
  palette[slot] ?? palette.primary;
/** A heading is text at least this large (in composition pixels). */
const HEADING_SIZE = 48;

type Command = Record<string, unknown>;
const property = (type: string, value: unknown) => ({
  type,
  value,
  animated: false,
  keyframes: [],
  constraints: [],
});
export function applyThemeCommands(
  scenes: readonly ThemeScene[],
  next: Theme,
  options: { previous?: Theme | null; override?: boolean } = {},
): Command[] {
  const commands: Command[] = [];
  const { palette, fonts } = next;

  for (const scene of scenes) {
    commands.push({
      type: 'SET_COMPOSITION_BACKGROUND',
      compositionId: scene.id,
      color: palette.background,
    });
    const set = (layerId: string, key: string, type: string, value: unknown) =>
      commands.push({
        type: 'SET_PROPERTY',
        compositionId: scene.id,
        layerId,
        target: { kind: 'property', key },
        property: property(type, value),
        colorSource: 'theme',
      });
    const visit = (layers: readonly ThemeLayer[]) => {
      for (const layer of layers) {
        const record = layer.properties as PropertyRecord;
        const slot = slotOf(layer.properties);
        const fill = record.fill;
        if (layer.type === 'text') {
          const size = record.fontSize?.value;
          set(
            layer.id,
            'fontFamily',
            'string',
            typeof size === 'number' && size >= HEADING_SIZE
              ? fonts.heading
              : fonts.body,
          );
          if (
            fill?.type === 'color' &&
            (!isManualColor(layer, 'fill') || options.override)
          ) {
            set(layer.id, 'fill', 'color', colorOf(palette, slot ?? 'text'));
            if (!slot) set(layer.id, 'paletteSlot', 'string', 'text');
          }
        } else if (layer.type === 'shape' && fill?.type === 'color') {
          if (
            (slot || options.override) &&
            (!isManualColor(layer, 'fill') || options.override)
          ) {
            set(layer.id, 'fill', 'color', colorOf(palette, slot ?? 'primary'));
            if (!slot) set(layer.id, 'paletteSlot', 'string', 'primary');
          }
        }
        visit(layer.children);
      }
    };
    visit(scene.layers);
  }
  // The project's theme markers live on the first scene.
  const first = scenes[0];
  if (first) {
    for (const marker of first.markers) {
      if (marker.label.startsWith(CURRENT_THEME_PREFIX))
        commands.push({
          type: 'DELETE_MARKER',
          compositionId: first.id,
          markerId: marker.id,
        });
    }
    commands.push({
      type: 'ADD_MARKER',
      compositionId: first.id,
      marker: {
        id: `theme-current-${Date.now().toString(36)}`,
        time: 0,
        label: `${CURRENT_THEME_PREFIX}${next.id}`,
      },
    });
  }
  return commands;
}
/** @deprecated Use createThemeLibrary(store).saveTheme; marker writes are disabled. */
export function saveThemeCommand(
  _compositionId: string,
  _value: Theme,
): Command {
  throw new Error(
    'Use the theme library saveTheme API; themes are not project edits',
  );
}
/** @deprecated Use the library renameTheme/deleteTheme APIs. */
export function updateThemeCommands(
  _first: ThemeScene,
  _id: string,
  _value: Theme | null,
): Command[] {
  throw new Error('Use the theme library renameTheme/deleteTheme APIs');
}

/**
 * T1: a layer tree with palette slots: backgrounds take 'background', text
 * 'text' and other shapes 'primary' (a layer that has a slot keeps it).
 */
export function withPaletteSlots<
  L extends {
    type: string;
    properties: Record<string, unknown>;
    children: L[];
  },
>(layer: L, background = false): L {
  const record = layer.properties as PropertyRecord;
  const isBackground =
    background ||
    (record.role?.type === 'string' && record.role.value === 'background');
  const slot: PaletteSlot | null =
    layer.type === 'text'
      ? 'text'
      : layer.type === 'shape'
        ? isBackground
          ? 'background'
          : 'primary'
        : null;
  return {
    ...layer,
    properties:
      slot && record.fill?.type === 'color' && !slotOf(layer.properties)
        ? { ...layer.properties, paletteSlot: property('string', slot) }
        : layer.properties,
    children: layer.children.map((child) =>
      withPaletteSlots(child, isBackground),
    ),
  };
}
