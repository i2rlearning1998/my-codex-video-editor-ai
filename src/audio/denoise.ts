export type DenoiseMode = 'off' | 'low' | 'high';
export interface DenoiseState {
  processFrame(frame: Float32Array): number;
  destroy(): void;
}
export interface DenoiseRunner {
  frameSize: number;
  delaySamples: number;
  createDenoiseState(): DenoiseState;
}
export interface PcmBuffer {
  sampleRate: number;
  channels: Float32Array[];
}
export const RNNOISE_RUNTIME = {
  url: 'https://cdn.jsdelivr.net/npm/@shiguredo/rnnoise-wasm@2025.1.5/dist/rnnoise.js',
  sizeBytes: 4827304,
  sha256: 'e6958293a0118bf9860cb2753332f7562531cc987c914552c426cd7d7180a63e',
  license: 'Apache-2.0 wrapper; BSD-3-Clause RNNoise',
  version: '2025.1.5',
} as const;
export class AudioProcessingError extends Error {
  constructor(
    readonly code: 'DENOISE_UNAVAILABLE' | 'INVALID_AUDIO' | 'ABORTED',
  ) {
    super(
      {
        DENOISE_UNAVAILABLE:
          'Noise suppression could not be loaded. Disable it or retry.',
        INVALID_AUDIO:
          'Noise suppression needs finite 48 kHz audio, up to five minutes.',
        ABORTED: 'Audio processing was cancelled.',
      }[code],
    );
    this.name = 'AudioProcessingError';
  }
}
const active = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AudioProcessingError('ABORTED');
};
let runtime: Promise<DenoiseRunner> | undefined;
/** The pinned ESM contains its WASM/model bytes. No audio leaves this browser. */
export function loadRnnoise(): Promise<DenoiseRunner> {
  if (!runtime)
    runtime = (async () => {
      const response = await fetch(RNNOISE_RUNTIME.url, {
        credentials: 'omit',
      });
      if (!response.ok) throw Error('download');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== RNNOISE_RUNTIME.sizeBytes) throw Error('size');
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
      if (hash !== RNNOISE_RUNTIME.sha256) throw Error('integrity');
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'text/javascript' }),
      );
      try {
        const module = (await import(/* @vite-ignore */ url)) as {
          Rnnoise: { load(): Promise<Omit<DenoiseRunner, 'delaySamples'>> };
        };
        const engine = await module.Rnnoise.load();
        if (engine.frameSize !== 480) throw Error('frame');
        return {
          frameSize: 480,
          delaySamples: 480,
          createDenoiseState: () => engine.createDenoiseState(),
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    })().catch(() => {
      runtime = undefined;
      throw new AudioProcessingError('DENOISE_UNAVAILABLE');
    });
  return runtime;
}
export async function denoisePcm(
  pcm: PcmBuffer,
  mode: DenoiseMode,
  load: () => Promise<DenoiseRunner> = loadRnnoise,
  signal?: AbortSignal,
): Promise<PcmBuffer> {
  active(signal);
  if (mode === 'off') return pcm;
  const length = pcm.channels[0]?.length ?? 0;
  if (
    pcm.sampleRate !== 48000 ||
    !length ||
    length > 48000 * 300 ||
    !pcm.channels.length ||
    pcm.channels.some(
      (c) => c.length !== length || c.some((v) => !Number.isFinite(v)),
    )
  )
    throw new AudioProcessingError('INVALID_AUDIO');
  const runner = await load();
  active(signal);
  if (runner.frameSize !== 480 || runner.delaySamples !== 480)
    throw new AudioProcessingError('DENOISE_UNAVAILABLE');
  const wet = mode === 'low' ? 0.5 : 1,
    channels: Float32Array[] = [];
  for (const input of pcm.channels) {
    const state = runner.createDenoiseState(),
      out = new Float32Array(length),
      frame = new Float32Array(runner.frameSize);
    try {
      for (
        let offset = 0;
        offset < length + runner.delaySamples;
        offset += runner.frameSize
      ) {
        active(signal);
        frame.fill(0);
        for (let i = 0; i < frame.length && offset + i < length; i++)
          frame[i] = Math.max(-1, Math.min(1, input[offset + i]!)) * 32768;
        state.processFrame(frame);
        for (let i = 0; i < frame.length; i++) {
          const index = offset + i - runner.delaySamples;
          if (index >= 0 && index < length) {
            const value = frame[i]! / 32768;
            if (!Number.isFinite(value))
              throw new AudioProcessingError('INVALID_AUDIO');
            out[index] = input[index]! * (1 - wet) + value * wet;
          }
        }
        if (offset % (runner.frameSize * 50) === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      state.destroy();
    }
    channels.push(out);
  }
  active(signal);
  return { sampleRate: pcm.sampleRate, channels };
}
export function createBufferDenoiser(
  load: () => Promise<DenoiseRunner> = loadRnnoise,
) {
  const cache = new WeakMap<
    AudioBuffer,
    Map<DenoiseMode, Promise<AudioBuffer>>
  >();
  return async (
    buffer: AudioBuffer,
    mode: DenoiseMode,
  ): Promise<AudioBuffer> => {
    if (mode === 'off') return buffer;
    let modes = cache.get(buffer);
    if (!modes) {
      modes = new Map();
      cache.set(buffer, modes);
    }
    let result = modes.get(mode);
    if (!result) {
      result = denoisePcm(
        {
          sampleRate: buffer.sampleRate,
          channels: Array.from({ length: buffer.numberOfChannels }, (_, i) =>
            buffer.getChannelData(i),
          ),
        },
        mode,
        load,
      ).then((pcm) => {
        const output = new AudioBuffer({
          length: buffer.length,
          sampleRate: buffer.sampleRate,
          numberOfChannels: buffer.numberOfChannels,
        });
        pcm.channels.forEach((c, i) => output.copyToChannel(c, i));
        return output;
      });
      modes.set(mode, result);
      void result.catch(() => modes!.delete(mode));
    }
    return result;
  };
}
export const denoiseBuffer = createBufferDenoiser();
export const audioBufferKey = (id: string, mode: DenoiseMode = 'off') =>
  mode === 'off' ? id : `${id}/denoise-${mode}`;
