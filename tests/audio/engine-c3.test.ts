import { it, expect, vi } from 'vitest';
import { EditorEngine, serializeProject, SCHEMA_VERSION } from '../../src/core';
import fixture from '../fixtures/projects/av-sync.json';
import { mixedGainAt, setMixerVolume, fadePreset } from '../../src/audio/mixer';
import {
  defaultAudioSettings,
  volumeDbAt,
  clipGainAt,
  readAudioSettings,
  setClipAudio,
} from '../../src/audio/settings';
import { createClipAnalyzer } from '../../src/audio/analyze';
import { AudioMeters, measureLevel } from '../../src/audio/meters';
import { denoisePcm, type DenoiseRunner } from '../../src/audio/denoise';
import { listAudibleClips } from '../../src/media/audio';
import type { PreviewAsset } from '../../src/media/previews';
it('migrates an old fixture with identical audio defaults and optional fields absent', () => {
  const engine = new EditorEngine(fixture);
  expect(engine.state.schemaVersion).toBe(SCHEMA_VERSION);
  expect(engine.state.settings.masterVolume).toBeUndefined();
  expect(
    engine.state.compositions[0]!.tracks.every((t) => t.volume === undefined),
  ).toBe(true);
  const clips = listAudibleClips(
    engine.state.compositions[0],
    engine.state.assets as unknown as readonly PreviewAsset[],
  );
  expect(clips.length).toBeGreaterThan(0);
  for (const clip of clips)
    expect(mixedGainAt(clip, 1)).toBe(
      clipGainAt(clip.audio!, 1, clip.duration),
    );
});
it('master and track volume commands validate, preserve fields and undo', () => {
  const e = new EditorEngine(fixture),
    before = serializeProject(e.state);
  setMixerVolume(e, { scope: 'master', volume: 2 });
  expect(e.state.settings.masterVolume).toBe(2);
  e.undo();
  expect(serializeProject(e.state)).toBe(before);
  setMixerVolume(e, {
    scope: 'track',
    compositionId: 'av-main',
    trackId: 'audio-1',
    volume: 0.5,
  });
  expect(
    e.state.compositions[0]!.tracks.find((t) => t.id === 'audio-1')?.volume,
  ).toBe(0.5);
  expect(() =>
    setMixerVolume(e, { scope: 'master', volume: Infinity }),
  ).toThrow();
});
it('shared gain multiplies master/track/clip while retaining legacy dB, mute and fades', () => {
  const audio = { ...defaultAudioSettings(), gainDb: 0, volume: 0.5 };
  const clip = { audio, duration: 4, masterVolume: 2, trackVolume: 0.5 };
  expect(mixedGainAt(clip, 2)).toBe(0.5);
  expect(mixedGainAt({ ...clip, audio: { ...audio, muted: true } }, 2)).toBe(0);
  expect(mixedGainAt({ ...clip, audio: fadePreset(audio, 'both', 1) }, 0)).toBe(
    0,
  );
  expect(mixedGainAt({ ...clip, audio: fadePreset(audio, 'both', 1) }, 4)).toBe(
    0,
  );
});
it('volume keys reuse easing and old linear behavior', () => {
  const base = defaultAudioSettings(),
    linear = {
      ...base,
      volumeKeys: [
        { time: 0, db: -20 },
        { time: 2, db: 0 },
      ],
    };
  expect(volumeDbAt(linear, 1)).toBe(-10);
  expect(
    volumeDbAt(
      {
        ...linear,
        volumeKeys: [
          { time: 0, db: -20, easing: 'hold' },
          { time: 2, db: 0 },
        ],
      },
      1,
    ),
  ).toBe(-20);
  expect(
    volumeDbAt(
      {
        ...linear,
        volumeKeys: [
          { time: 0, db: -20, easing: 'ease-in' },
          { time: 2, db: 0 },
        ],
      },
      1,
    ),
  ).toBeLessThan(-10);
});
it('clip settings round trip denoise and optional volume without resetting legacy settings', () => {
  const e = new EditorEngine(fixture);
  setClipAudio(
    e,
    'av-main',
    'clip-tone',
    { ...defaultAudioSettings(), gainDb: -6, denoise: 'high', volume: 0.5 },
    'Denoise',
  );
  const c = e.state.compositions[0]!.tracks[1]!.clips[0]!;
  expect(readAudioSettings(c)).toMatchObject({
    gainDb: -6,
    denoise: 'high',
    volume: 0.5,
  });
});
it('analysis is cached, covers all channels, and isolates caller mutation', async () => {
  const decode = vi.fn(async () => ({
    length: 4,
    sampleRate: 4,
    numberOfChannels: 2,
    getChannelData: (c: number) =>
      new Float32Array(c ? [0, 0, 0, 1] : [0.5, 0, -0.5, 0]),
  }));
  const analyze = createClipAnalyzer(decode),
    blob = new Blob(['fixture']);
  const result = await analyze(blob, 2);
  expect(result.peak).toBe(1);
  expect(Array.from(result.waveform)).toEqual([0.5, 1]);
  expect(result.durationSec).toBe(1);
  result.waveform.fill(0);
  expect(Array.from((await analyze(blob, 2)).waveform)).toEqual([0.5, 1]);
  expect(decode).toHaveBeenCalledOnce();
});
it('meters expose actual sample peak/RMS and clean up fake analysers', () => {
  expect(measureLevel(new Float32Array([1, -1, 0, 0]))).toEqual({
    peak: 1,
    rms: Math.sqrt(0.5),
  });
  const analyser = {
    fftSize: 4,
    getFloatTimeDomainData: (a: Float32Array) => a.fill(0.5),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const meters = new AudioMeters(),
    listen = vi.fn();
  meters.connectMaster(analyser as unknown as AnalyserNode);
  meters.destination(
    { createAnalyser: () => analyser } as unknown as BaseAudioContext,
    {} as AudioNode,
    'a',
  );
  meters.subscribe(listen);
  expect(meters.sample()).toEqual({
    master: { peak: 0.5, rms: 0.5 },
    tracks: { a: { peak: 0.5, rms: 0.5 } },
  });
  expect(listen).toHaveBeenCalledOnce();
  meters.dispose();
  expect(analyser.disconnect).toHaveBeenCalledOnce();
});
function fakeRunner() {
  const destroy = vi.fn();
  const runner: DenoiseRunner = {
    frameSize: 480,
    delaySamples: 480,
    createDenoiseState: () => {
      let previous = new Float32Array(480);
      return {
        processFrame(frame) {
          const next = frame.slice();
          frame.set(previous);
          for (let i = 0; i < frame.length; i++) frame[i]! *= 0.5;
          previous = next;
          return 1;
        },
        destroy,
      };
    },
  };
  return { runner, destroy };
}
it('denoise compensates one frame delay, preserves the tail, mixes low/high, and isolates channels', async () => {
  const { runner, destroy } = fakeRunner(),
    load = vi.fn(async () => runner);
  const pcm = {
    sampleRate: 48000,
    channels: [
      new Float32Array(501).fill(0.8),
      new Float32Array(501).fill(-0.4),
    ],
  };
  const high = await denoisePcm(pcm, 'high', load);
  expect(high.channels[0]![0]).toBeCloseTo(0.4);
  expect(high.channels[0]![500]).toBeCloseTo(0.4);
  expect(high.channels[1]![0]).toBeCloseTo(-0.2);
  expect(pcm.channels[0]![0]).toBeCloseTo(0.8);
  expect(destroy).toHaveBeenCalledTimes(2);
  expect((await denoisePcm(pcm, 'low', load)).channels[0]![0]).toBeCloseTo(0.6);
});
it('off is byte-preserving without runtime loading; aborted/invalid audio fails explicitly', async () => {
  const { runner } = fakeRunner(),
    load = vi.fn(async () => runner),
    pcm = { sampleRate: 48000, channels: [new Float32Array([1])] };
  expect(await denoisePcm(pcm, 'off', load)).toBe(pcm);
  expect(load).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(
    denoisePcm(pcm, 'high', load, controller.signal),
  ).rejects.toMatchObject({ code: 'ABORTED' });
  await expect(
    denoisePcm({ ...pcm, sampleRate: 8000 }, 'high', load),
  ).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
});
it.skipIf(typeof OfflineAudioContext === 'undefined')(
  'offline Web Audio gain applies expected amplitude',
  async () => {
    const { scheduleAudioClip } = await import('../../src/audio/graph');
    const context = new OfflineAudioContext(1, 480, 48000),
      buffer = context.createBuffer(1, 480, 48000);
    buffer.getChannelData(0).fill(0.5);
    scheduleAudioClip(
      context,
      context.destination,
      {
        clipId: 'a',
        trackId: 't',
        sourceAssetId: 's',
        startTime: 0,
        duration: 0.01,
        sourceIn: 0,
        sourceOut: 0.01,
        speed: 1,
        reversed: false,
        trackVolume: 0.5,
        masterVolume: 2,
      },
      buffer,
      0,
      0,
    );
    const out = await context.startRendering();
    expect(out.getChannelData(0)[240]).toBeCloseTo(0.5);
  },
);
it('old-project load preserves scene data, clears history, and rejects future versions', () => {
  const e = new EditorEngine(fixture);
  const prior = structuredClone(e.state.compositions);
  setMixerVolume(e, { scope: 'master', volume: 0.5 });
  e.load(fixture);
  expect(e.state.compositions).toEqual(prior);
  expect(e.history.undo).toHaveLength(0);
  expect(e.state.settings.masterVolume).toBeUndefined();
  expect(() =>
    e.load({ ...fixture, schemaVersion: SCHEMA_VERSION + 1 }),
  ).toThrow('newer');
});
