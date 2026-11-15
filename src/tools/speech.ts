// ROUND-C1 F4 (C1.3.5): voices (text-to-speech) and captions (speech-to-text)
// through the same provider registry, REST descriptor, network guard and
// capability sheet as stock. A speech provider is a descriptor with a
// `speech` part: one POST of JSON (the text, voice and language, or the
// audio as base64), and where the answer keeps the audio or the words with
// their times. Keys and fetching stay on the server; offline pages use
// fixtures. Licence and attribution travel with every result. DOM-free.
import type { MediaProvider, RestDescriptor } from '../platform-config';
import {
  safeFetch,
  ToolError,
  type HttpFetch,
  type Resolver,
} from './net-guard';
import { readNumber, readPath, readString } from './path';
import { providersFor } from './media';

export const SPEECH_KINDS = ['text-to-speech', 'speech-to-text'] as const;
export type SpeechKind = (typeof SPEECH_KINDS)[number];
export interface SpeakInput {
  readonly text: string;
  readonly lang: string;
  readonly voice?: string | undefined;
  /** A provider id; else the first enabled one for the person's plan. */
  readonly provider?: string | undefined;
}
export interface SpeakResult {
  readonly provider: string;
  readonly providerName: string;
  readonly base64: string;
  readonly mime: string;
  readonly licence: string;
  readonly attribution: string;
  readonly words: readonly SpokenWord[];
}
export interface TranscribeInput {
  /** The audio as base64 (no data: prefix). */
  readonly audio: string;
  readonly mime: string;
  readonly lang: string;
  readonly provider?: string | undefined;
}
export interface SpokenWord {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}
export interface TranscribeResult {
  readonly provider: string;
  readonly providerName: string;
  readonly text: string;
  readonly words: readonly SpokenWord[];
  readonly licence: string;
  readonly attribution: string;
}
/** Runs one speech call of a REST provider and returns its JSON answer. */
export type SpeechRunner = (x: {
  readonly provider: MediaProvider;
  readonly descriptor: RestDescriptor;
  readonly kind: SpeechKind;
  readonly body: Record<string, string>;
  readonly signal?: AbortSignal | undefined;
}) => Promise<unknown>;

