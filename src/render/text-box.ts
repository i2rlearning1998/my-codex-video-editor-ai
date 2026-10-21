// FINAL3 T1: the text box model (Canva behaviour). A text box's size comes
// from its text, measured with the real font, instead of a stored size:
// - auto width (the default for new text): one line per paragraph, never
//   wrapped; the box is as wide as the longest line;
// - fixed width (after a side handle is dragged): the stored width; the
//   text wraps inside it;
// in both, the height is exactly the lines (no empty line below), unless
// the box has a fixed height (then the text is anchored top, middle or
// bottom inside it). Old text layers keep their look: a box that was
// wrapped stays fixed width, and an unwrapped box whose text was centred,
// right-aligned or anchored keeps its stored width (and height) so nothing
// moves. Schema unchanged: `textBox` ('auto' | 'fixed') is a property.
import {
  layoutRich,
  parseListChecked,
  parseListLevels,
  parseListStyle,
  parseRuns,
  type ListStyle,
  type RichLayout,
  curveDrop,
} from './rich-text';
import { fallbackTextMeasure, type TextMeasurer } from './text-layout';
import { textStyleOf, type TextStyle } from './text-style';
import type { SceneLayer } from './adapter';

export type TextBoxMode = 'auto' | 'fixed';
const string = (layer: SceneLayer, key: string) => {
  const value = layer.properties[key];
  return value?.type === 'string' ? value.value : undefined;
};
const numeric = (layer: SceneLayer, key: string) => {
  const value = layer.properties[key];
  return value?.type === 'number' && Number.isFinite(value.value)
    ? value.value
    : undefined;
};
const flag = (layer: SceneLayer, key: string) => {
  const value = layer.properties[key];
  return value?.type === 'boolean' ? value.value : undefined;
};

/** Auto width or fixed width (old layers read by the rules above). */
export function textBoxMode(layer: SceneLayer): TextBoxMode {
  const mode = string(layer, 'textBox');
  if (mode === 'auto' || mode === 'fixed') return mode;
  if (flag(layer, 'textWrap')) return 'fixed';
  const style = textStyleOf(layer);
  return style.align === 'left' && style.anchor === 'top' ? 'auto' : 'fixed';
}
/** The box keeps its stored height (the text is anchored inside it). */
export function textHeightFixed(layer: SceneLayer): boolean {
  if (flag(layer, 'textFixedHeight')) return true;
  // An old unwrapped box anchored in the middle or at the bottom kept its
  // height; it still does, so the text stays where it was.
  return (
    string(layer, 'textBox') === undefined &&
    !flag(layer, 'textWrap') &&
    textStyleOf(layer).anchor !== 'top'
  );
}

let measurer: TextMeasurer = fallbackTextMeasure;
let epoch = 0;
const cache = new Map<string, TextBox>();
/** The renderer registers the browser's measurer (Canvas, real fonts). */
export function setTextBoxMeasurer(measure: TextMeasurer): void {
  if (measure === measurer) return;
  measurer = measure;
  textFontsChanged();
}
/** A font arrived: every box is measured again (so it never jumps later). */
export function textFontsChanged(): void {
  epoch++;
  cache.clear();
}
export const textBoxEpoch = () => epoch;
if (typeof document !== 'undefined' && document.fonts?.addEventListener)
  document.fonts.addEventListener('loadingdone', () => textFontsChanged());

/** FINAL3 T3: a layer's list: the list style, else FINAL2's structured list. */
export function textListOf(layer: SceneLayer): {
  list: ListStyle;
  levels: number[];
  checked: boolean[];
  bullet?: 'disc' | 'circle' | 'square';
  indent?: number;
  spacing?: number;
} {
  const own = parseListStyle(string(layer, 'listStyle'));
  const engine = textStyleOf(layer).engine;
  if (own === 'none' && engine?.list && !engine.table)
    return {
      list: engine.list.kind === 'numbered' ? 'number' : 'bullet',
      levels: (engine.list.levels ?? []).map((level) => level - 1),
      checked: [],
      ...(engine.list.bullet ? { bullet: engine.list.bullet } : {}),
      ...(engine.list.indent !== undefined
        ? { indent: engine.list.indent }
        : {}),
      ...(engine.list.spacing !== undefined
        ? { spacing: engine.list.spacing }
        : {}),
    };
  return {
    list: own,
    levels: parseListLevels(string(layer, 'listLevels')),
    checked: parseListChecked(string(layer, 'listChecked')),
  };
}

