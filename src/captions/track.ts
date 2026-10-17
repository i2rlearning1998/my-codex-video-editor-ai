// CAP (D-270): Auto Caption. Speech is transcribed through an injected STT
// provider (src/speech types), and the cues are cut by the speech engine's
// own rules (`toCaptionCues`), never a second copy of them. A caption track
// is plain JSON-safe data; captionCommands (layers.ts) turns it into
// ordinary layers and clips.
import {
  toCaptionCues,
  type CaptionCue,
  type CaptionOptions,
} from '../speech/captions';
import type {
  SpeechProgress,
  SttProvider,
  Transcription,
  WordTiming,
} from '../speech/types';
import {
  captionStyle,
  type CaptionPosition,
  type CaptionStyle,
  type CaptionStyleId,
} from './styles';

export type { CaptionCue };
export interface CaptionTrack {
  readonly version: 1;
  readonly language: string;
  readonly style: CaptionStyle;
  readonly cues: readonly CaptionCue[];
}
export interface CaptionSplitOptions {
  /** Default: the style's. */
  readonly maxCharsPerLine?: number;
  /** Default: the style's. */
  readonly maxLines?: number;
  readonly minDuration?: number;
  readonly maxDuration?: number;
}
export interface CaptionTrackOptions extends CaptionSplitOptions {
  readonly style?: CaptionStyleId | CaptionStyle;
  readonly position?: CaptionPosition;
  /** Overrides the transcription's language. */
  readonly language?: string;
}
export interface AutoCaptionOptions extends CaptionTrackOptions {
  readonly stt: SttProvider;
  /** The spoken language asked of the STT provider. */
  readonly lang?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SpeechProgress) => void;
}
export type CaptionMedia = Blob | { readonly url: string };

function splitOptions(
  style: CaptionStyle,
  options: CaptionSplitOptions,
): CaptionOptions & { maxLines: number } {
  return {
    maxCharsPerLine: options.maxCharsPerLine ?? style.maxCharsPerLine,
    maxLines: options.maxLines ?? style.maxLines,
    ...(options.minDuration !== undefined
      ? { minDuration: options.minDuration }
      : {}),
    ...(options.maxDuration !== undefined
      ? { maxDuration: options.maxDuration }
      : {}),
  };
}

/** A caption track from a transcription (no I/O). */
export function captionTrackFromTranscription(
  transcription: Transcription,
  options: CaptionTrackOptions = {},
): CaptionTrack {
  const style = captionStyle(options.style, options.position);
  return {
    version: 1,
    language: options.language ?? transcription.language,
    style,
    cues: toCaptionCues(transcription, splitOptions(style, options)),
  };
}

/** Transcribes `media` with the injected STT and builds the caption track. */
export async function autoCaption(
  media: CaptionMedia,
  options: AutoCaptionOptions,
): Promise<CaptionTrack> {
  const request = media instanceof Blob ? { blob: media } : { url: media.url };
  const transcription = await options.stt.transcribe({
    ...request,
    ...(options.lang ? { lang: options.lang } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  });
  return captionTrackFromTranscription(transcription, {
    ...options,
    ...(options.language || options.lang
      ? { language: options.language ?? options.lang }
      : {}),
  });
}

/** The words of a cue: its timings, or spread over its time by length. */
export function cueWords(cue: CaptionCue): WordTiming[] {
  if (cue.words.length) return cue.words.map((word) => ({ ...word }));
  const tokens = cue.lines.join(' ').split(/\s+/u).filter(Boolean);
  const weight = tokens.reduce((n, t) => n + Array.from(t).length, 0) || 1;
  let consumed = 0;
  return tokens.map((text) => {
    const start = cue.start + ((cue.end - cue.start) * consumed) / weight;
    consumed += Array.from(text).length;
    return {
      text,
      start,
      end: cue.start + ((cue.end - cue.start) * consumed) / weight,
    };
  });
}

/**
 * Splits a track's cues again with new options (after edits or a style
 * change), keeping every word's timing. Cue ids are renumbered.
 */
export function resplit(
  track: CaptionTrack,
  options: CaptionTrackOptions = {},
): CaptionTrack {
  const style = options.style
    ? captionStyle(options.style, options.position)
    : captionStyle(track.style, options.position);
  const timed = track.cues.every((cue) => cue.words.length > 0);
  const words = track.cues.flatMap(cueWords);
  const transcription: Transcription = {
    text: words.map((word) => word.text).join(' '),
    language: track.language,
    // Segment-only cues stay approximate (their words were spread).
    segments: timed
      ? []
      : track.cues.map((cue) => ({
          text: cue.lines.join(' '),
          start: cue.start,
          end: cue.end,
        })),
    ...(timed ? { words } : {}),
  };
  return {
    version: 1,
    language: options.language ?? track.language,
    style,
    cues: toCaptionCues(transcription, splitOptions(style, options)),
  };
}

/**
 * A cue with new text and the same start and end. When the word count is
 * unchanged the word timings are kept; otherwise they are spread over the
 * cue by length (marked approximate). Lines follow the text's line breaks.
 */
export function editCueText(cue: CaptionCue, text: string): CaptionCue {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/\s+/gu, ' '))
    .filter(Boolean);
  if (!lines.length) throw new Error('A caption needs some text');
  const tokens = lines.join(' ').split(' ');
  if (!cue.words.length) return { ...cue, lines };
  if (cue.words.length === tokens.length)
    return {
      ...cue,
      lines,
      words: cue.words.map((word, i) => ({ ...word, text: tokens[i]! })),
    };
  return {
    ...cue,
    lines,
    words: cueWords({ ...cue, lines, words: [] }),
    approximate: true,
  };
}

/** A track with one cue's text changed (timing kept). */
export function editTrackCue(
  track: CaptionTrack,
  cueId: string,
  text: string,
): CaptionTrack {
  if (!track.cues.some((cue) => cue.id === cueId))
    throw new Error(`Unknown caption cue: ${cueId}`);
  return {
    ...track,
    cues: track.cues.map((cue) =>
      cue.id === cueId ? editCueText(cue, text) : cue,
    ),
  };
}
