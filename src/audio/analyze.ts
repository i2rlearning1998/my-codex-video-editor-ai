import { measureLevel } from './meters';
export interface ClipAnalysis {
  waveform: Float32Array;
  peak: number;
  rms: number;
  durationSec: number;
}
export interface AnalysisBuffer {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}
export function createClipAnalyzer(
  decode: (blob: Blob) => Promise<AnalysisBuffer> = async (blob) => {
    const context = new OfflineAudioContext(1, 1, 48000);
    return context.decodeAudioData(await blob.arrayBuffer());
  },
) {
  const cache = new WeakMap<Blob, Map<number, Promise<ClipAnalysis>>>();
  return async (blob: Blob, bins = 1024): Promise<ClipAnalysis> => {
    if (
      !Number.isInteger(bins) ||
      bins < 1 ||
      bins > 65536 ||
      blob.size > 512 * 1024 * 1024
    )
      throw Error('Invalid waveform request');
    let entries = cache.get(blob);
    if (!entries) {
      entries = new Map();
      cache.set(blob, entries);
    }
    let promise = entries.get(bins);
    if (!promise) {
      promise = decode(blob).then((audio) => {
        const waveform = new Float32Array(Math.min(bins, audio.length)),
          n = waveform.length;
        let peak = 0,
          sum = 0;
        for (let c = 0; c < audio.numberOfChannels; c++) {
          const samples = audio.getChannelData(c),
            level = measureLevel(samples);
          peak = Math.max(peak, level.peak);
          sum += level.rms ** 2;
          for (let i = 0; i < n; i++) {
            let max = 0;
            for (
              let j = Math.floor((i * audio.length) / n);
              j < Math.floor(((i + 1) * audio.length) / n);
              j++
            )
              max = Math.max(max, Math.abs(samples[j] ?? 0));
            waveform[i] = Math.max(waveform[i]!, max);
          }
        }
        return {
          waveform,
          peak,
          rms: Math.sqrt(sum / Math.max(1, audio.numberOfChannels)),
          durationSec: audio.length / audio.sampleRate,
        };
      });
      entries.set(bins, promise);
      void promise.catch(() => entries!.delete(bins));
    }
    const result = await promise;
    return { ...result, waveform: result.waveform.slice() };
  };
}
export const analyzeClip = createClipAnalyzer();
