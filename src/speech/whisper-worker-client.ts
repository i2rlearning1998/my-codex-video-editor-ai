// FIX3 2.2 and 2.3: the page's side of the captions worker. It sends one
// message per step, watches the worker's heartbeat (no message for 15 s
// while loading, or 120 s during one inference run, means it stopped
// responding) and terminates the worker on Cancel or a stall.
import type { AsrOutput, EngineFile, WhisperEngine } from './whisper-engine';
import type { FakeWhisperMode } from './whisper-fake-transformers';
import { WhisperError } from './whisper';

export interface WorkerEngineOptions {
  fake?: FakeWhisperMode;
  /** No message at all for this long means the worker stopped (ms). */
  beatLossMs?: number;
  /** One inference run may keep the worker busy this long (ms). */
  inferenceStallMs?: number;
}

export const workerSupported = () => typeof Worker !== 'undefined';

export function createWorkerEngine(
  options: WorkerEngineOptions = {},
): WhisperEngine & { abort(): void } {
  const beatLossMs = options.beatLossMs ?? 15_000;
  const inferenceStallMs = options.inferenceStallMs ?? 120_000;
  let worker: Worker | null = null;
  let lastSeen = 0;
  let nextId = 1;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let onLoadProgress: ((done: number, total: number | null) => void) | null =
    null;
  const pending = new Map<
    number,
    {
      step: 'load' | 'listen';
      resolve(value: unknown): void;
      reject(error: unknown): void;
    }
  >();

  const stop = (error: WhisperError) => {
    worker?.terminate();
    worker = null;
    if (watchdog) clearInterval(watchdog);
    watchdog = null;
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  };
  const start = () => {
    if (worker) return worker;
    worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
      type: 'module',
      name: 'whisper',
    });
    lastSeen = performance.now();
    worker.onmessage = (event) => {
      lastSeen = performance.now();
      const data = event.data as {
        type: string;
        id?: number;
        result?: AsrOutput;
        name?: string;
        message?: string;
        completed?: number;
        total?: number | null;
      };
      if (data.type === 'progress')
        onLoadProgress?.(data.completed ?? 0, data.total ?? null);
      if (data.type !== 'done' && data.type !== 'error') return;
      const job = pending.get(data.id!);
      if (!job) return;
      pending.delete(data.id!);
      if (data.type === 'done') job.resolve(data.result);
      else {
        const error = new Error(data.message);
        error.name = data.name ?? 'Error';
        job.reject(error);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      const step = [...pending.values()][0]?.step ?? 'load';
      stop(new WhisperError('failed', step, new Error(event.message)));
    };
    watchdog = setInterval(() => {
      if (!pending.size) return;
      const running = [...pending.values()].some((j) => j.step === 'listen');
      const quiet = performance.now() - lastSeen;
      if (quiet > (running ? inferenceStallMs : beatLossMs)) {
        const step = running ? 'listen' : 'load';
        stop(
          new WhisperError(
            'stalled',
            step,
            new Error(`No message from the worker for ${Math.round(quiet)} ms`),
          ),
        );
      }
    }, 1000);
    return worker;
  };
  const send = <T>(
    step: 'load' | 'listen',
    message: object,
    transfer: Transferable[] = [],
  ) =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, {
        step,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      start().postMessage({ ...message, id }, transfer);
    });

  return {
    async load(files: readonly EngineFile[], model: string, onProgress) {
      onLoadProgress = onProgress ?? null;
      await send<void>('load', {
        type: 'load',
        files: [...files],
        model,
        ...(options.fake ? { fake: options.fake } : {}),
      });
    },
    run(audio, runOptions) {
      const copy = audio.slice();
      return send<AsrOutput>(
        'listen',
        { type: 'run', audio: copy, options: runOptions },
        [copy.buffer],
      );
    },
    dispose() {
      stop(new WhisperError('cancelled', 'load'));
    },
    abort() {
      stop(new WhisperError('cancelled', 'listen'));
    },
  };
}
