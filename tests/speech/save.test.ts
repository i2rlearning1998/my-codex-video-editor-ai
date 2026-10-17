import { describe, it, expect, vi } from 'vitest';
import {
  encodeWav,
  resampleMono,
  splitSpeech,
  synthesizeToMedia,
  type TtsProvider,
  type AudioCodec,
} from '../../src/speech';
function fake() {
  const synthesize = vi.fn<TtsProvider['synthesize']>(async () => ({
    blob: new Blob(['pcm']),
    mime: 'audio/wav',
    durationSec: 0.5,
  }));
  const provider: TtsProvider = {
    id: 'fake',
    name: 'Fake',
    kind: 'speech-tts',
    requiresKey: false,
    keyFields: [],
    listVoices: async () => [],
    synthesize,
  };
  const codec: AudioCodec = {
    decode: async () => ({
      sampleRate: 8000,
      channels: [new Float32Array([0.25, -0.5])],
    }),
    encode: encodeWav,
  };
  return { provider, codec, synthesize };
}
const opts = { voiceId: 'voice', lang: 'en' };
describe('save speech as playable PCM WAV', () => {
  it('splits English and Hindi sentences without dropping content', () => {
    expect(splitSpeech('Hello world! नमस्ते दुनिया। Next?')).toEqual([
      'Hello world!',
      'नमस्ते दुनिया।',
      'Next?',
    ]);
  });
  it('bounds long sentences without splitting surrogate pairs', () => {
    const text = 'x'.repeat(15) + '🙂' + 'y'.repeat(17);
    const parts = splitSpeech(text, 16);
    expect(parts.every((p) => p.length <= 16)).toBe(true);
    expect(parts.join('')).toBe(text);
    expect(parts[0]).toBe('x'.repeat(15));
  });
  it('rejects empty and excessively long input', () => {
    expect(() => splitSpeech('')).toThrow();
    expect(() => splitSpeech('a'.repeat(100001))).toThrow();
  });
  it('joins decoded PCM in order, with one WAV header and retained metadata', async () => {
    const deps = fake();
    const progress = vi.fn();
    const result = await synthesizeToMedia('First. Second.', {
      ...opts,
      ...deps,
      onProgress: progress,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(deps.synthesize.mock.calls.map(([r]) => r.text)).toEqual([
      'First.',
      'Second.',
    ]);
    const data = new DataView(await result.blob.arrayBuffer());
    expect(data.byteLength).toBe(52);
    expect(data.getUint32(40, true)).toBe(8);
    expect([44, 46, 48, 50].map((n) => data.getInt16(n, true))).toEqual([
      8192, -16384, 8192, -16384,
    ]);
    expect(result.durationSec).toBe(4 / 8000);
    expect(result.metadata).toEqual({
      providerId: 'fake',
      voiceId: 'voice',
      text: 'First. Second.',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(progress.mock.calls.map(([r]) => r.completed)).toEqual([1, 2]);
  });
  it('never runs two syntheses concurrently', async () => {
    const deps = fake();
    let release: (() => void) | undefined;
    deps.synthesize.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { blob: new Blob(), mime: 'audio/wav', durationSec: 0.5 };
    });
    const promise = synthesizeToMedia('One. Two.', { ...opts, ...deps });
    expect(deps.synthesize).toHaveBeenCalledTimes(1);
    release!();
    await promise;
    expect(deps.synthesize).toHaveBeenCalledTimes(2);
  });
  it('aborts between sentences and does not synthesize the next one', async () => {
    const deps = fake();
    const controller = new AbortController();
    await expect(
      synthesizeToMedia('One. Two.', {
        ...opts,
        ...deps,
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(deps.synthesize).toHaveBeenCalledTimes(1);
  });
  it('rejects incompatible chunk formats rather than creating corrupt audio', async () => {
    const deps = fake();
    let calls = 0;
    deps.codec.decode = async () => ({
      sampleRate: ++calls === 1 ? 8000 : 16000,
      channels: [new Float32Array([1])],
    });
    await expect(
      synthesizeToMedia('One. Two.', { ...opts, ...deps }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('writes stereo samples interleaved and clips peaks', async () => {
    const blob = encodeWav({
      sampleRate: 8000,
      channels: [new Float32Array([2, 0]), new Float32Array([-2, 1])],
    });
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint16(22, true)).toBe(2);
    expect([44, 46, 48, 50].map((i) => view.getInt16(i, true))).toEqual([
      32767, -32768, 0, 32767,
    ]);
  });
  it('rejects NaN audio and invalid resampling rates', () => {
    expect(() =>
      encodeWav({ sampleRate: 8000, channels: [new Float32Array([NaN])] }),
    ).toThrow();
    expect(() =>
      resampleMono(
        { sampleRate: 8000, channels: [new Float32Array([1])] },
        Infinity,
      ),
    ).toThrow();
  });
  it('mixes stereo and resamples linearly', () => {
    const out = resampleMono(
      {
        sampleRate: 16000,
        channels: [
          new Float32Array([1, 0, 1, 0]),
          new Float32Array([-1, 0, 1, 0]),
        ],
      },
      8000,
    );
    expect(Array.from(out)).toEqual([0, 1]);
  });
});
