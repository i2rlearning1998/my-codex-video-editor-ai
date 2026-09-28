import { expect, test } from 'vitest';
import type { AudibleClip } from '../src/media/audio';
import { prepareDucking, duckGainAt } from '../src/audio/ducking';
import { defaultAudioSettings } from '../src/audio/settings';
const clip = (id: string): AudibleClip => ({
  clipId: id,
  trackId: id,
  sourceAssetId: id,
  startTime: 0,
  duration: 3,
  sourceIn: 0,
  sourceOut: 3,
  speed: 1,
  reversed: false,
  audio: defaultAudioSettings(),
});
const speechPcm = () => {
  const data = new Float32Array(3 * 48000);
  for (let i = 48000; i < 2 * 48000; i++)
    data[i] = 0.2 * Math.sin((2 * Math.PI * 997 * i) / 48000);
  return {
    sampleRate: 48000,
    length: data.length,
    numberOfChannels: 1,
    getChannelData: () => data,
  };
};
test('[AUD-012] duck envelope attacks under speech, holds, releases and respects mute', () => {
  const base = defaultAudioSettings();
  const music = {
    ...clip('music'),
    audio: {
      ...base,
      role: 'music' as const,
      duck: { ...base.duck, enabled: true },
    },
  };
  const speech = {
    ...clip('speech'),
    audio: { ...base, role: 'speech' as const },
  };
  const buffers = new Map([['speech', speechPcm()]]);
  const result = prepareDucking([music, speech], buffers)[0]!;
  expect(duckGainAt(result.duckEnvelope, 0.5)).toBe(1);
  expect(duckGainAt(result.duckEnvelope, 1.2)).toBeCloseTo(10 ** (-12 / 20), 6);
  expect(duckGainAt(result.duckEnvelope, 2.1)).toBeCloseTo(10 ** (-12 / 20), 6);
  expect(duckGainAt(result.duckEnvelope, 2.6)).toBe(1);
  const silent = prepareDucking(
    [music, { ...speech, audio: { ...speech.audio, muted: true } }],
    buffers,
  )[0]!;
  expect(duckGainAt(silent.duckEnvelope, 1.5)).toBe(1);
  expect(
    duckGainAt(
      prepareDucking([music, speech], new Map())[0]!.duckEnvelope,
      1.5,
    ),
  ).toBe(1);
});
test('[AUD-012] duck detector maps source trims, reverse and clip placement', () => {
  const base = defaultAudioSettings();
  const music = {
    ...clip('music'),
    audio: {
      ...base,
      role: 'music' as const,
      duck: { ...base.duck, enabled: true },
    },
  };
  const speech = {
    ...clip('speech'),
    startTime: 0.5,
    duration: 1,
    sourceIn: 1,
    sourceOut: 2,
    reversed: true,
    audio: { ...base, role: 'speech' as const },
  };
  const result = prepareDucking(
    [music, speech],
    new Map([['speech', speechPcm()]]),
  )[0]!;
  expect(duckGainAt(result.duckEnvelope, 0.3)).toBe(1);
  expect(duckGainAt(result.duckEnvelope, 0.7)).toBeLessThan(0.3);
  expect(duckGainAt(result.duckEnvelope, 2.2)).toBe(1);
});
