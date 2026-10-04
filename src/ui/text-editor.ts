// J4 (TXT-002, TXT-003, TXT-004, TXT-023, TXT-024): on-canvas text editing.
// A contenteditable box is laid exactly over the text layer (the same world
// and view transform), and the canvas leaves that layer's text out while it
// is open. The browser handles the caret, selection, typing and input
// methods (IME); the editor keeps its own model (the text and one style
// override per character) and its own undo stack for the session. Leaving
// the editor (Escape or a click elsewhere) commits the text and its runs as
// one undo step.
import {
  multiplyMatrices,
  worldTransform,
  type Command,
  type EditorEngine,
} from '../core';
import { t } from '../i18n';
import {
  locateLayer,
  numericProperty,
  type SceneLayer,
} from '../render/adapter';
import type { Viewport } from '../render/canvas';
import {
  formatRuns,
  isKnownFamily,
  layoutRich,
  parseListStyle,
  parseRuns,
  type ListStyle,
  type TextRun,
} from '../render/rich-text';
import { fallbackTextMeasure, layoutParagraphs } from '../render/text-layout';
import {
  SYSTEM_FONTS,
  textStyleOf,
  type TextStyle,
} from '../render/text-style';
import type { EditorSession } from './session';

/** The style keys a run can override. */
export interface Override {
  weight?: number;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  size?: number;
  family?: string;
}
export type OverrideKey = keyof Override;
const KEYS: readonly OverrideKey[] = [
  'weight',
  'italic',
  'underline',
  'strike',
  'color',
  'size',
  'family',
];
interface Model {
  readonly text: string;
  readonly styles: readonly Override[];
  /** Selection as character offsets (anchor, focus). */
  readonly selection: readonly [number, number];
}
/** The resolved style of the selection; `null` for a mixed value. */
export interface SelectionStyle {
  readonly weight: number | null;
  readonly italic: boolean | null;
  readonly underline: boolean | null;
  readonly strike: boolean | null;
  readonly color: string | null;
  readonly size: number | null;
  readonly family: string | null;
}
interface Base {
  readonly style: TextStyle;
  readonly size: number;
  readonly color: string;
}

const same = (a: Override, b: Override) =>
  KEYS.every((key) => a[key] === b[key]);
const clean = (value: Override): Override => {
  const result: Override = {};
  for (const key of KEYS)
    if (value[key] !== undefined)
      (result as Record<string, unknown>)[key] = value[key];
  return result;
};
export function stylesFromRuns(
  length: number,
  runs: readonly TextRun[],
): Override[] {
  const styles: Override[] = Array.from({ length }, () => ({}));
  for (const run of runs) {
    const { start, end, ...rest } = run;
    for (let index = start; index < Math.min(end, length); index++)
      styles[index] = clean(rest);
  }
  return styles;
}
export function runsFromStyles(styles: readonly Override[]): TextRun[] {
  const runs: TextRun[] = [];
  let start = 0;
  for (let index = 1; index <= styles.length; index++)
    if (index === styles.length || !same(styles[index]!, styles[start]!)) {
      const style = clean(styles[start]!);
      if (Object.keys(style).length) runs.push({ start, end: index, ...style });
      start = index;
    }
  return runs;
}

const toHex = (value: string): string | undefined => {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return undefined;
  const parts = match[1]!
    .split(/[ ,/]+/)
    .filter(Boolean)
    .map(Number);
  if (
    parts.length < 3 ||
    parts.slice(0, 3).some((part) => !Number.isFinite(part))
  )
    return undefined;
  return `#${parts
    .slice(0, 3)
    .map((part) => Math.round(part).toString(16).padStart(2, '0'))
    .join('')}`;
};
const familyOf = (value: string): string | undefined => {
  const first = value
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  return first && isKnownFamily(first) ? first : undefined;
};
const genericOf = (family: string) =>
  SYSTEM_FONTS.find(([name]) => name === family)?.[1] ?? 'sans-serif';
const cssFamily = (family: string) => `"${family}", ${genericOf(family)}`;

