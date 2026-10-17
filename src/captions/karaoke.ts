// CAP (D-270): karaoke word highlighting from word timings. The highlight
// is the text layer's `textRuns` string property (rich text, J4) animated
// with keyframes: strings hold until the next keyframe (D-070), so at each
// word's start the runs colour the spoken words and underline the current
// one. Only colour and underline change, so the layout never moves between
// words. Pure and deterministic.
import type { Command, Property } from '../core';
import type { CaptionCue } from '../speech/captions';
import type { CaptionStyle } from './styles';

export interface KaraokeWord {
  readonly text: string;
  /** Scene seconds. */
  readonly start: number;
  readonly end: number;
  /** UTF-16 range [start, end) of the word in the layer's text. */
  readonly range: readonly [number, number];
}
export interface KaraokeRun {
  readonly start: number;
  readonly end: number;
  readonly color: string;
  readonly underline?: true;
}
export interface KaraokeStep {
  /** Scene seconds. */
  readonly time: number;
  readonly runs: readonly KaraokeRun[];
}

/**
 * The cue's words located in `text` (in order; a word not found is
 * skipped), with times shifted by `offset` (a scene's start).
 */
export function karaokeWords(
  cue: CaptionCue,
  text: string,
  offset = 0,
): KaraokeWord[] {
  const words: KaraokeWord[] = [];
  let cursor = 0;
  for (const word of cue.words) {
    const at = text.indexOf(word.text, cursor);
    if (at < 0) continue;
    cursor = at + word.text.length;
    words.push({
      text: word.text,
      start: word.start - offset,
      end: word.end - offset,
      range: [at, cursor],
    });
  }
  return words;
}

/**
 * The highlight steps: before the first word nothing is highlighted; from
 * each word's start the words so far take the highlight colour and the
 * current word is underlined; after the last word's end everything spoken
 * stays coloured without an underline.
 */
export function karaokeSteps(
  cue: CaptionCue,
  text: string,
  style: Pick<CaptionStyle, 'highlightColor' | 'color'>,
  offset = 0,
): KaraokeStep[] {
  const words = karaokeWords(cue, text, offset);
  if (!words.length) return [];
  // Every step styles the whole text, so the layout (rich text) never
  // switches path: spoken words highlighted, the rest in the base colour.
  const spoken = (count: number, current: number | null): KaraokeRun[] => {
    const runs: KaraokeRun[] = words.slice(0, count).map((word, i) => ({
      start: word.range[0],
      end: word.range[1],
      color: style.highlightColor,
      ...(i === current ? { underline: true as const } : {}),
    }));
    const reached = count ? words[count - 1]!.range[1] : 0;
    if (reached < text.length)
      runs.push({ start: reached, end: text.length, color: style.color });
    return runs;
  };
  const steps: KaraokeStep[] = [
    { time: Math.max(0, cue.start - offset), runs: spoken(0, null) },
  ];
  words.forEach((word, i) =>
    steps.push({ time: Math.max(0, word.start), runs: spoken(i + 1, i) }),
  );
  const last = words.at(-1)!;
  steps.push({ time: Math.max(0, last.end), runs: spoken(words.length, null) });
  // Keyframe times must rise: a later step at the same time wins.
  const byTime = new Map<number, KaraokeStep>();
  for (const step of steps) byTime.set(step.time, step);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** The animated `textRuns` property for a caption's text layer. */
export function karaokeProperty(
  cue: CaptionCue,
  text: string,
  style: Pick<CaptionStyle, 'highlightColor' | 'color'>,
  offset = 0,
): Property {
  const steps = karaokeSteps(cue, text, style, offset);
  const value = (runs: readonly KaraokeRun[]) =>
    runs.length ? JSON.stringify(runs) : '';
  return {
    type: 'string',
    value: steps.length ? value(steps[0]!.runs) : '',
    animated: steps.length > 0,
    keyframes: steps.map((step) => ({
      time: step.time,
      value: value(step.runs),
      easing: 'hold' as const,
    })),
    constraints: [],
  };
}

/** The command that (re)sets a caption layer's karaoke highlight. */
export function karaokeCommands(
  compositionId: string,
  layerId: string,
  cue: CaptionCue,
  text: string,
  style: Pick<CaptionStyle, 'highlightColor' | 'color'>,
  offset = 0,
): Command[] {
  return [
    {
      type: 'SET_PROPERTY',
      compositionId,
      layerId,
      target: { kind: 'property', key: 'textRuns' },
      property: karaokeProperty(cue, text, style, offset),
    },
  ];
}
