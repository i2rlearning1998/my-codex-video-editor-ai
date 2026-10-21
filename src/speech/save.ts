import { assertActive } from '../providers/errors';
import { browserCodec } from './pcm';
import {
  SpeechError,
  type AudioCodec,
  type TtsProvider,
  type TtsRequest,
} from './types';
export function splitSpeech(text: string, maxChars = 500): string[] {
  if (
    !text.trim() ||
    !Number.isInteger(maxChars) ||
    maxChars < 16 ||
    text.length > 100000
  )
    throw new SpeechError('INVALID_INPUT');
  const sentences = text.match(/[^.!?।\n]+[.!?।\n]*/gu) ?? [];
  const parts: string[] = [];
  for (const sentence of sentences) {
    let rest = sentence.trim();
    while (rest.length > maxChars) {
      const slice = rest.slice(0, maxChars),
        space = slice.lastIndexOf(' ');
      let cut = space > maxChars / 2 ? space : maxChars;
      if (/[\uD800-\uDBFF]/u.test(rest[cut - 1]!)) cut--;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
  }
  if (!parts.length) throw new SpeechError('INVALID_INPUT');
  return parts;
}
/** FIX1 F3: "Add pause" writes this mark; each one is half a second of silence. */
export const SPEECH_PAUSE = '[pause]';
export const PAUSE_SECONDS = 0.5;
export async function synthesizeToMedia(
  text: string,
  opts: Omit<TtsRequest, 'text'> & {
    provider: TtsProvider;
    codec?: AudioCodec;
    maxChars?: number;
    now?: () => Date;
  },
) {
  // Pauses split the text; a part followed by a pause gets silence after it.
  const segments = text.split(SPEECH_PAUSE);
  const parts: string[] = [];
  const pauseAfter = new Set<number>();
  segments.forEach((segment, index) => {
    if (segment.trim())
      parts.push(...splitSpeech(segment, opts.maxChars ?? 500));
    if (index < segments.length - 1 && parts.length)
      pauseAfter.add(parts.length - 1);
  });
  if (!parts.length) throw new SpeechError('INVALID_INPUT');
  const codec = opts.codec ?? browserCodec,
    blocks: Float32Array[][] = [];
  let frames = 0,
    sampleRate = 0,
    channelCount = 0;
  for (const [i, part] of parts.entries()) {
    assertActive(opts.signal);
    const result = await opts.provider.synthesize({ ...opts, text: part });
    assertActive(opts.signal);
    const decoded = await codec.decode(result.blob);
    assertActive(opts.signal);
    if (
      !decoded.channels.length ||
      !decoded.channels[0]?.length ||
      decoded.channels.some((c) => c.length !== decoded.channels[0]!.length)
    )
      throw new SpeechError('INVALID_INPUT');
    if (!i) {
      sampleRate = decoded.sampleRate;
      channelCount = decoded.channels.length;
    }
    if (
      decoded.sampleRate !== sampleRate ||
      decoded.channels.length !== channelCount
    )
      throw new SpeechError('INVALID_INPUT');
    frames += decoded.channels[0]!.length;
    if (frames * channelCount * 4 > 200 * 1024 * 1024)
      throw new SpeechError('INVALID_INPUT');
    blocks.push(decoded.channels);
    if (pauseAfter.has(i) && i < parts.length - 1) {
      const silence = Math.round(PAUSE_SECONDS * sampleRate);
      blocks.push(
        Array.from({ length: channelCount }, () => new Float32Array(silence)),
      );
      frames += silence;
    }
    opts.onProgress?.({
      phase: 'synthesis',
      completed: i + 1,
      total: parts.length,
    });
  }
  const channels = Array.from(
    { length: channelCount },
    () => new Float32Array(frames),
  );
  let offset = 0;
  for (const block of blocks) {
    block.forEach((data, c) => channels[c]!.set(data, offset));
    offset += block[0]!.length;
  }
  assertActive(opts.signal);
  const blob = codec.encode({ sampleRate, channels });
  return {
    blob,
    mime: blob.type,
    name: `Speech-${opts.provider.id}.wav`,
    durationSec: frames / sampleRate,
    metadata: {
      providerId: opts.provider.id,
      voiceId: opts.voiceId,
      text,
      createdAt: (opts.now ?? (() => new Date()))().toISOString(),
    },
  };
}
