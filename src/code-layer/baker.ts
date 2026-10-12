// X1 (spec section 5): bakes code animations into the frame cache, one job
// at a time, frames in order from 0 (stateful simulations need every frame
// before the next). A job can be cancelled; its stored frames stay and play,
// and it resumes only when asked. A failed job keeps its message.
import type { FrameCache } from './cache';
import type { FreeCodeOpenOptions, FreeCodeSession } from './runtime-types';
import type { CodeTier } from './meta';

export interface BakeSpec extends FreeCodeOpenOptions {
  readonly cacheKey: string;
  readonly tier: CodeTier;
  readonly source: string;
  readonly frames: number;
}
export type BakeState = 'queued' | 'running' | 'done' | 'cancelled' | 'error';
export interface BakeJob {
  readonly cacheKey: string;
  state: BakeState;
  done: number;
  readonly total: number;
  error?: string;
}
export type SessionOpener = (
  tier: CodeTier,
  source: string,
  opts: FreeCodeOpenOptions,
) => Promise<FreeCodeSession>;

export class CodeBaker {
  readonly #jobs = new Map<string, BakeJob>();
  readonly #specs = new Map<string, BakeSpec>();
  readonly #waiters = new Map<string, (() => void)[]>();
  readonly #listeners = new Set<() => void>();
  #running: { key: string; session: FreeCodeSession | null } | null = null;
  #stopRunning = false;

  constructor(
    private readonly cache: FrameCache,
    private readonly open: SessionOpener,
  ) {}

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #emit() {
    for (const listener of [...this.#listeners]) listener();
  }

  job(cacheKey: string): Readonly<BakeJob> | undefined {
    return this.#jobs.get(cacheKey);
  }
  /** Fraction of a key's frames stored (0 to 1). */
  progress(cacheKey: string): number {
    const job = this.#jobs.get(cacheKey);
    const total = job?.total ?? this.cache.entry(cacheKey)?.total ?? 0;
    return total ? Math.min(1, this.cache.stored(cacheKey) / total) : 0;
  }

  /**
   * Makes sure a key is (being) baked. A cancelled or failed key stays as it
   * is unless `resume` is true.
   */
  ensure(spec: BakeSpec, resume = false): Readonly<BakeJob> {
    const known = this.#jobs.get(spec.cacheKey);
    if (
      known &&
      (known.state === 'queued' ||
        known.state === 'running' ||
        known.state === 'done' ||
        !resume)
    )
      return known;
    if (this.cache.complete(spec.cacheKey)) {
      const done: BakeJob = {
        cacheKey: spec.cacheKey,
        state: 'done',
        done: spec.frames,
        total: spec.frames,
      };
      this.#jobs.set(spec.cacheKey, done);
      return done;
    }
    const job: BakeJob = {
      cacheKey: spec.cacheKey,
      state: 'queued',
      done: this.cache.stored(spec.cacheKey),
      total: spec.frames,
    };
    this.#jobs.set(spec.cacheKey, job);
    this.#specs.set(spec.cacheKey, spec);
    this.#emit();
    void this.#pump();
    return job;
  }

  /** Resolves when the key is fully baked; rejects on failure or cancel. */
  async complete(spec: BakeSpec): Promise<void> {
    await this.cache.ready();
    if (this.cache.complete(spec.cacheKey)) return;
    const job = this.ensure(spec, true);
    if (job.state === 'done') return;
    await new Promise<void>((resolve) => {
      const list = this.#waiters.get(spec.cacheKey) ?? [];
      list.push(resolve);
      this.#waiters.set(spec.cacheKey, list);
    });
    const after = this.#jobs.get(spec.cacheKey);
    if (after?.state !== 'done')
      throw new Error(
        after?.error ??
          (after?.state === 'cancelled'
            ? 'Rendering the code animation was cancelled.'
            : 'The code animation could not be rendered.'),
      );
  }

  cancel(cacheKey: string): void {
    const job = this.#jobs.get(cacheKey);
    if (!job || (job.state !== 'queued' && job.state !== 'running')) return;
    job.state = 'cancelled';
    if (this.#running?.key === cacheKey) {
      this.#stopRunning = true;
      this.#running.session?.dispose();
    }
    this.#settle(cacheKey);
    this.#emit();
  }

  #settle(cacheKey: string) {
    for (const resolve of this.#waiters.get(cacheKey) ?? []) resolve();
    this.#waiters.delete(cacheKey);
  }

  async #pump(): Promise<void> {
    if (this.#running) return;
    const next = [...this.#jobs.values()].find((job) => job.state === 'queued');
    if (!next) return;
    const spec = this.#specs.get(next.cacheKey)!;
    this.#running = { key: next.cacheKey, session: null };
    this.#stopRunning = false;
    next.state = 'running';
    this.#emit();
    try {
      await this.cache.ready();
      const session = await this.open(spec.tier, spec.source, spec);
      if (this.#stopRunning) {
        session.dispose();
      } else {
        this.#running.session = session;
        // A seekable animation resumes at its first missing frame; a stateful
        // one replays from 0 (stored frames are not written again).
        const first = session.meta.seekable
          ? this.cache.stored(spec.cacheKey)
          : 0;
        for (let frame = first; frame < spec.frames; frame++) {
          if (this.#stopRunning) break;
          const image = await session.renderFrame(frame);
          if (this.#stopRunning) {
            image.close();
            break;
          }
          await this.cache.put(spec.cacheKey, frame, image, spec.frames);
          next.done = Math.max(next.done, frame + 1);
          this.#emit();
        }
        session.dispose();
        if (!this.#stopRunning) next.state = 'done';
      }
    } catch (error) {
      if (!this.#stopRunning) {
        next.state = 'error';
        next.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      this.#running = null;
      this.#settle(next.cacheKey);
      this.#emit();
      void this.#pump();
    }
  }

  dispose(): void {
    for (const key of this.#jobs.keys()) this.cancel(key);
    this.#listeners.clear();
  }
}
