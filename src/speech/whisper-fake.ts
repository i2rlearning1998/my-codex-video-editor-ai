// FIX1 F4: the real Whisper runner (store checks, model start, decode,
// windows, progress, cue mapping, error classes) with only the network and
// the transformers module faked, one failure class per mode. Unit tests use
// it directly; the e2e tests switch it on with
// `window.__AIVE_E2E_WHISPER__ = 'runner:<mode>'` (dev/test builds only).
import type { ModelStore } from './model-cache';
import { createWhisperRunner, type WhisperRunner } from './whisper';
import type { AudioCodec } from './types';

export type FakeWhisperMode =
  | 'ok'
  | 'no-speech'
  | 'blocked'
  | 'memory'
  | 'unsupported'
  | 'no-audio'
  | 'hang';

export const memoryModelStore = (): ModelStore => {
  const map = new Map<string, Blob>();
  return {
    get: async (key) => map.get(key),
    put: async (key, blob) => void map.set(key, blob),
    delete: async (key) => void map.delete(key),
  };
};

export function fakeWhisperRunner(
  mode: FakeWhisperMode,
  extra: { codec?: AudioCodec; store?: ModelStore } = {},
): WhisperRunner & { languages: string[] } {
  const languages: string[] = [];
  const fail = (error: Error) => () => Promise.reject(error);
  const runner = createWhisperRunner({
    store: extra.store ?? memoryModelStore(),
    loadTimeoutMs: 4000,
    fetcher: (async () => new Response(new Uint8Array(2000).fill(7))) as never,
    ...(extra.codec ? { codec: extra.codec } : {}),
    ...(mode === 'no-audio'
      ? {
          codec: {
            decode: () =>
              Promise.reject(
                new DOMException(
                  'Unable to decode audio data',
                  'EncodingError',
                ),
              ),
            encode: () => new Blob(),
          },
        }
      : {}),
    ...(mode === 'unsupported' ? { unsupported: () => 'WebAssembly' } : {}),
    loadTransformers:
      mode === 'blocked'
        ? fail(new TypeError('Failed to fetch'))
        : mode === 'hang'
          ? () => new Promise(() => undefined)
          : async () => ({
              env: {},
              pipeline: async () => {
                if (mode === 'memory')
                  throw new RangeError('Out of memory: WebAssembly.Memory');
                return async (
                  audio: Float32Array,
                  options: Record<string, unknown>,
                ) => {
                  languages.push(String(options.language));
                  if (mode === 'no-speech') return { text: ' ', chunks: [] };
                  const seconds = audio.length / 16000;
                  const words = ['Hello', 'from', 'offline', 'captions'];
                  const step = Math.min(0.5, seconds / words.length);
                  return {
                    text: ` ${words.join(' ')}`,
                    chunks: words.map((text, i) => ({
                      text: ` ${text}`,
                      timestamp: [i * step, (i + 1) * step - 0.02] as [
                        number,
                        number,
                      ],
                    })),
                  };
                };
              },
            }),
  });
  return Object.assign(runner, { languages });
}
