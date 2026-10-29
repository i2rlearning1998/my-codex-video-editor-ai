import { SpeechError, type Transcription, type WordTiming } from './types';

export interface CaptionCue {
  id: string;
  start: number;
  end: number;
  lines: string[];
  /** Original word timestamps for highlighting; absent for segment-only input. */
  words: WordTiming[];
  approximate?: boolean;
}
export interface CaptionOptions {
  maxCharsPerLine?: number;
  /** Lines per cue (default 2). */
  maxLines?: number;
  minDuration?: number;
  maxDuration?: number;
}
/** Word-aligned cues keep exact timestamps. Segment-only splits are marked approximate. */
export function toCaptionCues(
  result: Transcription,
  options: CaptionOptions = {},
): CaptionCue[] {
  const width = options.maxCharsPerLine ?? 42;
  const min = options.minDuration ?? 0.5;
  const max = options.maxDuration ?? 6;
  const maxLines = options.maxLines ?? 2;
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    !Number.isInteger(maxLines) ||
    maxLines < 1 ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < 0 ||
    max <= 0 ||
    min > max
  )
    throw new SpeechError('INVALID_INPUT');
  const timedWords = Boolean(result.words?.length);
  const units = timedWords
    ? result.words!
    : result.segments.flatMap((segment) => {
        const tokens = segment.text.trim().split(/\s+/u).filter(Boolean);
        const weight = tokens.reduce((n, t) => n + Array.from(t).length, 0);
        let consumed = 0;
        return tokens.map((text) => {
          const start =
            segment.start + ((segment.end - segment.start) * consumed) / weight;
          consumed += Array.from(text).length;
          return {
            text,
            start,
            end:
              segment.start +
              ((segment.end - segment.start) * consumed) / weight,
          };
        });
      });
  const cues: CaptionCue[] = [];
  const wrap = (text: string): string[] => {
    const lines: string[] = [];
    let line = '';
    for (const word of text.trim().split(/\s+/u)) {
      // FIX9: a word longer than a line (a long Hindi compound on a narrow
      // 9:16 video) stands alone on its line instead of failing the job.
      const next = line ? `${line} ${word}` : word;
      if (!line || Array.from(next).length <= width) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  let previousEnd = 0;
  for (const unit of units) {
    if (
      !Number.isFinite(unit.start) ||
      !Number.isFinite(unit.end) ||
      unit.start < previousEnd ||
      unit.end <= unit.start ||
      unit.end - unit.start > max ||
      !unit.text.trim()
    )
      throw new SpeechError('INVALID_INPUT');
    previousEnd = unit.end;
    const current = cues.at(-1);
    const lines = wrap(
      current ? `${current.lines.join(' ')} ${unit.text}` : unit.text,
    );
    if (
      current &&
      lines.length <= maxLines &&
      unit.end - current.start <= max
    ) {
      current.end = unit.end;
      current.lines = lines;
      if (timedWords) current.words.push({ ...unit });
    } else {
      const ownLines = wrap(unit.text);
      if (ownLines.length > maxLines) throw new SpeechError('INVALID_INPUT');
      cues.push({
        id: `caption_${cues.length + 1}`,
        start: unit.start,
        end: unit.end,
        lines: ownLines,
        words: timedWords ? [{ ...unit }] : [],
        ...(!timedWords ? { approximate: true } : {}),
      });
    }
  }
  for (const [i, cue] of cues.entries()) {
    // A short cue is held to the minimum, but never into the next cue: a
    // run of quick words keeps its timing instead of failing the whole job.
    const next = cues[i + 1]?.start ?? Infinity;
    cue.end = Math.min(Math.max(cue.end, cue.start + min), next);
  }
  return cues;
}

/**
 * FIX6: speech engines (Whisper above all, in Hindi) hand back word times
 * that overlap, have no length, or run long. One such word used to fail the
 * whole caption job with "speech input is invalid". This puts the times in
 * order, gives every word a short length and caps a runaway word; text is
 * never dropped or changed (a word too long for a line is still refused).
 */
export function repairTranscription(
  result: Transcription,
  options: { maxWordSeconds?: number } = {},
): Transcription {
  const longest = options.maxWordSeconds ?? 2;
  const breakLong = (text: string): string[] =>
    text.trim() ? [text.trim()] : [];
  const mend = <T extends { text: string; start: number; end: number }>(
    items: readonly T[],
    cap: number,
  ): T[] => {
    const out: T[] = [];
    let previousEnd = 0;
    for (const item of items) {
      const pieces = breakLong(item.text);
      if (!pieces.length) continue;
      const start = Number.isFinite(item.start)
        ? Math.max(item.start, previousEnd)
        : previousEnd;
      let end = Number.isFinite(item.end) ? item.end : start + 0.3;
      if (end <= start) end = start + 0.15 * pieces.length;
      end = Math.min(end, start + cap * pieces.length);
      const each = (end - start) / pieces.length;
      pieces.forEach((text, i) =>
        out.push({
          ...item,
          text,
          start: start + each * i,
          end: start + each * (i + 1),
        }),
      );
      previousEnd = end;
    }
    return out;
  };
  const words = result.words?.length ? mend(result.words, longest) : undefined;
  return {
    ...result,
    segments: mend(result.segments, Number.POSITIVE_INFINITY),
    ...(words ? { words } : {}),
  };
}
