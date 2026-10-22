// FIX1 F4 / FIX3 2.7: a fake @huggingface/transformers for tests, one
// behaviour per mode. It has no DOM, so the worker can run it too.
import type { TransformersModule } from './whisper-engine';

export type FakeWhisperMode =
  | 'ok'
  | 'no-speech'
  | 'blocked'
  | 'memory'
  | 'unsupported'
  | 'no-audio'
  | 'hang'
  /** FIX3: burns the CPU for 1.5 s per window (the page must stay free). */
  | 'cpu'
  /** FIX3: 20 000 load progress events (the page must stay free). */
  | 'flood'
  /** FIX3: the engine goes quiet while loading (no heartbeat, no answer). */
  | 'silent';

export function fakeTransformers(
  mode: FakeWhisperMode,
  onLanguage?: (language: string) => void,
  stopHeartbeat?: () => void,
): () => Promise<TransformersModule> {
  if (mode === 'blocked')
    return () => Promise.reject(new TypeError('Failed to fetch'));
  if (mode === 'hang') return () => new Promise(() => undefined);
  return async () => ({
    env: {},
    pipeline: async (_task, _model, options) => {
      if (mode === 'silent') {
        stopHeartbeat?.();
        return new Promise(() => undefined);
      }
      if (mode === 'memory')
        throw new RangeError('Out of memory: WebAssembly.Memory');
      if (mode === 'flood') {
        const report = options.progress_callback as (p: object) => void;
        for (let i = 0; i < 20_000; i++)
          report({ loaded: i + 1, total: 20_000 });
      }
      return async (audio, runOptions) => {
        onLanguage?.(String(runOptions.language));
        if (mode === 'cpu') {
          const until = Date.now() + 1500;
          let x = 0;
          while (Date.now() < until) x += Math.sqrt(x + 1);
          if (x < 0) throw new Error('unreachable');
        }
        if (mode === 'no-speech') return { text: ' ', chunks: [] };
        const seconds = audio.length / 16000;
        const words = ['Hello', 'from', 'offline', 'captions'];
        const step = Math.min(0.5, seconds / words.length);
        return {
          text: ` ${words.join(' ')}`,
          chunks: words.map((text, i) => ({
            text: ` ${text}`,
            timestamp: [i * step, (i + 1) * step - 0.02] as [number, number],
          })),
        };
      };
    },
  });
}
