// FIX3 2.2: the part of offline captions that does the heavy work (loading
// @huggingface/transformers, building the pipeline, running a window). The
// browser runs it inside a dedicated module worker (whisper.worker.ts), so
// the page never waits on it; unit tests in Node run it in-process.

/** One window's answer from the pipeline. */
export interface AsrOutput {
  text: string;
  chunks?: { text: string; timestamp: [number, number | null] }[];
}
/** The few parts of @huggingface/transformers the engine uses. */
export interface TransformersModule {
  env: Record<string, unknown>;
  pipeline(
    task: 'automatic-speech-recognition',
    model: string,
    options: Record<string, unknown>,
  ): Promise<
    (
      audio: Float32Array,
      options: Record<string, unknown>,
    ) => Promise<AsrOutput>
  >;
}
/** A model file the engine may read, by its download URL. */
export interface EngineFile {
  url: string;
  blob: Blob;
}
export interface WhisperEngine {
  load(
    files: readonly EngineFile[],
    model: string,
    onProgress?: (completed: number, total: number | null) => void,
  ): Promise<void>;
  run(
    audio: Float32Array,
    options: Record<string, unknown>,
  ): Promise<AsrOutput>;
  dispose(): void;
}
/** Where ONNX Runtime's WebAssembly files are served from (never a CDN). */
export interface WasmPaths {
  mjs: string;
  wasm: string;
}

export function createInProcessEngine(
  loadTransformers: () => Promise<TransformersModule>,
  wasmPaths?: WasmPaths,
): WhisperEngine {
  let asr: Awaited<ReturnType<TransformersModule['pipeline']>> | null = null;
  return {
    async load(files, model, onProgress) {
      const { env, pipeline } = await loadTransformers();
      // Every model file comes from this browser's verified store.
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      env.useCustomCache = true;
      env.customCache = {
        match: async (input: string | Request) => {
          const url = typeof input === 'string' ? input : input.url;
          const file = files.find((f) => f.url === url);
          if (!file) {
            // Not a file we keep: say so instead of a silent fetch.
            console.debug('[whisper] not in the local store', url);
            return undefined;
          }
          return new Response(file.blob);
        },
        put: async () => {},
      };
      // FIX3 2.2: one thread unless the page is cross-origin isolated
      // (threads need SharedArrayBuffer), and the runtime's files from this
      // site, not jsDelivr.
      const onnx = (
        env.backends as { onnx?: { wasm?: Record<string, unknown> } }
      )?.onnx;
      if (onnx?.wasm) {
        if (
          !(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated
        )
          onnx.wasm.numThreads = 1;
        if (wasmPaths) onnx.wasm.wasmPaths = wasmPaths;
      }
      asr = await pipeline('automatic-speech-recognition', model, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p: { loaded?: number; total?: number }) =>
          onProgress?.(p.loaded ?? 0, p.total ?? null),
      });
    },
    run(audio, options) {
      if (!asr) return Promise.reject(new Error('The model is not loaded'));
      return asr(audio, options);
    },
    dispose() {
      asr = null;
    },
  };
}
