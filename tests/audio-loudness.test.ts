import { test, expect } from 'vitest';
import {
  measureLoudness,
  normalizationAdjustment,
} from '../src/audio/loudness';
const sine = (frequency: number, amplitude = 0.1, duration = 3) =>
  Float32Array.from(
    { length: 48000 * duration },
    (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / 48000),
  );
test('[AUD-011] K-weighted loudness calibrates at 997 Hz and rejects DC and silence', () => {
  const tone = sine(997);
  expect(measureLoudness([tone]).lufs).toBeCloseTo(-23.01, 1);
  expect(measureLoudness([tone, tone]).lufs).toBeCloseTo(-20, 1);
  expect(measureLoudness([new Float32Array(48000)]).lufs).toBe(null);
  const dc = new Float32Array(48000 * 3).fill(0.1);
  expect(measureLoudness([dc]).lufs!).toBeLessThan(-40);
  expect(() => measureLoudness([tone], 44100)).toThrow('48 kHz');
});
test('[AUD-011] absolute/relative gating excludes silence and quiet programme blocks', () => {
  const tone = sine(997),
    sequence = new Float32Array(tone.length * 3);
  sequence.set(tone);
  sequence.set(
    tone.map((x) => x * 0.01),
    tone.length * 2,
  );
  // Boundary blocks may contribute; quiet tail does not drag it down by 5 dB.
  expect(measureLoudness([sequence]).lufs!).toBeGreaterThan(-23.4);
  expect(measureLoudness([sine(997, 1e-6)]).lufs).toBe(null);
  const m = measureLoudness([tone, tone]);
  const n = normalizationAdjustment(m, -16);
  expect(n.gainDb).toBeCloseTo(4, 1);
  expect(n.limited).toBe(false);
  expect(
    normalizationAdjustment({ lufs: -35, samplePeak: 0.9, blocks: 1 }, -16)
      .limited,
  ).toBe(true);
});
