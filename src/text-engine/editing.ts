// FINAL3 T2: the pure text-editing model behind the on-canvas editor:
// IME composition (Hindi, Devanagari, Chinese, Japanese input), caret
// movement by grapheme cluster (a conjunct or a vowel sign never splits),
// plain-text paste and the list operations on paragraphs. DOM-free so it is
// unit-tested; the editor applies its results.
export interface TextModelState {
  readonly text: string;
  /** Selection as UTF-16 offsets [anchor, focus]. */
  readonly selection: readonly [number, number];
}

let segmenter: Intl.Segmenter | null | undefined;
/** Grapheme cluster boundaries of `text` (0 and text.length included). */
export function clusterBoundaries(text: string): number[] {
  if (segmenter === undefined)
    segmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  const bounds = [0];
  if (segmenter)
    for (const part of segmenter.segment(text))
      bounds.push(part.index + part.segment.length);
  else {
    let at = 0;
    for (const point of Array.from(text)) bounds.push((at += point.length));
  }
  if (bounds.at(-1) !== text.length) bounds.push(text.length);
  return [...new Set(bounds)];
}
/** The caret one cluster left (-1) or right (+1) of `index`. */
export function moveCaret(text: string, index: number, direction: -1 | 1) {
  const bounds = clusterBoundaries(text);
  if (direction > 0) return bounds.find((b) => b > index) ?? text.length;
  return [...bounds].reverse().find((b) => b < index) ?? 0;
}
/** Snaps an offset onto the nearest cluster boundary at or before it. */
export function snapToCluster(text: string, index: number) {
  return [...clusterBoundaries(text)].reverse().find((b) => b <= index) ?? 0;
}

/** Replaces the selection with `insert`; the caret lands after it. */
export function replaceSelection(
  state: TextModelState,
  insert: string,
): TextModelState {
  const [anchor, focus] = state.selection;
  const from = Math.max(0, Math.min(anchor, focus, state.text.length));
  const to = Math.min(state.text.length, Math.max(anchor, focus));
  const caret = from + insert.length;
  return {
    text: state.text.slice(0, from) + insert + state.text.slice(to),
    selection: [caret, caret],
  };
}

/**
 * IME composition: the text and selection when composing started, and the
 * final committed string. The result is exactly the start with the
 * selection replaced once — never doubled, never lost — whatever the
 * intermediate updates showed.
 */
export class Composition {
  #start: TextModelState | null = null;
  #data = '';
  get active() {
    return this.#start !== null;
  }
  /** The preview text while composing (for the live canvas preview). */
  get preview(): TextModelState | null {
    return this.#start ? replaceSelection(this.#start, this.#data) : null;
  }
  start(state: TextModelState) {
    this.#start = state;
    this.#data = '';
  }
  update(data: string) {
    if (this.#start) this.#data = data;
  }
  /** Ends composing with the committed `data`; null when not composing. */
  end(data: string): TextModelState | null {
    if (!this.#start) return null;
    const result = replaceSelection(this.#start, data.normalize('NFC'));
    this.#start = null;
    this.#data = '';
    return result;
  }
  cancel() {
    this.#start = null;
    this.#data = '';
  }
}

/**
 * Plain text from the clipboard: foreign HTML is ignored, line endings are
 * normalised, a line separator becomes a soft break and control characters
 * (but tab) are removed.
 */
export function plainPaste(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u2029/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

/** The paragraph index of every offset (paragraphs split on newlines). */
export function paragraphAt(text: string, offset: number): number {
  let count = 0;
  for (let i = 0; i < Math.min(offset, text.length); i++)
    if (text[i] === '\n') count++;
  return count;
}
/** The paragraphs a selection touches (at least the caret's). */
export function selectedParagraphs(
  text: string,
  selection: readonly [number, number],
): [number, number] {
  const from = Math.min(selection[0], selection[1]),
    to = Math.max(selection[0], selection[1]);
  return [paragraphAt(text, from), paragraphAt(text, to)];
}
/** Paragraph count (an empty text is one empty paragraph). */
export const paragraphCount = (text: string) => text.split('\n').length;

/**
 * FINAL3 T3: turning a list on. Trailing empty paragraphs (a stale empty
 * line) are removed first, so one line gives one bullet; paragraphs outside
 * `range` (a selection while editing) are left out of the list (level −1).
 */
export function listOn(
  text: string,
  range: [number, number] | null,
): { text: string; levels: number[] } {
  const trimmed = text.replace(/\n+$/u, '');
  const count = paragraphCount(trimmed);
  const levels = Array.from({ length: count }, (_, index) =>
    !range || (index >= range[0] && index <= range[1]) ? 0 : -1,
  );
  return { text: trimmed, levels };
}
/** Tab and Shift+Tab: the level of the paragraphs in `range` (0 to 3). */
export function indentLevels(
  levels: readonly number[],
  count: number,
  range: [number, number],
  delta: 1 | -1,
): number[] {
  return Array.from({ length: count }, (_, index) => {
    const level = levels[index] ?? 0;
    if (index < range[0] || index > range[1] || level < 0) return level;
    return Math.max(0, Math.min(3, level + delta));
  });
}
