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
    }
  | {
      type: 'run';
      id: number;
      audio: Float32Array;
      options: Record<string, unknown>;
    };

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
      await engine.load(message.files, message.model, (completed, total) => {
        const now = performance.now();
        if (now - lastProgress < 250) return;
        lastProgress = now;
        post({ type: 'progress', completed, total });
      });
      post({ type: 'done', id: message.id });
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
