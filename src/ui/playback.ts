import { frameToTime, timeToFrame } from '../core';
import type { EditorSession } from './session';

/** Elapsed-time transport; only current session time changes, never project state. */
export class Playback {
  #request: number | null = null;
  #origin = 0;
  #time = 0;
  #unsubscribe: () => void;
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
    if (this.session.playing) return;
    if (this.session.currentTime >= this.session.source.composition.duration)
      this.session.setCurrentTime(0);
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
    if (time >= duration) {
      this.session.setCurrentTime(duration);
      this.session.setPlaying(false);
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
      this.session.source.composition.duration,
      this.#time + Math.max(0, this.now() - this.#origin) / 1000,
    );
  }
  pause(): void {
    this.session.setPlaying(false);
  }
  toggle(): void {
    if (this.session.playing) this.pause();
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
