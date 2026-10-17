// CAP (D-270): caption style presets as plain data. Sizes are composition
// units for a 1080 px tall canvas and scale with the canvas height. Text
// layers have no outline or shadow yet (TXT-019), so a readable look uses a
// box: a rounded rectangle drawn behind the text in the same caption.
export type CaptionPosition = 'bottom' | 'middle' | 'top' | 'lower-third';
export const CAPTION_POSITIONS: readonly CaptionPosition[] = [
  'bottom',
  'middle',
  'top',
  'lower-third',
];
export interface CaptionBox {
  readonly color: string;
  /** 0 to 1. */
  readonly opacity: number;
  /** Space around the text (units at 1080 px). */
  readonly padding: number;
  readonly radius: number;
}
export interface CaptionStyle {
  readonly id: string;
  readonly name: string;
  readonly fontFamily: string;
  /** Units at a 1080 px tall canvas. */
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly color: string;
  readonly align: 'left' | 'center';
  readonly box: CaptionBox | null;
  readonly position: CaptionPosition;
  readonly maxLines: number;
  readonly maxCharsPerLine: number;
  /** Karaoke: spoken words take `highlightColor`, the current one is underlined. */
  readonly karaoke: boolean;
  readonly highlightColor: string;
  /** Text case shown (the stored text keeps what was said). */
  readonly textCase: 'none' | 'upper';
}

export const CAPTION_STYLES = Object.freeze({
  clean: {
    id: 'clean',
    name: 'Clean',
    fontFamily: 'Inter',
    fontSize: 52,
    fontWeight: 600,
    color: '#ffffff',
    align: 'center',
    box: { color: '#000000', opacity: 0.45, padding: 14, radius: 10 },
    position: 'bottom',
    maxLines: 2,
    maxCharsPerLine: 42,
    karaoke: false,
    highlightColor: '#ffd84d',
    textCase: 'none',
  },
  'bold-box': {
    id: 'bold-box',
    name: 'Bold box',
    fontFamily: 'Poppins',
    fontSize: 64,
    fontWeight: 800,
    color: '#ffffff',
    align: 'center',
    box: { color: '#111111', opacity: 0.9, padding: 20, radius: 14 },
    position: 'bottom',
    maxLines: 2,
    maxCharsPerLine: 32,
    karaoke: false,
    highlightColor: '#ffd84d',
    textCase: 'upper',
  },
  karaoke: {
    id: 'karaoke',
    name: 'Karaoke',
    fontFamily: 'Poppins',
    fontSize: 60,
    fontWeight: 700,
    color: '#ffffff',
    align: 'center',
    box: { color: '#000000', opacity: 0.55, padding: 16, radius: 12 },
    position: 'bottom',
    maxLines: 2,
    maxCharsPerLine: 36,
    karaoke: true,
    highlightColor: '#ffd84d',
    textCase: 'none',
  },
  'lower-third': {
    id: 'lower-third',
    name: 'Lower third',
    fontFamily: 'Inter',
    fontSize: 44,
    fontWeight: 600,
    color: '#ffffff',
    align: 'left',
    box: { color: '#1d2433', opacity: 0.85, padding: 16, radius: 6 },
    position: 'lower-third',
    maxLines: 2,
    maxCharsPerLine: 40,
    karaoke: false,
    highlightColor: '#7c5cff',
    textCase: 'none',
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    fontFamily: 'Inter',
    fontSize: 44,
    fontWeight: 500,
    color: '#ffffff',
    align: 'center',
    box: null,
    position: 'bottom',
    maxLines: 1,
    maxCharsPerLine: 48,
    karaoke: false,
    highlightColor: '#ffffff',
    textCase: 'none',
  },
} satisfies Record<string, CaptionStyle>);
export type CaptionStyleId = keyof typeof CAPTION_STYLES;
export const CAPTION_STYLE_IDS = Object.keys(
  CAPTION_STYLES,
) as readonly CaptionStyleId[];

/** A preset by id, or the style itself; an unknown id is an Error. */
export function captionStyle(
  style: CaptionStyleId | CaptionStyle | undefined,
  position?: CaptionPosition,
): CaptionStyle {
  const base =
    style === undefined
      ? CAPTION_STYLES.clean
      : typeof style === 'string'
        ? (CAPTION_STYLES as Record<string, CaptionStyle>)[style]
        : style;
  if (!base) throw new Error(`Unknown caption style: ${String(style)}`);
  return position && position !== base.position ? { ...base, position } : base;
}
