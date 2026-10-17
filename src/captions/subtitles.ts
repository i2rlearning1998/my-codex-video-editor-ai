// CAP (D-270): SRT and WebVTT export and import. Times are kept to the
// millisecond. VTT carries word timings as WebVTT cue timestamps
// (`<00:00:01.250>` before each word), so karaoke survives a
// VTT round trip; SRT has no word timings.
import type { CaptionCue } from '../speech/captions';
import type { WordTiming } from '../speech/types';

const ms = (seconds: number) => Math.max(0, Math.round(seconds * 1000));
function stamp(seconds: number, separator: ',' | '.'): string {
  const total = ms(seconds);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor(total / 60_000) % 60;
  const s = Math.floor(total / 1000) % 60;
  const rest = total % 1000;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(h)}:${two(m)}:${two(s)}${separator}${String(rest).padStart(3, '0')}`;
}
const TIME = /^(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/u;
function parseStamp(text: string): number {
  const match = TIME.exec(text.trim());
  if (!match) throw new Error(`Invalid caption time: ${text.trim()}`);
  const [, h, m, s, frac] = match;
  return (
    Number(h ?? 0) * 3600 +
    Number(m) * 60 +
    Number(s) +
    Number(frac!.padEnd(3, '0')) / 1000
  );
}
const ARROW = /^\s*(\S+)\s+-->\s+(\S+)/u;

export function toSrt(cues: readonly CaptionCue[]): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${stamp(cue.start, ',')} --> ${stamp(cue.end, ',')}\n${cue.lines.join('\n')}\n`,
    )
    .join('\n');
}

/** VTT text of a cue, with word timestamps when the cue has words. */
function vttText(cue: CaptionCue): string {
  if (!cue.words.length) return cue.lines.join('\n');
  // Words in order, line breaks where the lines break.
  const out: string[] = [];
  let index = 0;
  for (const line of cue.lines) {
    const tokens = line.split(' ');
    out.push(
      tokens
        .map((token) => {
          const word = cue.words[index++];
          return word ? `<${stamp(word.start, '.')}>${token}` : token;
        })
        .join(' '),
    );
  }
  return out.join('\n');
}
export function toVtt(cues: readonly CaptionCue[]): string {
  return `WEBVTT\n\n${cues
    .map(
      (cue) =>
        `${cue.id}\n${stamp(cue.start, '.')} --> ${stamp(cue.end, '.')}\n${vttText(cue)}\n`,
    )
    .join('\n')}`;
}

function blocks(text: string): string[][] {
  return text
    .replace(/^﻿/u, '')
    .replace(/\r\n?/gu, '\n')
    .split(/\n{2,}/u)
    .map((block) => block.split('\n').filter((line) => line.length))
    .filter((lines) => lines.length);
}
function cueFrom(
  id: string,
  start: number,
  end: number,
  lines: string[],
  words: WordTiming[],
): CaptionCue {
  if (!(end > start)) throw new Error(`Caption ${id} ends before it starts`);
  if (!lines.length) throw new Error(`Caption ${id} has no text`);
  return { id, start, end, lines, words };
}

export function parseSrt(text: string): CaptionCue[] {
  return blocks(text).map((lines, i) => {
    const at = lines.findIndex((line) => ARROW.test(line));
    if (at < 0) throw new Error(`Caption ${i + 1} has no time line`);
    const [, from, to] = ARROW.exec(lines[at]!)!;
    return cueFrom(
      `caption_${i + 1}`,
      parseStamp(from!),
      parseStamp(to!),
      lines.slice(at + 1).map((line) => line.replace(/<[^>]+>/gu, '').trim()),
      [],
    );
  });
}

export function parseVtt(text: string): CaptionCue[] {
  const all = blocks(text);
  if (!/^WEBVTT\b/u.test(all[0]?.[0] ?? ''))
    throw new Error('A WebVTT file starts with WEBVTT');
  const cues: CaptionCue[] = [];
  for (const lines of all.slice(1)) {
    if (/^(NOTE|STYLE|REGION)\b/u.test(lines[0]!)) continue;
    const at = lines.findIndex((line) => ARROW.test(line));
    if (at < 0) continue;
    const [, from, to] = ARROW.exec(lines[at]!)!;
    const start = parseStamp(from!),
      end = parseStamp(to!);
    const id = at > 0 ? lines[0]!.trim() : `caption_${cues.length + 1}`;
    const raw = lines.slice(at + 1);
    const timed = raw.some((line) => /<\d/u.test(line));
    // Word timestamps: a word starts at its own stamp (the first at the cue's
    // start) and ends where the next one starts (the last at the cue's end).
    const words: { text: string; start: number }[] = [];
    const clean = raw.map((line) => {
      const tokens = line.split(' ').filter(Boolean);
      return tokens
        .map((token) => {
          const match = /^<([\d:.,]+)>(.*)$/u.exec(token);
          const word = (match ? match[2]! : token).replace(/<[^>]+>/gu, '');
          words.push({
            text: word,
            start: match ? parseStamp(match[1]!) : words.length ? NaN : start,
          });
          return word;
        })
        .join(' ');
    });
    const timings: WordTiming[] =
      timed && words.every((word) => Number.isFinite(word.start))
        ? words.map((word, i) => ({
            text: word.text,
            start: word.start,
            end: words[i + 1]?.start ?? end,
          }))
        : [];
    cues.push(cueFrom(id, start, end, clean, timings));
  }
  return cues;
}