export interface TextBox {
  readonly width: number;
  readonly height: number;
  readonly mode: TextBoxMode;
  readonly layout: RichLayout;
  readonly style: TextStyle;
  readonly fontSize: number;
  readonly color: string;
  /** FINAL3 Curve: the curve amount and how far curved ends move. */
  readonly curve: number;
  readonly curveDrop: number;
}
export const DEFAULT_TEXT_COLOR = '#edece8';
/** The font size of a text layer (32 when unset). */
export const fontSizeOf = (layer: SceneLayer) =>
  Math.min(Math.max(numeric(layer, 'fontSize') ?? 32, 1), 4096);

/**
 * The laid-out text and the box it needs. `width` overrides a fixed box's
 * width (a side-handle drag in progress).
 */
export function textBoxOf(
  layer: SceneLayer,
  options: { width?: number; measure?: TextMeasurer; text?: string } = {},
): TextBox {
  const measure = options.measure ?? measurer;
  const text = options.text ?? string(layer, 'text') ?? layer.name;
  const style = textStyleOf(layer);
  const fontSize = fontSizeOf(layer);
  const fill = layer.properties.fill;
  const color =
    fill?.type === 'color' ? fill.value.slice(0, 7) : DEFAULT_TEXT_COLOR;
  const mode = options.width !== undefined ? 'fixed' : textBoxMode(layer);
  const storedWidth = numeric(layer, 'width');
  // An old unwrapped layer (no `textBox` yet) keeps the box it was stored
  // with, never smaller than its text, so it is picked, outlined and
  // selected exactly as before FINAL3; a side handle or its double-click
  // gives it a FINAL3 box.
  const legacy =
    options.width === undefined &&
    string(layer, 'textBox') === undefined &&
    !flag(layer, 'textWrap') &&
    storedWidth !== undefined &&
    numeric(layer, 'height') !== undefined;
  const width =
    mode === 'fixed' ? Math.max(1, options.width ?? storedWidth ?? 360) : null;
  const curve = Math.max(-100, Math.min(100, numeric(layer, 'textCurve') ?? 0));
  const key =
    measure === measurer
      ? JSON.stringify([
          epoch,
          layer.id,
          text,
          width,
          fontSize,
          color,
          curve,
          string(layer, 'textRuns'),
          string(layer, 'listStyle'),
          string(layer, 'listLevels'),
          string(layer, 'listChecked'),
          style,
          numeric(layer, 'height'),
          textHeightFixed(layer),
          legacy,
        ])
      : null;
  const hit = key ? cache.get(key) : undefined;
  if (hit) return hit;
  const { list, levels, checked, ...structured } = textListOf(layer);
  const layout = layoutRich(
    text,
    parseRuns(string(layer, 'textRuns'), text.length),
    list,
    { style, size: fontSize, color },
    width,
    measure,
    {
      levels,
      checked,
      direction: style.engine?.direction ?? 'auto',
      ...structured,
    },
  );
  const content = Math.max(
    fontSize * 0.25,
    ...layout.lines.map((line) => line.width + line.indent),
  );
  const drop = curve ? curveDrop(curve, content) : 0;
  const lines = Math.max(
    layout.height + drop,
    fontSize * style.lineHeight * 0.5,
  );
  const box: TextBox = Object.freeze({
    width:
      width ??
      (legacy && mode === 'auto'
        ? Math.max(storedWidth!, Math.ceil(content * 100) / 100)
        : Math.ceil(content * 100) / 100),
    height: textHeightFixed(layer)
      ? Math.max(1, numeric(layer, 'height') ?? layout.height)
      : legacy
        ? Math.max(numeric(layer, 'height')!, lines)
        : lines,
    mode,
    layout,
    style,
    fontSize,
    color,
    curve,
    curveDrop: drop,
  });
  if (key) {
    if (cache.size > 2000) cache.clear();
    cache.set(key, box);
  }
  return box;
}
