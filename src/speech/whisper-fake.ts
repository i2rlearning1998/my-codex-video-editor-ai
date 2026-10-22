// FIX1 F4: the real Whisper runner (store checks, model start, decode,
// windows, progress, cue mapping, error classes) with only the network and
// the transformers module faked, one failure class per mode. Unit tests use
// it directly; the e2e tests switch it on with
// `window.__AIVE_E2E_WHISPER__ = 'runner:<mode>'` (dev/test builds only).
import type { ModelStore } from './model-cache';
import { createWhisperRunner, type WhisperRunner } from './whisper';
import type { AudioCodec } from './types';
import {
  fakeTransformers,
  type FakeWhisperMode,
} from './whisper-fake-transformers';

export type { FakeWhisperMode };

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
  const runner = createWhisperRunner({
    store: extra.store ?? memoryModelStore(),
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
    // FIX3: a silent worker is caught by the heartbeat, not the start timeout.
    loadTimeoutMs: mode === 'silent' ? 60_000 : 4000,
    onLanguage: (language) => languages.push(language),
    // FIX3 2.2: in a browser the fake model runs inside the real worker.
    ...(typeof Worker !== 'undefined'
      ? { workerFake: mode }
      : { loadTransformers: fakeTransformers(mode) }),
  });
  return Object.assign(runner, { languages });
}
