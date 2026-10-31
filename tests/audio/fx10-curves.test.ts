import { expect, it } from 'vitest';
import { scheduleAudioClip } from '../../src/audio/graph';
import type { AudibleClip } from '../../src/media/audio';

// A strict Web Audio stand-in: a value curve may not start before (or when)
// the one before it ends, as Chrome refuses it ("overlaps").
function fakeContext() {
  const curves: { time: number; duration: number }[] = [];
  const node = () => {
    const self: Record<string, unknown> = {
      channelCount: 2,
      channelCountMode: '',
      channelInterpretation: '',
      connect: (next: unknown) => next,
      disconnect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      playbackRate: { value: 1 },
      pan: { value: 0 },
      type: '',
      frequency: { value: 0 },
      Q: { value: 0 },
      gain: {
        value: 1,
        setValueCurveAtTime(_: Float32Array, time: number, duration: number) {
          const before = curves.at(-1);
          if (before && time <= before.time + before.duration)
            throw new DOMException(
              'setValueCurveAtTime overlaps another setValueCurveAtTime',
              'NotSupportedError',
            );
          curves.push({ time, duration });
        },
      },
    };
    return self;
  };
  const context = {
    createGain: node,
    createStereoPanner: node,
    createBufferSource: node,
    createBiquadFilter: node,
    createDynamicsCompressor: node,
  } as unknown as BaseAudioContext;
  return { context, curves };
}

it('[FX10-010] a long clip is scheduled in gain chunks that never overlap, so Play on a 2 minute narration does not fail', () => {
  const { context, curves } = fakeContext();
  const clip: AudibleClip = {
    clipId: 'c',
    trackId: 't',
    sourceAssetId: 'a',
    startTime: 0,
    duration: 126.3,
    sourceIn: 0,
    sourceOut: 126.3,
    speed: 1,
    reversed: false,
  };
  const buffer = { duration: 200 } as AudioBuffer;
  const scheduled = scheduleAudioClip(
    context,
    {} as AudioNode,
    clip,
    buffer,
    0,
    1.3,
  );
  expect(scheduled).not.toBeNull();
  expect(curves.length).toBe(13);
  // The whole clip is covered: the last chunk ends at the clip's end.
  const last = curves.at(-1)!;
  expect(last.time + last.duration).toBeCloseTo(1.3 + 126.3, 6);
});