/** The inline override an element (and its tag) carries, outside the root. */
function overrideOf(element: Element | null, root: Element): Override {
  const chain: Element[] = [];
  for (let at = element; at && at !== root; at = at.parentElement)
    chain.unshift(at);
  const result: Override = {};
  for (const node of chain) {
    const tag = node.tagName;
    if (tag === 'B' || tag === 'STRONG') result.weight = 700;
    if (tag === 'I' || tag === 'EM') result.italic = true;
    if (tag === 'U') result.underline = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') result.strike = true;
    if (tag === 'FONT') {
      const color = node.getAttribute('color');
      if (color && toHex(color)) result.color = toHex(color)!;
    }
    if (!(node instanceof HTMLElement)) continue;
    const style = node.style;
    if (style.fontWeight) {
      const weight =
        style.fontWeight === 'bold'
          ? 700
          : style.fontWeight === 'normal'
            ? 400
            : Number(style.fontWeight);
      if (Number.isFinite(weight)) result.weight = weight;
    }
    if (style.fontStyle)
      result.italic =
        style.fontStyle === 'italic' || style.fontStyle === 'oblique';
    const lines = style.textDecorationLine || style.textDecoration;
    if (lines) {
      if (lines.includes('underline')) result.underline = true;
      if (lines.includes('line-through')) result.strike = true;
      if (lines === 'none') {
        result.underline = false;
        result.strike = false;
      }
    }
    if (style.color && toHex(style.color)) result.color = toHex(style.color)!;
    if (style.fontSize.endsWith('px')) {
      const size = parseFloat(style.fontSize);
      if (Number.isFinite(size) && size > 0) result.size = size;
    }
    if (style.fontFamily && familyOf(style.fontFamily))
      result.family = familyOf(style.fontFamily)!;
  }
  return result;
}
/** Drops overrides equal to the layer's own style (Chrome copies computed styles). */
function relative(value: Override, base: Base): Override {
  const result: Override = {};
  if (value.weight !== undefined && value.weight !== base.style.weight)
    result.weight = value.weight;
  if (value.italic !== undefined && value.italic !== base.style.italic)
    result.italic = value.italic;
  if (value.underline !== undefined && value.underline !== base.style.underline)
    result.underline = value.underline;
  if (value.strike !== undefined && value.strike !== base.style.strike)
    result.strike = value.strike;
  if (value.color !== undefined && value.color !== base.color.toLowerCase())
    result.color = value.color;
  if (value.size !== undefined && Math.abs(value.size - base.size) > 0.01)
    result.size = Math.round(value.size * 100) / 100;
  if (value.family !== undefined && value.family !== base.style.family)
    result.family = value.family;
  return result;
}

/** Text and styles from a DOM fragment (paragraph divs, spans, <br>). */
function readDom(
  root: Element,
  base: Base,
): { text: string; styles: Override[] } {
  let text = '';
  const styles: Override[] = [];
  const paragraphs: Node[][] = [];
  let loose: Node[] = [];
  for (const child of [...root.childNodes]) {
    if (
      child instanceof HTMLElement &&
      (child.tagName === 'DIV' || child.tagName === 'P')
    ) {
      if (loose.length) paragraphs.push(loose);
      loose = [];
      paragraphs.push([child]);
    } else loose.push(child);
  }
  if (loose.length) paragraphs.push(loose);
  paragraphs.forEach((nodes, index) => {
    if (index) {
      text += '\n';
      styles.push({});
    }
    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = (node.textContent ?? '').replace(/ /g, ' ');
        const look = relative(overrideOf(node.parentElement, root), base);
        for (let i = 0; i < value.length; i++) styles.push(look);
        text += value;
        return;
      }
      if (node instanceof HTMLElement && node.tagName === 'BR') {
        // A trailing <br> only holds an empty line open.
        if (node.nextSibling || node.parentElement?.childNodes.length === 1) {
          if (node.parentElement?.childNodes.length === 1) return;
          text += '\n';
          styles.push({});
        }
        return;
      }
      node.childNodes.forEach(visit);
    };
    nodes.forEach(visit);
  });
  return { text, styles };
}

