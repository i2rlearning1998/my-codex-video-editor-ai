import { it, expect, vi } from 'vitest';
import {
  detectVariableFrameRate,
  mapFrameTimestamp,
  normalizeTimestamps,
  mediaSeekTime,
} from '../../src/media-probe/timing';
import {
  rasterizeOrientedSample,
  rotatedDimensions,
} from '../../src/media-probe/rotation';
it('VFR frame mapping preserves elapsed time, including long frame holds', () => {
  const pts = [0, 0.02, 0.08, 0.12, 0.3];
  expect(detectVariableFrameRate(pts)).toBe(true);
  expect(
    [0, 0.04, 0.1, 0.2, 0.4].map((t) => mapFrameTimestamp(pts, t)),
  ).toEqual([0, 0.02, 0.08, 0.12, 0.3]);
  expect(detectVariableFrameRate([0, 1 / 30, 2 / 30, 3 / 30])).toBe(false);
  expect(detectVariableFrameRate([0])).toBeNull();
});
it('presentation order handles reordered/duplicate packets without retiming', () => {
  expect(normalizeTimestamps([0.1, 0, 0.04, 0.04])).toEqual([0, 0.04, 0.1]);
  expect(mapFrameTimestamp([0.1, 0.2], 0)).toBeNull();
  expect(() => normalizeTimestamps([NaN])).toThrow();
});
it('preview/export source seek math handles trims, reverse and ends identically', () => {
  expect(mediaSeekTime(3)).toBe(3.001);
  expect(mediaSeekTime(3, { end: Infinity })).toBe(3.001);
  expect(mediaSeekTime(3, { reverse: true })).toBe(2.999);
  expect(mediaSeekTime(3, { end: 2 })).toBe(2);
  expect(mediaSeekTime(0, { reverse: true })).toBe(0);
  expect(() => mediaSeekTime(Infinity)).toThrow();
});
it('phone rotation uses displayed dimensions and the orientation-aware sample draw', () => {
  const context = {} as OffscreenCanvasRenderingContext2D,
    canvas = { getContext: () => context } as unknown as OffscreenCanvas,
    draw = vi.fn(),
    make = vi.fn(() => canvas);
  expect(
    rasterizeOrientedSample(
      { displayWidth: 1080, displayHeight: 1920, draw },
      make,
    ),
  ).toBe(canvas);
  expect(make).toHaveBeenCalledWith(1080, 1920);
  expect(draw).toHaveBeenCalledWith(context, 0, 0, 1080, 1920);
  expect(rotatedDimensions(1920, 1080, 90)).toEqual({
    width: 1080,
    height: 1920,
  });
  expect(rotatedDimensions(1920, 1080, 180)).toEqual({
    width: 1920,
    height: 1080,
  });
});
