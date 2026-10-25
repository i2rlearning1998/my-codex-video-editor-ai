import { frameToTime, playRangeOf, timeToFrame } from '../core';
import type { EditorSession } from './session';

/** Elapsed-time transport; only current session time changes, never project state. */
export class Playback {
  #request: number | null = null;
  #origin = 0;
  #time = 0;
  #unsubscribe: () => void;
  #preparing = false;
  /**
   * FIX5 C7: resolves when what plays is ready (sound decoded), so the first
   * Play starts picture and sound together. Absent or null: start at once.
   */
  prepare: (() => Promise<void> | null) | null = null;
  /** Called with true while Play waits for `prepare`, false when it is over. */
  onPreparing: ((preparing: boolean) => void) | null = null;
  get preparing(): boolean {
    return this.#preparing;
  }
  constructor(
    private readonly session: EditorSession,
    private readonly now = () => performance.now(),
    private readonly request = (callback: FrameRequestCallback) =>
      requestAnimationFrame(callback),
    private readonly cancel = (id: number) => cancelAnimationFrame(id),
  ) {
    this.#unsubscribe = session.onChange(() => {
      if (!session.playing && this.#request !== null) {
        this.cancel(this.#request);
        this.#request = null;
      }
    });
  }
  play(): void {
    if (this.session.playing || this.#preparing) return;
    const wait = this.prepare?.() ?? null;
    if (wait) {
      this.#preparing = true;
      this.onPreparing?.(true);
      const done = () => {
        if (!this.#preparing) return;
        this.#preparing = false;
        this.onPreparing?.(false);
        this.#start();
      };
      void wait.then(done, done);
      return;
    }
    this.#start();
  }
  #start(): void {
    if (this.session.playing) return;
    // U6: playback starts at the scene's Start when outside its range.
    const range = playRangeOf(this.session.source.composition);
    if (
      this.session.currentTime >= range.end - 1e-9 ||
      this.session.currentTime < range.start - 1e-9
    )
      this.session.setCurrentTime(range.start);
    this.#origin = this.now();
    this.#time = this.session.currentTime;
    this.session.setPlaying(true);
    this.#request = this.request(this.#tick);
  }
  #tick = (timestamp: number) => {
    this.#request = null;
    if (!this.session.playing) return;
    const { duration, fps } = this.session.source.composition;
    const time = this.#time + Math.max(0, timestamp - this.#origin) / 1000;
    // V7 (spec 11.1): a Manual range plays from Start and stops at End
    // (End may pass the content: the tail plays as black and silence).
    const range = playRangeOf(this.session.source.composition);
    // AUDIT-EDITOR (PB-006): with Loop on, the end of the range (the Manual
    // range, else the scene) starts it again instead of stopping.
    if (this.session.loop && time >= (range.manual ? range.end : duration)) {
      this.session.setCurrentTime(range.manual ? range.start : 0);
      this.#origin = this.now();
      this.#time = this.session.currentTime;
      if (this.session.playing) this.#request = this.request(this.#tick);
      return;
    }
    if (range.manual) {
      if (time >= range.end) {
        this.session.setCurrentTime(range.end);
        this.session.setPlaying(false);
        return;
      }
      this.session.setCurrentTime(frameToTime(timeToFrame(time, fps), fps));
      if (this.session.playing) this.#request = this.request(this.#tick);
      return;
    }
    if (time >= duration) {
      this.session.setCurrentTime(duration);
      this.session.setPlaying(false);
      // G5: playback runs through the scenes in order.
      const next = this.session.nextCompositionId;
      if (next) {
        this.session.selectComposition(next);
        this.play();
      }
      return;
    }
    this.session.setCurrentTime(
      Math.min(duration, frameToTime(timeToFrame(time, fps), fps)),
    );
    if (this.session.playing) this.#request = this.request(this.#tick);
  };
  /** Continuous transport time while playing (the session time is frame-quantised). */
  get clock(): number {
    if (!this.session.playing) return this.session.currentTime;
    return Math.min(
      playRangeOf(this.session.source.composition).end,
      this.#time + Math.max(0, this.now() - this.#origin) / 1000,
    );
  }
  pause(): void {
    // Pause while Play is still preparing cancels the start.
    if (this.#preparing) {
      this.#preparing = false;
      this.onPreparing?.(false);
    }
    this.session.setPlaying(false);
  }
  toggle(): void {
    if (this.session.playing || this.#preparing) this.pause();
    else this.play();
  }
  stop(): void {
    this.pause();
    this.session.setCurrentTime(0);
  }
  dispose(): void {
    this.pause();
    this.#unsubscribe();
  }
}
