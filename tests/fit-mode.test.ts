import { describe, expect, it } from 'vitest';
import { currentFitMode, fitPlacement } from '../src/ui/fit-mode';

describe('[VID-004] Fit, Fill and Stretch are a scale and a position', () => {
  const scene = { width: 1080, height: 1920 };
  const wide = { width: 1920, height: 1080 };
  it('[VID-004] fit keeps all of the picture, fill covers the scene, stretch matches both sides', () => {
    const fit = fitPlacement('fit', wide, scene);
    expect(fit.scale[0]).toBeCloseTo(1080 / 1920, 6);
    expect(fit.scale[1]).toBeCloseTo(fit.scale[0], 6);
    expect(fit.position[0]).toBeCloseTo(0, 6);
    expect(fit.position[1]).toBeCloseTo((1920 - 1080 * fit.scale[1]) / 2, 6);
    const fill = fitPlacement('fill', wide, scene);
    expect(fill.scale[0]).toBeCloseTo(1920 / 1080, 6);
    expect(fill.position[1]).toBeCloseTo(0, 6);
    expect(fill.position[0]).toBeLessThan(0);
    const stretch = fitPlacement('stretch', wide, scene);
    expect(stretch.scale[0]).toBeCloseTo(1080 / 1920, 6);
    expect(stretch.scale[1]).toBeCloseTo(1920 / 1080, 6);
    expect(stretch.position).toEqual([0, 0]);
  });
  it('[VID-004] currentFitMode names a matching layer and calls anything else Custom', () => {
    const asset = { id: 'a', type: 'image', width: 1920, height: 1080 };
    const make = (scale: [number, number], position: [number, number]) =>
      ({
        id: 'l',
        type: 'image',
        assetId: 'a',
        properties: {},
        transform: {
          scale: { value: scale, animated: false },
          position: { value: position, animated: false },
        },
      }) as never;
    const fill = fitPlacement('fill', wide, scene);
    expect(
      currentFitMode(
        make(
          [fill.scale[0], fill.scale[1]],
          [fill.position[0], fill.position[1]],
        ),
        [asset] as never,
        scene,
      ),
    ).toBe('fill');
    expect(
      currentFitMode(make([1, 1], [10, 10]), [asset] as never, scene),
    ).toBe('custom');
  });
});
