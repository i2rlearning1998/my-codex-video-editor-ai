// FIX6-002: a worker busy inside one long chunk cannot beat; the page must
// not call it stalled after 15 s while listening (only while loading).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkerEngine } from '../../src/speech/whisper-worker-client';

class SilentWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror:
    ((event: { message: string; preventDefault(): void }) => void) | null =
    null;
  postMessage() {}
  terminate() {}
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('[FIX6-002] worker heartbeat', () => {
  it('[FIX6-002] waits past 15 s of silence while listening, but not while loading', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', SilentWorker);
    const engine = createWorkerEngine({
      beatLossMs: 15_000,
      inferenceStallMs: 120_000,
    });
    // Listening: still waiting after 60 s of silence, given up after 120 s.
    let outcome = 'pending';
    void engine
      .run(new Float32Array(16), {})
      .then(() => (outcome = 'done'))
      .catch((error: Error) => (outcome = `failed:${error.message}`));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(70_000);
    expect(outcome).toMatch(/^failed:/);
    // Loading: no message for 15 s is a stall.
    let loadOutcome = 'pending';
    void engine
      .load([], 'x')
      .catch((error: Error) => (loadOutcome = `failed:${error.message}`));
    await vi.advanceTimersByTimeAsync(16_000);
    expect(loadOutcome).toMatch(/^failed:/);
  });
});
