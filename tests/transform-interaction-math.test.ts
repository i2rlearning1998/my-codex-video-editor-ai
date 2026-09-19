import { describe, expect, it } from 'vitest';
import {
  boundsCorners,
  createLayer,
  localTransformMatrix,
  moveTransform,
  resizeTransform,
  rotationDelta,
  transformPoint,
  type Corner,
} from '../src/core';

describe('pure interaction transform math', () => {
  const base = () => ({
    ...createLayer('a', 'shape', 'Shape').transform,
    position: { value: [20, 30] as const },
    rotation: { value: 35 },
    scale: { value: [2, -3] as const },
  });
  const bounds = { x: -10, y: 15, width: 80, height: 40 };
  it.each([0, 1, 2, 3] as Corner[])(
    'keeps the opposite corner fixed when resizing corner %s of reflected/rotated bounds',
    (corner) => {
      const initial = base();
      const corners = boundsCorners(bounds);
      const fixed = corners[(corner + 2) % 4]!;
      const before = transformPoint(localTransformMatrix(initial), fixed);
      const moving = transformPoint(
        localTransformMatrix(initial),
        corners[corner]!,
      );
      const result = resizeTransform(initial, bounds, corner, [
        moving[0] + 20,
        moving[1] - 15,
      ]);
      const after = transformPoint(localTransformMatrix(result), fixed);
      expect(after[0]).toBeCloseTo(before[0], 10);
      expect(after[1]).toBeCloseTo(before[1], 10);
      expect(result.rotation.value).toBe(35);
      expect(initial.scale.value).toEqual([2, -3]);
    },
  );
  it('proportional resize preserves signed scale ratio with deterministic dominant-axis selection', () => {
    const initial = { ...base(), rotation: { value: 0 } };
    const result = resizeTransform(
      initial,
      { x: 0, y: 0, width: 100, height: 50 },
      2,
      [420, -195],
      true,
    );
    expect(result.scale.value).toEqual([4, -6]);
  });
  it('allows crossing the opposite corner through zero scale without inventing skew', () => {
    const initial = createLayer('a', 'shape', 'Shape').transform;
    expect(
      resizeTransform(initial, { x: 0, y: 0, width: 10, height: 10 }, 2, [0, 0])
        .scale.value,
    ).toEqual([0, 0]);
    expect(
      resizeTransform(
        initial,
        { x: 0, y: 0, width: 10, height: 10 },
        2,
        [-20, -30],
      ).scale.value,
    ).toEqual([-2, -3]);
  });
  it('uses clockwise shortest increments across the angle branch cut', () => {
    const point = (degrees: number) =>
      [
        Math.cos((degrees * Math.PI) / 180),
        Math.sin((degrees * Math.PI) / 180),
      ] as const;
    expect(rotationDelta([0, 0], [1, 0], [0, 1])).toBeCloseTo(90);
    expect(rotationDelta([0, 0], point(179), point(-179))).toBeCloseTo(2);
    expect(rotationDelta([0, 0], point(-179), point(179))).toBeCloseTo(-2);
  });
  it('rejects near-anchor rotation, non-finite input, overflow, and empty resize bounds', () => {
    expect(() => rotationDelta([0, 0], [1, 0], [1e-12, 0])).toThrow();
    expect(() => moveTransform(base(), [0, 0], [NaN, 1])).toThrow();
    expect(() =>
      moveTransform(base(), [-Number.MAX_VALUE, 0], [Number.MAX_VALUE, 0]),
    ).toThrow();
    expect(() =>
      resizeTransform(base(), { ...bounds, width: 0 }, 0, [0, 0]),
    ).toThrow();
    expect(() => resizeTransform(base(), bounds, 0, [Infinity, 0])).toThrow();
  });
});
