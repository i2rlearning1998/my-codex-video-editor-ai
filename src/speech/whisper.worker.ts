// FIX3 2.2: the offline captions engine in its own thread. Loading the
// library, building the pipeline and every inference run here, so the page
// stays free. It beats once a second, and its progress is throttled to four
// messages a second (a flood of library events never reaches the page).
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import {
  createInProcessEngine,
  type EngineFile,
  type TransformersModule,
} from './whisper-engine';
import {
  fakeTransformers,
  type FakeWhisperMode,
} from './whisper-fake-transformers';

type Incoming =
  | {
      type: 'load';
      id: number;
      files: EngineFile[];
      model: string;
      fake?: FakeWhisperMode;
      host?: string;
    }
  | { type: 'resample'; id: number; channels: Float32Array[]; rate: number }
  | { type: 'selftest'; id: number }
  | {
      type: 'run';
      id: number;
      audio: Float32Array;
      options: Record<string, unknown>;
    };

import { resampleMono } from './pcm';

/** FIX4 A7: what this worker can do, for Copy diagnostics. */
async function selfTest(wasmUrl: string) {
  const out: Record<string, string | number | boolean> = {
    webAssembly: typeof WebAssembly !== 'undefined',
    crossOriginIsolated: !!(globalThis as { crossOriginIsolated?: boolean })
      .crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    cores: navigator.hardwareConcurrency ?? 0,
  };
  out.runtimeFile = wasmUrl;
  try {
    const started = performance.now();
    await import('@huggingface/transformers');
    out.libraryMs = Math.round(performance.now() - started);
    out.library = 'ok';
  } catch (error) {
    out.library = `failed: ${error instanceof Error ? error.message : 'error'}`;
  }
  return out;
}

const post = (message: object, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer);
let beat: ReturnType<typeof setInterval> | null = setInterval(
  () => post({ type: 'beat' }),
  1000,
);
const stopBeat = () => {
  if (beat) clearInterval(beat);
  beat = null;
};
let engine: ReturnType<typeof createInProcessEngine> | null = null;
let lastProgress = 0;

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const message = event.data;
  try {
    if (message.type === 'load') {
      const load = message.fake
        ? fakeTransformers(message.fake, undefined, stopBeat)
        : () =>
            import('@huggingface/transformers') as unknown as Promise<TransformersModule>;
      engine = createInProcessEngine(load, { mjs: ortMjs, wasm: ortWasm });
      await engine.load(
        message.files,
        message.model,
        (completed, total) => {
          const now = performance.now();
          if (now - lastProgress < 250) return;
          lastProgress = now;
          post({ type: 'progress', completed, total });
        },
        {
          onStage: (stage) => post({ type: 'stage', stage }),
          ...(message.host ? { host: message.host } : {}),
        },
      );
      post({ type: 'done', id: message.id });
    } else if (message.type === 'resample') {
      // FIX4 A9: the long sample loop runs here, not on the page.
      const result = await resampleMono(
        { sampleRate: message.rate, channels: message.channels },
        16000,
      );
      post({ type: 'done', id: message.id, result }, [result.buffer]);
    } else if (message.type === 'selftest') {
      post({ type: 'done', id: message.id, result: await selfTest(ortWasm) });
    } else {
      if (!engine) throw new Error('The model is not loaded');
      const result = await engine.run(message.audio, message.options);
      post({ type: 'done', id: message.id, result });
    }
  } catch (error) {
    post({
      type: 'error',
      id: message.id,
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
post({ type: 'beat' });
