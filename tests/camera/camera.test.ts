import { describe, expect, it } from 'vitest';
import { applyCamera, cameraMatrix, defaultCamera } from '../../src/camera';
import type { Matrix } from '../../src/camera';
const viewport = { width: 1280, height: 720 };
function point(m: Matrix, x: number, y: number) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
describe('isolated camera', () => {
  it('is identity at defaults and depth zero', () => {
    expect(cameraMatrix(defaultCamera, 3, viewport)).toEqual([
      1, 0, 0, 1, 0, 0,
    ]);
    expect(
      cameraMatrix(
        { ...defaultCamera, x: 100, zoom: 2, rotation: 30 },
        4,
        viewport,
        0,
      ),
    ).toEqual([1, 0, 0, 1, 0, 0]);
  });
  it('zooms and rotates around viewport centre using inverse camera angle', () => {
    const m = cameraMatrix(
      { ...defaultCamera, zoom: 2, rotation: 90 },
      0,
      viewport,
    );
    expect(point(m, 640, 360)[0]).toBeCloseTo(640);
    expect(point(m, 640, 360)[1]).toBeCloseTo(360);
    expect(point(m, 650, 360)[0]).toBeCloseTo(640);
    expect(point(m, 650, 360)[1]).toBeCloseTo(340);
  });
  it('moves distant layers less and interpolates zoom geometrically', () => {
    const camera = { ...defaultCamera, x: 100, y: -40 };
    expect(cameraMatrix(camera, 0, viewport)[4]).toBe(-100);
    expect(cameraMatrix(camera, 0, viewport, 0.25)[4]).toBe(-25);
    expect(cameraMatrix(camera, 0, viewport, 0.25)[5]).toBe(10);
    expect(
      cameraMatrix({ ...defaultCamera, zoom: 4 }, 0, viewport, 0.5)[0],
    ).toBe(2);
  });
  it('shake is seeded, continuous and independent of scrub order', () => {
    const camera = {
      ...defaultCamera,
      shake: { amplitude: 12, frequency: 4, seed: 8 },
    };
    const a = cameraMatrix(camera, 3, viewport);
    cameraMatrix(camera, 1, viewport);
    expect(cameraMatrix(camera, 3, viewport)).toEqual(a);
    expect(
      cameraMatrix(
        { ...camera, shake: { ...camera.shake, seed: 9 } },
        3,
        viewport,
      ),
    ).not.toEqual(a);
    expect(
      Math.abs(cameraMatrix(camera, 3.00001, viewport)[4] - a[4]),
    ).toBeLessThan(0.001);
    for (let t = 0; t < 5; t += 0.07) {
      const m = cameraMatrix(camera, t, viewport);
      expect(Math.abs(m[4])).toBeLessThanOrEqual(12);
      expect(Math.abs(m[5])).toBeLessThanOrEqual(12);
    }
    expect(
      cameraMatrix(
        { ...camera, shake: { ...camera.shake, frequency: 0 } },
        3,
        viewport,
      ),
    ).toEqual([1, 0, 0, 1, 0, 0]);
  });
  it('apply multiplies the exact requested matrix without retaining state', () => {
    const calls: number[][] = [];
    const ctx = {
      transform: (...values: number[]) => {
        calls.push(values);
      },
    };
    const camera = {
      ...defaultCamera,
      x: 20,
      shake: { amplitude: 5, frequency: 2, seed: 3 },
    };
    applyCamera(ctx, camera, viewport, 0.5, 2);
    expect(calls).toEqual([cameraMatrix(camera, 2, viewport, 0.5)]);
  });
  it('rejects invalid input instead of emitting NaN', () => {
    expect(() =>
      cameraMatrix({ ...defaultCamera, zoom: 0 }, 0, viewport),
    ).toThrow();
    expect(() => cameraMatrix(defaultCamera, NaN, viewport)).toThrow();
    expect(() => cameraMatrix(defaultCamera, 0, viewport, 1.1)).toThrow();
    expect(() =>
      cameraMatrix({ ...defaultCamera, x: Infinity }, 0, viewport),
    ).toThrow();
  });
});
