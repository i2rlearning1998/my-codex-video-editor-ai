export interface AudioLevel {
  peak: number;
  rms: number;
}
export function measureLevel(samples: Float32Array): AudioLevel {
  let peak = 0,
    sum = 0;
  for (const sample of samples) {
    const value = Number.isFinite(sample) ? sample : 0;
    peak = Math.max(peak, Math.abs(value));
    sum += value * value;
  }
  return { peak, rms: samples.length ? Math.sqrt(sum / samples.length) : 0 };
}
export interface MeterSnapshot {
  master: AudioLevel;
  tracks: Record<string, AudioLevel>;
}
/** Caller ticks this from its playback repaint; no independent timer or audio source. */
export class AudioMeters {
  readonly #listeners = new Set<(s: MeterSnapshot) => void>();
  readonly #tracks = new Map<string, AnalyserNode>();
  #master: AnalyserNode | undefined;
  connectMaster(node: AnalyserNode) {
    this.#master = node;
  }
  destination(
    context: BaseAudioContext,
    master: AudioNode,
    trackId: string,
  ): AnalyserNode {
    let node = this.#tracks.get(trackId);
    if (!node) {
      node = context.createAnalyser();
      node.fftSize = 1024;
      node.connect(master);
      this.#tracks.set(trackId, node);
    }
    return node;
  }
  subscribe(listener: (s: MeterSnapshot) => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  sample(): MeterSnapshot {
    const read = (node?: AnalyserNode) => {
      if (!node) return { peak: 0, rms: 0 };
      const values = new Float32Array(node.fftSize);
      node.getFloatTimeDomainData(values);
      return measureLevel(values);
    };
    const snapshot = {
      master: read(this.#master),
      tracks: Object.fromEntries(
        [...this.#tracks].map(([id, node]) => [id, read(node)]),
      ),
    };
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch {
        /* UI listeners do not interrupt playback. */
      }
    }
    return snapshot;
  }
  clearTracks() {
    for (const node of this.#tracks.values()) node.disconnect();
    this.#tracks.clear();
  }
  dispose() {
    this.clearTracks();
    this.#listeners.clear();
    this.#master = undefined;
  }
}