/** Plain or rich clipboard content as text and styles (null: the caret's). */
function readClipboard(
  data: DataTransfer,
  base: Base,
): { text: string; styles: (Override | null)[] } {
  const html = data.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Block elements become paragraphs (direct children of the root).
    const holder = doc.createElement('div');
    const blocks = [
      ...doc.body.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6'),
    ].filter((block) => !block.querySelector('p,div,li,h1,h2,h3,h4,h5,h6'));
    if (blocks.length)
      for (const block of blocks) {
        const div = doc.createElement('div');
        div.append(
          ...[...block.childNodes].map((node) => node.cloneNode(true)),
        );
        holder.append(div);
      }
    else holder.append(...[...doc.body.childNodes]);
    const result = readDom(holder, base);
    if (result.text.trim()) return result;
  }
  const plain = data.getData('text/plain').replace(/\r\n?/g, '\n');
  return {
    text: plain,
    styles: Array.from({ length: plain.length }, () => null),
  };
}

export interface TextEditor {
  readonly layerId: string | null;
  start(
    layerId: string,
    options?: { selectAll?: boolean; at?: { x: number; y: number } },
  ): void;
  /** Commits the text and runs (one undo step) and closes the editor. */
  finish(): void;
  /** Lays the editor over its layer again (after a view or layer change). */
  sync(): void;
  /** The resolved style at the selection (null for a mixed value). */
  selectionStyle(): SelectionStyle | null;
  /** Applies a style to the selection (the whole text when it is empty). */
  format(key: OverrideKey, value: Override[OverrideKey] | 'toggle'): void;
  onChange(listener: () => void): () => void;
}

/** The editor in use, for the toolbar and right panel (one at a time). */
let current: TextEditor | null = null;
export const textEditorFor = (layerId: string | null | undefined) =>
  current && layerId && current.layerId === layerId ? current : null;

