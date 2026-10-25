// FIX3 2.2 and 2.3: the page's side of the captions worker. It sends one
// message per step, watches the worker's heartbeat and terminates the worker
// on Cancel or a stall. FIX5 C9: a model start that sends nothing for a
// minute is stuck; but one inference run is a single blocking call that
// silences the worker's heartbeat for as long as the CPU needs (the owner's
// real run went quiet for 16 s and was wrongly killed), so a run gets ten
// minutes.
import type {
  AsrOutput,
  EngineFile,
  LoadHooks,
  WhisperEngine,
} from './whisper-engine';
import type { PcmAudio } from './types';
import type { FakeWhisperMode } from './whisper-fake-transformers';
import { WhisperError } from './whisper';

export interface WorkerEngineOptions {
  fake?: FakeWhisperMode;
  /** No message at all for this long means the worker stopped (ms). */
  beatLossMs?: number;
  /** One inference run may keep the worker busy this long (ms). */
  inferenceStallMs?: number;
  /** FIX4 A5: loading with no stage, progress or answer for this long (ms). */
  loadStallMs?: number;
}

/** The worker's last real message, for Copy diagnostics. */
let lastMessage = 'none yet';
export const lastWorkerMessage = () => lastMessage;
export const workerSupported = () => typeof Worker !== 'undefined';

export function createWorkerEngine(
  options: WorkerEngineOptions = {},
): WhisperEngine & { abort(): void } {
  const beatLossMs = options.beatLossMs ?? 60_000;
  const inferenceStallMs = options.inferenceStallMs ?? 600_000;
  const loadStallMs = options.loadStallMs ?? 60_000;
  /** The last time the worker reported real work (a stage or progress). */
  let lastWork = 0;
  let onStage: LoadHooks['onStage'] | null = null;
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
      started: number;
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
    lastWork = lastSeen;
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
        stage?: 'library' | 'pipeline' | 'ready';
      };
      if (data.type !== 'beat')
        lastMessage =
          data.type === 'progress'
            ? `progress ${data.completed ?? 0}/${data.total ?? '?'}`
            : data.type === 'stage'
              ? `stage ${data.stage}`
              : data.type;
      if (data.type === 'progress') {
        lastWork = lastSeen;
        onLoadProgress?.(data.completed ?? 0, data.total ?? null);
      }
      if (data.type === 'stage' && data.stage) {
        lastWork = lastSeen;
        onStage?.(data.stage);
      }
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
      const step = running ? 'listen' : 'load';
      const now = performance.now();
      const quiet = now - lastSeen;
      const limit = running ? inferenceStallMs : beatLossMs;
      const seconds = (ms: number) => Math.round(ms / 1000);
      if (quiet > limit) {
        stop(
          new WhisperError(
            'stalled',
            step,
            new Error(
              `The speech engine sent nothing for ${seconds(quiet)} s while ${running ? 'listening' : 'loading the model'} (last message: ${lastMessage}).`,
            ),
          ),
        );
        return;
      }
      // The worker beats, but a model start that reports no stage or
      // progress for a minute is stuck, not slow.
      if (!running) {
        const idle =
          now -
          Math.max(lastWork, ...[...pending.values()].map((j) => j.started));
        if (idle > loadStallMs)
          stop(
            new WhisperError(
              'stalled',
              step,
              new Error(
                `Loading the model made no progress for ${seconds(idle)} s (last message: ${lastMessage}).`,
              ),
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
        started: performance.now(),
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      start().postMessage({ ...message, id }, transfer);
    });

  return {
    async load(
      files: readonly EngineFile[],
      model: string,
      onProgress,
      hooks?: LoadHooks,
    ) {
      onLoadProgress = onProgress ?? null;
      onStage = hooks?.onStage ?? null;
      await send<void>('load', {
        type: 'load',
        files: [...files],
        model,
        ...(hooks?.host ? { host: hooks.host } : {}),
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
    resample(audio: PcmAudio) {
      const channels = audio.channels.map((c) => c.slice());
      return send<Float32Array>(
        'listen',
        { type: 'resample', channels, rate: audio.sampleRate },
        channels.map((c) => c.buffer),
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

/** FIX4 A7: asks a short-lived worker what it can do (for Copy diagnostics). */
export function whisperSelfTest(timeoutMs = 15_000) {
  return new Promise<Record<string, string | number | boolean>>((resolve) => {
    if (!workerSupported()) return resolve({ worker: 'not supported' });
    const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
      type: 'module',
      name: 'whisper-selftest',
    });
    const finish = (result: Record<string, string | number | boolean>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ worker: 'no answer', timeoutMs }),
      timeoutMs,
    );
    worker.onmessage = (event) => {
      if (event.data?.type === 'done')
        finish({ worker: 'ok', ...(event.data.result ?? {}) });
    };
    worker.onerror = (event) => finish({ worker: `error: ${event.message}` });
    worker.postMessage({ type: 'selftest', id: 0 });
  });
}
