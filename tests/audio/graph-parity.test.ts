import { it, expect, vi, afterEach } from 'vitest';
import {
  AudioEngine,
  type AudioDecoder,
  type AudibleClip,
} from '../../src/media/audio';
import { mixdown } from '../../src/export/mixdown';
import { defaultAudioSettings } from '../../src/audio/settings';
class BufferFake {
  duration = 1;
  length = 48000;
  numberOfChannels = 2;
  sampleRate = 48000;
  getChannelData() {
    return new Float32Array(this.length);
  }
}
class NodeFake {
  gain = { value: 1, setValueCurveAtTime: vi.fn() };
  pan = { value: 0 };
  buffer: unknown = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  fftSize = 4;
  connect = vi.fn(() => this);
  disconnect = vi.fn();
  stop = vi.fn();
  start = vi.fn();
  getFloatTimeDomainData(data: Float32Array) {
    data.fill(0);
  }
}
class ContextFake {
  static nodes: NodeFake[] = [];
  currentTime = 0;
  baseLatency = 0;
  outputLatency = 0;
  state = 'running';
  destination = new NodeFake();
  createGain() {
    const node = new NodeFake();
    ContextFake.nodes.push(node);
    return node;
  }
  createStereoPanner() {
    return new NodeFake();
  }
  createAnalyser() {
    return new NodeFake();
  }
  createBufferSource() {
    const node = new NodeFake();
    ContextFake.nodes.push(node);
    return node;
  }
  close() {
    return Promise.resolve();
  }
  async startRendering() {
    return new BufferFake();
  }
}
afterEach(() => vi.unstubAllGlobals());
it('live and offline paths request the same denoise mode and schedule equal gain curves', async () => {
  vi.stubGlobal('AudioBuffer', BufferFake);
  vi.stubGlobal('AudioContext', ContextFake);
  vi.stubGlobal('OfflineAudioContext', ContextFake);
  const buffer = new BufferFake(),
    decode = vi.fn(async () => buffer),
    decoder = { decode } as unknown as AudioDecoder;
  const clip: AudibleClip = {
    clipId: 'c',
    trackId: 't',
    sourceAssetId: 's',
    startTime: 0,
    duration: 1,
    sourceIn: 0,
    sourceOut: 1,
    speed: 1,
    reversed: false,
    audio: { ...defaultAudioSettings(), denoise: 'high', volume: 0.5 },
    trackVolume: 0.5,
    masterVolume: 2,
  };
  const live = new AudioEngine(decoder, () => {});
  ContextFake.nodes = [];
  live.sync(true, 0, [clip]);
  await Promise.resolve();
  live.sync(true, 0, [clip]);
  expect(decode).toHaveBeenCalledWith('s', 'high');
  expect(ContextFake.nodes.some((n) => n.buffer === buffer)).toBe(true);
  const curve = ContextFake.nodes.flatMap(
    (n) => n.gain.setValueCurveAtTime.mock.calls,
  )[0]?.[0] as Float32Array;
  expect(curve).toBeDefined();
  expect(curve[50]).toBe(0.5);
  live.dispose();
  ContextFake.nodes = [];
  await mixdown([clip], decoder, 0, 1);
  const offline = ContextFake.nodes.flatMap(
    (n) => n.gain.setValueCurveAtTime.mock.calls,
  )[0]?.[0] as Float32Array;
  expect(offline).toEqual(curve);
  expect(ContextFake.nodes.some((n) => n.buffer === buffer)).toBe(true);
  expect(decode).toHaveBeenLastCalledWith('s', 'high');
});
it('playback reports processing failure and export rejects instead of silently using raw sound', async () => {
  vi.stubGlobal('AudioBuffer', BufferFake);
  vi.stubGlobal('AudioContext', ContextFake);
  vi.stubGlobal('OfflineAudioContext', ContextFake);
  const decoder = {
    decode: vi.fn(async () => {
      throw Error('fixture');
    }),
  } as unknown as AudioDecoder;
  const clip: AudibleClip = {
    clipId: 'c',
    trackId: 't',
    sourceAssetId: 's',
    startTime: 0,
    duration: 1,
    sourceIn: 0,
    sourceOut: 1,
    speed: 1,
    reversed: false,
    audio: { ...defaultAudioSettings(), denoise: 'high' },
  };
  const live = new AudioEngine(decoder, () => {});
  live.sync(true, 0, [clip]);
  await Promise.resolve();
  await Promise.resolve();
  expect(live.debug.processingError).toContain('Noise suppression failed');
  await expect(mixdown([clip], decoder, 0, 1)).rejects.toThrow('fixture');
  live.dispose();
});