export function mountTextEditor(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  engine: EditorEngine,
  session: EditorSession,
  viewport: () => Viewport,
  report: (error: unknown) => void,
): TextEditor {
  const box = document.createElement('div');
  box.className = 'text-editor';
  box.contentEditable = 'true';
  box.spellcheck = false;
  box.setAttribute('role', 'textbox');
  box.setAttribute('aria-multiline', 'true');
  box.setAttribute('aria-label', t('text.editing'));
  box.hidden = true;
  host.append(box);
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((listener) => listener());
  let layerId: string | null = null;
  let compositionId = '';
  let base: Base | null = null;
  let original: { text: string; runs: string; list: ListStyle } | null = null;
  let list: ListStyle = 'none';
  let model: Model = { text: '', styles: [], selection: [0, 0] };
  let undo: Model[] = [];
  let redo: Model[] = [];
  let lastSnapshot = 0;
  let composing = false;
  /** The last selection inside the editor, kept while a toolbar has focus. */
  let saved: [number, number] = [0, 0];

  const sameAsOpened = () =>
    !!original &&
    model.text === original.text &&
    formatRuns(runsFromStyles(model.styles)) === original.runs &&
    list === original.list;
  const layer = (): SceneLayer | null =>
    layerId
      ? (locateLayer(session.source.composition.layers, layerId)?.layer ?? null)
      : null;
  const baseOf = (item: SceneLayer): Base => {
    const fill = item.properties.fill;
    return {
      style: textStyleOf(item),
      size: Math.min(numericProperty(item, 'fontSize') ?? 32, 4096),
      color:
        fill?.type === 'color'
          ? fill.value.slice(0, 7).toLowerCase()
          : '#edece8',
    };
  };

  // --- DOM <-> offsets ------------------------------------------------------
  const paragraphsOf = () =>
    [...box.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
  const offsetOf = (node: Node, offset: number): number => {
    let total = 0;
    const paragraphs = paragraphsOf();
    for (const [index, paragraph] of paragraphs.entries()) {
      if (index) total += 1;
      if (paragraph === node || paragraph.contains(node)) {
        if (node === paragraph) {
          let count = 0;
          for (let i = 0; i < offset; i++)
            count += paragraph.childNodes[i]?.textContent?.length ?? 0;
          return total + count;
        }
        const walker = document.createTreeWalker(
          paragraph,
          NodeFilter.SHOW_TEXT,
        );
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
          if (text === node) return total + offset;
          if (node.contains(text)) {
            // An element container: count the texts before the offset child.
            const before = node.childNodes[offset];
            if (before && (before === text || before.contains(text)))
              return total;
          }
          total += text.textContent?.length ?? 0;
        }
        return total;
      }
      total += paragraph.textContent?.length ?? 0;
    }
    return model.text.length;
  };
  const pointAt = (index: number): [Node, number] => {
    let remaining = index;
    const paragraphs = paragraphsOf();
    for (const [at, paragraph] of paragraphs.entries()) {
      const length = paragraph.textContent?.length ?? 0;
      if (remaining <= length) {
        const walker = document.createTreeWalker(
          paragraph,
          NodeFilter.SHOW_TEXT,
        );
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
          const size = text.textContent?.length ?? 0;
          if (remaining <= size) return [text, remaining];
          remaining -= size;
        }
        return [paragraph, 0];
      }
      remaining -= length + (at < paragraphs.length - 1 ? 1 : 0);
    }
    const last = paragraphs.at(-1) ?? box;
    return [last, last.childNodes.length];
  };
  const readSelection = (): [number, number] | null => {
    const selection = document.getSelection();
    if (!selection?.anchorNode || !box.contains(selection.anchorNode))
      return null;
    return [
      offsetOf(selection.anchorNode, selection.anchorOffset),
      offsetOf(selection.focusNode!, selection.focusOffset),
    ];
  };
  const writeSelection = ([anchor, focus]: readonly [number, number]) => {
    const selection = document.getSelection();
    if (!selection) return;
    const [aNode, aOffset] = pointAt(anchor);
    const [fNode, fOffset] = pointAt(focus);
    selection.setBaseAndExtent(aNode, aOffset, fNode, fOffset);
  };

  // --- Model -> DOM ---------------------------------------------------------
  const css = (style: Override): string => {
    const parts: string[] = [];
    if (style.weight !== undefined) parts.push(`font-weight:${style.weight}`);
    if (style.italic !== undefined)
      parts.push(`font-style:${style.italic ? 'italic' : 'normal'}`);
    if (style.underline !== undefined || style.strike !== undefined) {
      const underline = style.underline ?? base!.style.underline;
      const strike = style.strike ?? base!.style.strike;
      parts.push(
        `text-decoration-line:${[underline ? 'underline' : '', strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none'}`,
      );
    }
    if (style.color !== undefined) parts.push(`color:${style.color}`);
    if (style.size !== undefined) parts.push(`font-size:${style.size}px`);
    if (style.family !== undefined)
      parts.push(`font-family:${cssFamily(style.family)}`);
    return parts.join(';');
  };
  const render = () => {
    const fragment = document.createDocumentFragment();
    let start = 0;
    for (const paragraph of model.text.split('\n')) {
      const div = document.createElement('div');
      let from = start;
      const end = start + paragraph.length;
      for (let index = start + 1; index <= end; index++)
        if (index === end || !same(model.styles[index]!, model.styles[from]!)) {
          const piece = model.text.slice(from, index);
          const style = css(model.styles[from] ?? {});
          if (style) {
            const span = document.createElement('span');
            span.setAttribute('style', style);
            span.textContent = piece;
            div.append(span);
          } else div.append(document.createTextNode(piece));
          from = index;
        }
      if (!paragraph) div.append(document.createElement('br'));
      fragment.append(div);
      start = end + 1;
    }
    box.replaceChildren(fragment);
  };
  const applyBase = () => {
    if (!base) return;
    const style = box.style;
    style.fontFamily = cssFamily(base.style.family);
    style.fontWeight = String(base.style.weight);
    style.fontStyle = base.style.italic ? 'italic' : 'normal';
    style.fontSize = `${base.size}px`;
    style.lineHeight = String(base.style.lineHeight);
    style.letterSpacing = `${base.style.letterSpacing}px`;
    style.color = base.color;
    style.textAlign = base.style.align;
    style.textDecorationLine =
      [
        base.style.underline ? 'underline' : '',
        base.style.strike ? 'line-through' : '',
      ]
        .filter(Boolean)
        .join(' ') || 'none';
    style.textTransform =
      base.style.textCase === 'upper'
        ? 'uppercase'
        : base.style.textCase === 'lower'
          ? 'lowercase'
          : base.style.textCase === 'title'
            ? 'capitalize'
            : 'none';
    style.setProperty(
      '--paragraph-spacing',
      `${base.style.paragraphSpacing}px`,
    );
    box.dataset.list = list;
    box.dataset.anchor = base.style.anchor;
  };

  // --- Snapshots (the session's own undo) ---------------------------------
  const snapshot = (force = false) => {
    const now = performance.now();
    if (!force && now - lastSnapshot < 800 && undo.length) return;
    lastSnapshot = now;
    undo.push(model);
    if (undo.length > 200) undo.shift();
    redo = [];
  };
  const restore = (next: Model) => {
    model = next;
    render();
    writeSelection(model.selection);
    changed();
  };
  const readModel = () => {
    if (!base) return;
    const { text, styles } = readDom(box, base);
    model = { text, styles, selection: readSelection() ?? model.selection };
  };

  // --- Geometry ------------------------------------------------------------
  const sync = () => {
    const item = layer();
    if (!item || !layerId) return;
    const view = viewport();
    const world = worldTransform(session.source.composition, layerId);
    const [a, b, c, d, e, f] = multiplyMatrices(view.matrix, world.matrix);
    const canvasBox = canvas.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    const width = numericProperty(item, 'width') ?? 360;
    const height = numericProperty(item, 'height') ?? 100;
    const wrap =
      item.properties.textWrap?.type === 'boolean' &&
      item.properties.textWrap.value;
    box.style.left = `${canvasBox.left - hostBox.left + host.scrollLeft}px`;
    box.style.top = `${canvasBox.top - hostBox.top + host.scrollTop}px`;
    box.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
    box.style.width = wrap ? `${width}px` : 'max-content';
    box.style.minWidth = `${width}px`;
    box.style.minHeight = `${height}px`;
    box.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
    box.style.opacity = String(world.opacity);
  };

  // --- Events ----------------------------------------------------------------
  box.addEventListener('beforeinput', () => {
    if (!composing) snapshot();
  });
  box.addEventListener('input', (event) => {
    if (composing || (event as InputEvent).isComposing) return;
    readModel();
    changed();
  });
  box.addEventListener('compositionstart', () => {
    composing = true;
    snapshot(true);
  });
  box.addEventListener('compositionend', () => {
    composing = false;
    readModel();
    changed();
  });
  const onSelection = () => {
    const selection = readSelection();
    if (!selection) return;
    if (selection[0] === saved[0] && selection[1] === saved[1]) return;
    saved = selection;
    model = { ...model, selection };
    changed();
  };
  document.addEventListener('selectionchange', onSelection);
  box.addEventListener('keydown', (event) => {
    if (event.isComposing || composing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      editor.finish();
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && (key === 'z' || key === 'y')) {
      event.preventDefault();
      event.stopPropagation();
      readModel();
      const redoing = key === 'y' || event.shiftKey;
      const from = redoing ? redo : undo;
      const to = redoing ? undo : redo;
      const next = from.pop();
      if (next) {
        to.push(model);
        restore(next);
      } else if (!redoing && !redo.length && sameAsOpened()) {
        // Nothing typed in this session: Undo leaves the editor and undoes
        // the project's last step (for example the text box just added).
        editor.finish();
        engine.undo();
        return;
      }
      lastSnapshot = 0;
      return;
    }
    if (mod && (key === 'b' || key === 'i' || key === 'u')) {
      event.preventDefault();
      event.stopPropagation();
      editor.format(
        key === 'b' ? 'weight' : key === 'i' ? 'italic' : 'underline',
        'toggle',
      );
    }
    // Other keys type: the global shortcuts already skip editable text.
    event.stopPropagation();
  });
  box.addEventListener('paste', (event) => {
    if (!event.clipboardData || !base) return;
    event.preventDefault();
    readModel();
    const pasted = readClipboard(event.clipboardData, base);
    const [anchor, focus] = model.selection;
    const from = Math.min(anchor, focus),
      to = Math.max(anchor, focus);
    // Plain text takes the style at the caret.
    const at = model.styles[Math.max(0, from - 1)] ?? {};
    const styles = pasted.styles.map((style) =>
      style ? relative(style, base!) : at,
    );
    snapshot(true);
    const caret = from + pasted.text.length;
    restore({
      text: model.text.slice(0, from) + pasted.text + model.text.slice(to),
      styles: [
        ...model.styles.slice(0, from),
        ...styles,
        ...model.styles.slice(to),
      ],
      selection: [caret, caret],
    });
  });
  // A click elsewhere (not a toolbar, popover or side panel) commits.
  const outside = (event: PointerEvent) => {
    if (!layerId) return;
    const target = event.target as Element | null;
    if (
      !target ||
      box.contains(target) ||
      target.closest(
        '#context-toolbar,.popover,.toolbar-popover,[data-deep-panel],#right-panel-content,.right-panel,.color-picker,.modal-dialog',
      )
    )
      return;
    editor.finish();
  };
  document.addEventListener('pointerdown', outside, true);

  const resolvedStyle = (index: number) => {
    const override = model.styles[index] ?? {};
    return {
      weight: override.weight ?? base!.style.weight,
      italic: override.italic ?? base!.style.italic,
      underline: override.underline ?? base!.style.underline,
      strike: override.strike ?? base!.style.strike,
      color: override.color ?? base!.color,
      size: override.size ?? base!.size,
      family: override.family ?? base!.style.family,
    };
  };
  const range = (): [number, number] => {
    const [anchor, focus] = model.selection;
    return anchor === focus
      ? [0, model.text.length]
      : [Math.min(anchor, focus), Math.max(anchor, focus)];
  };

  const editor: TextEditor = {
    get layerId() {
      return layerId;
    },
    start(id, options = {}) {
      if (layerId === id) return;
      if (layerId) editor.finish();
      const item = locateLayer(session.source.composition.layers, id)?.layer;
      if (!item || item.type !== 'text') return;
      layerId = id;
      compositionId = session.source.composition.id;
      base = baseOf(item);
      const property = (key: string) => {
        const value = item.properties[key];
        return value?.type === 'string' ? value.value : '';
      };
      const text =
        item.properties.text?.type === 'string'
          ? item.properties.text.value
          : item.name;
      list = parseListStyle(property('listStyle'));
      original = { text, runs: property('textRuns'), list };
      model = {
        text,
        styles: stylesFromRuns(
          text.length,
          parseRuns(property('textRuns'), text.length),
        ),
        selection: options.selectAll
          ? [0, text.length]
          : [text.length, text.length],
      };
      undo = [];
      redo = [];
      current = editor;
      applyBase();
      render();
      box.hidden = false;
      sync();
      box.focus({ preventScroll: true });
      const point = options.at;
      const caret =
        point && document.caretPositionFromPoint?.(point.x, point.y);
      if (caret && box.contains(caret.offsetNode)) {
        const offset = offsetOf(caret.offsetNode, caret.offset);
        model = { ...model, selection: [offset, offset] };
      }
      writeSelection(model.selection);
      saved = [...model.selection] as [number, number];
      session.setEditingText(id);
      changed();
    },
    finish() {
      if (!layerId || !base) return;
      if (!composing) readModel();
      const item = layer();
      layerId = null;
      current = null;
      box.hidden = true;
      box.replaceChildren();
      session.setEditingText(null);
      if (
        document.activeElement === box ||
        !document.activeElement ||
        document.activeElement === document.body
      )
        canvas.focus({ preventScroll: true });
      const runs = formatRuns(runsFromStyles(model.styles));
      if (
        item &&
        original &&
        (model.text !== original.text || runs !== original.runs)
      )
        try {
          engine.commands.transaction(
            'Edit text',
            commitCommands(
              item,
              model.text,
              runs,
              list,
              base,
              session,
              compositionId,
            ),
          );
        } catch (error) {
          report(error);
        }
      base = null;
      original = null;
      changed();
    },
    sync,
    selectionStyle() {
      if (!layerId || !base) return null;
      const [anchor, focus] = saved;
      const from = Math.min(anchor, focus),
        to = Math.max(anchor, focus);
      const indices =
        from === to
          ? [Math.max(0, from - 1)]
          : Array.from({ length: to - from }, (_, i) => from + i);
      const looks = indices
        .filter((i) => i < model.text.length || !model.text.length)
        .map(resolvedStyle);
      if (!looks.length) looks.push(resolvedStyle(0));
      const pick = <K extends keyof SelectionStyle>(key: K) =>
        looks.every((look) => look[key] === looks[0]![key])
          ? (looks[0]![key] as SelectionStyle[K])
          : null;
      return {
        weight: pick('weight'),
        italic: pick('italic'),
        underline: pick('underline'),
        strike: pick('strike'),
        color: pick('color'),
        size: pick('size'),
        family: pick('family'),
      };
    },
    format(key, value) {
      if (!layerId || !base) return;
      readModel();
      model = { ...model, selection: saved };
      const [from, to] = range();
      let next = value;
      if (value === 'toggle') {
        const looks = Array.from({ length: to - from }, (_, i) =>
          resolvedStyle(from + i),
        );
        if (key === 'weight')
          next = looks.every((look) => look.weight >= 700) ? 400 : 700;
        else
          next = !looks.every(
            (look) => look[key as 'italic' | 'underline' | 'strike'],
          );
      }
      snapshot(true);
      const styles = model.styles.map((style, index) => {
        if (index < from || index >= to) return style;
        const updated: Override = { ...style, [key]: next };
        return relative(updated, base!);
      });
      restore({ ...model, styles });
      saved = [...model.selection] as [number, number];
      box.focus({ preventScroll: true });
      writeSelection(model.selection);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  // The layer's own style changed (alignment, spacing): restyle the box.
  session.onChange(() => {
    if (!layerId) return;
    if (session.source.composition.id !== compositionId) return editor.finish();
    const item = layer();
    if (!item || !session.selectedIds.includes(layerId)) return editor.finish();
    base = baseOf(item);
    const value = item.properties.listStyle;
    list = parseListStyle(value?.type === 'string' ? value.value : undefined);
    applyBase();
    sync();
  });
  return editor;
}

/** Commands that store an edit: text, runs, list and a box that fits. */
function commitCommands(
  item: SceneLayer,
  text: string,
  runs: string,
  list: ListStyle,
  base: Base,
  session: EditorSession,
  compositionId: string,
): Command[] {
  const commands: Command[] = [];
  const set = (key: string, value: string) => {
    const old = item.properties[key];
    if ((old?.type === 'string' ? old.value : '') === value && (old || !value))
      return;
    commands.push({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: item.id,
      target: { kind: 'property', key },
      property: {
        type: 'string',
        value,
        animated: false,
        keyframes: [],
        constraints: [],
      },
    } as Command);
  };
  set('text', text);
  set('textRuns', runs);
  // The box grows to fit the edited text (it never shrinks).
  const measure = session.source.measureText ?? fallbackTextMeasure;
  const wrap =
    item.properties.textWrap?.type === 'boolean' &&
    item.properties.textWrap.value;
  const width = numericProperty(item, 'width') ?? 360;
  const height = numericProperty(item, 'height') ?? 100;
  let needWidth = width,
    needHeight = height;
  if (runs || list !== 'none') {
    const layout = layoutRich(
      text,
      parseRuns(runs, text.length),
      list,
      base,
      wrap ? width : null,
      measure,
    );
    needHeight = layout.height;
    if (!wrap)
      needWidth = Math.max(
        ...layout.lines.map((line) => line.width + line.indent),
        0,
      );
  } else {
    const layout = layoutParagraphs(text, base.size, base.style);
    needHeight = layout.height;
    if (!wrap)
      needWidth = Math.max(
        ...layout.lines.map((line) => measure(line, base.size, base.style)),
        0,
      );
  }
  for (const [key, value, now] of [
    ['width', Math.ceil(needWidth), width],
    ['height', Math.ceil(needHeight), height],
  ] as const)
    if (value > now && Number.isFinite(value))
      commands.push({
        type: 'SET_PROPERTY',
        compositionId,
        layerId: item.id,
        target: { kind: 'property', key },
        property: {
          type: 'number',
          value,
          animated: false,
          keyframes: [],
          constraints: [],
        },
      } as Command);
  return commands;
}

/**
 * J4: applying a style to a whole text box (not while editing) also removes
 * that style from its runs, so the whole box shows it. Null when no run
 * overrides those keys.
 */
export function clearRunKeys(
  compositionId: string,
  layer: SceneLayer,
  keys: readonly OverrideKey[],
): Command | null {
  if (layer.type !== 'text') return null;
  const property = layer.properties.textRuns;
  const text =
    layer.properties.text?.type === 'string'
      ? layer.properties.text.value
      : layer.name;
  const runs = parseRuns(
    property?.type === 'string' ? property.value : undefined,
    text.length,
  );
  if (!runs.some((run) => keys.some((key) => run[key] !== undefined)))
    return null;
  const styles = stylesFromRuns(text.length, runs).map((style) => {
    const next = { ...style };
    for (const key of keys) delete next[key];
    return next;
  });
  return {
    type: 'SET_PROPERTY',
    compositionId,
    layerId: layer.id,
    target: { kind: 'property', key: 'textRuns' },
    property: {
      type: 'string',
      value: formatRuns(runsFromStyles(styles)),
      animated: false,
      keyframes: [],
      constraints: [],
    },
  } as Command;
}
/** The style keys a text style property stands for in runs. */
export const RUN_KEYS: Readonly<Record<string, readonly OverrideKey[]>> = {
  fontWeight: ['weight'],
  fontStyle: ['italic'],
  textDecoration: ['underline', 'strike'],
  fontFamily: ['family'],
  fontSize: ['size'],
  fill: ['color'],
};
/**
 * The resolved style of a whole text box: the layer's style unless every
 * character's run says otherwise (null for a mixed value). J5: the Bold
 * button shows the resolved weight, so a box made bold by its runs shows it.
 */
export function resolvedTextStyle(layer: SceneLayer): SelectionStyle {
  const base = textStyleOf(layer);
  const fill = layer.properties.fill;
  const color =
    fill?.type === 'color' ? fill.value.slice(0, 7).toLowerCase() : '#edece8';
  const size = Math.min(numericProperty(layer, 'fontSize') ?? 32, 4096);
  const text =
    layer.properties.text?.type === 'string'
      ? layer.properties.text.value
      : layer.name;
  const property = layer.properties.textRuns;
  const styles = stylesFromRuns(
    text.length,
    parseRuns(
      property?.type === 'string' ? property.value : undefined,
      text.length,
    ),
  ).filter((_, index) => !/\s/u.test(text[index]!));
  const looks = (styles.length ? styles : [{}]).map((style) => ({
    weight: style.weight ?? base.weight,
    italic: style.italic ?? base.italic,
    underline: style.underline ?? base.underline,
    strike: style.strike ?? base.strike,
    color: style.color ?? color,
    size: style.size ?? size,
    family: style.family ?? base.family,
  }));
  const pick = <K extends keyof SelectionStyle>(key: K) =>
    looks.every((look) => look[key] === looks[0]![key])
      ? (looks[0]![key] as SelectionStyle[K])
      : null;
  return {
    weight: pick('weight'),
    italic: pick('italic'),
    underline: pick('underline'),
    strike: pick('strike'),
    color: pick('color'),
    size: pick('size'),
    family: pick('family'),
  };
}