/** The speech provider a call uses: the named one, else the first enabled. */
export function speechProvider(
  all: readonly MediaProvider[],
  kind: SpeechKind,
  planId: string,
  wanted?: string,
): MediaProvider & { adapter: { type: 'rest'; descriptor: RestDescriptor } } {
  const list = providersFor(all, kind, planId).filter(
    (p) => p.adapter.type === 'rest' && p.adapter.descriptor.speech,
  );
  const pick = wanted ? list.find((p) => p.id === wanted) : list[0];
  if (!pick)
    throw new ToolError(
      'not-available',
      wanted
        ? `The ${kind === 'text-to-speech' ? 'voice' : 'captions'} provider "${wanted.slice(0, 40)}" is not available.`
        : `No ${kind === 'text-to-speech' ? 'voice' : 'captions'} provider is set up.`,
    );
  return pick as never;
}
const words = (json: unknown, d: RestDescriptor): SpokenWord[] => {
  const r = d.speech!.response;
  const raw = readPath(json, r.words);
  if (!Array.isArray(raw)) return [];
  const out: SpokenWord[] = [];
  for (const w of raw.slice(0, 20000)) {
    const text = readString(w, r.wordText, 80);
    const start = readNumber(w, r.wordStart);
    const end = readNumber(w, r.wordEnd);
    if (text && Number.isFinite(start) && end >= start)
      out.push({ text, start, end });
  }
  return out;
};
/** Maps a voice provider's answer (exported for tests). */
export function speakResult(
  json: unknown,
  p: MediaProvider,
  d: RestDescriptor,
): SpeakResult {
  const r = d.speech!.response;
  const base64 = readString(json, r.audio, 40_000_000).replace(/\s+/g, '');
  if (!base64 || !/^[A-Za-z0-9+/]+=*$/.test(base64))
    throw new ToolError('bad-response', 'it sent no audio.');
  return {
    provider: p.id,
    providerName: p.name,
    base64,
    mime: readString(json, r.mime, 60) || d.speech!.defaultMime,
    licence: readString(json, r.licence, 60) || d.defaultLicence,
    attribution: readString(json, r.attribution, 200) || p.name,
    words: words(json, d),
  };
}
/** Maps a captions provider's answer (exported for tests). */
export function transcribeResult(
  json: unknown,
  p: MediaProvider,
  d: RestDescriptor,
): TranscribeResult {
  const list = words(json, d);
  const text =
    readString(json, d.speech!.response.text, 200_000) ||
    list.map((w) => w.text).join(' ');
  if (!text && !list.length)
    throw new ToolError('bad-response', 'it sent no words.');
  return {
    provider: p.id,
    providerName: p.name,
    text,
    words: list,
    licence:
      readString(json, d.speech!.response.licence, 60) || d.defaultLicence,
    attribution:
      readString(json, d.speech!.response.attribution, 200) || p.name,
  };
}
/** The JSON body of a call (field names from the descriptor). */
export function speechBody(
  d: RestDescriptor,
  values: Partial<
    Record<'text' | 'voice' | 'lang' | 'audio' | 'mime', string | undefined>
  >,
): Record<string, string> {
  const f = d.speech!.fields;
  const out: Record<string, string> = {};
  for (const k of ['text', 'voice', 'lang', 'audio', 'mime'] as const) {
    const v = values[k];
    if (f[k] && v) out[f[k]] = v;
  }
  return out;
}
export interface SpeechRuntimeOptions {
  readonly fetch: HttpFetch;
  readonly resolve: Resolver;
  readonly key: (ref: string) => string | undefined;
}
/** The server's runner: guarded POST to the descriptor's host with the vault key. */
export function speechRunner(o: SpeechRuntimeOptions): SpeechRunner {
  return async ({ descriptor: d, body, signal }) => {
    const url = new URL(d.speech!.path, d.baseUrl);
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    if (d.auth.style !== 'none' && d.auth.keyRef) {
      const key = o.key(d.auth.keyRef);
      if (!key)
        throw new ToolError(
          'not-available',
          'its key is not set on the server.',
        );
      if (d.auth.style === 'query')
        url.searchParams.set(d.auth.name || 'key', key);
      else
        headers[(d.auth.name || 'authorization').toLowerCase()] =
          `${d.auth.prefix}${key}`;
    }
    const reply = await safeFetch(url.toString(), {
      fetch: o.fetch,
      resolve: o.resolve,
      hosts: [new URL(d.baseUrl).hostname.toLowerCase()],
      headers,
      post: JSON.stringify(body),
      timeoutMs: Math.max(d.timeoutMs, 20000),
      maxBytes: Math.max(d.maxBytes, 8 * 1024 * 1024),
      ...(signal ? { signal } : {}),
    });
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: false }).decode(reply.bytes),
      );
    } catch {
      throw new ToolError(
        'bad-response',
        'it sent something that is not JSON.',
      );
    }
  };
}
/** Offline (DEV, e2e, tests): answers by provider id, as the provider would send them. */
export const speechFixtureRunner =
  (answers: Readonly<Record<string, unknown>>): SpeechRunner =>
  async ({ provider }) => {
    if (!(provider.id in answers))
      throw new ToolError(
        'not-available',
        'it works only when the server is connected.',
      );
    return answers[provider.id];
  };
/** Speaks a text with a voice provider of the registry. */
export async function speak(
  input: SpeakInput,
  all: readonly MediaProvider[],
  planId: string,
  run: SpeechRunner,
  signal?: AbortSignal,
): Promise<SpeakResult> {
  const p = speechProvider(all, 'text-to-speech', planId, input.provider);
  const d = p.adapter.descriptor;
  const json = await run({
    provider: p,
    descriptor: d,
    kind: 'text-to-speech',
    body: speechBody(d, {
      text: input.text,
      voice: input.voice,
      lang: input.lang,
    }),
    signal,
  });
  return speakResult(json, p, d);
}
/** Transcribes audio with a captions provider of the registry. */
export async function transcribe(
  input: TranscribeInput,
  all: readonly MediaProvider[],
  planId: string,
  run: SpeechRunner,
  signal?: AbortSignal,
): Promise<TranscribeResult> {
  const p = speechProvider(all, 'speech-to-text', planId, input.provider);
  const d = p.adapter.descriptor;
  const json = await run({
    provider: p,
    descriptor: d,
    kind: 'speech-to-text',
    body: speechBody(d, {
      audio: input.audio,
      mime: input.mime,
      lang: input.lang,
    }),
    signal,
  });
  return transcribeResult(json, p, d);
}
