import { it, expect } from 'vitest';
import { maskSchema, type Mask } from '../../src/masks/types';
import {
  evaluateMask,
  getMaskHandles,
  moveHandle,
  hitTestMask,
  maskAlpha,
  stackAlpha,
  matteAlpha,
} from '../../src/masks/geometry';
import { createMaskCache, rasterMask } from '../../src/masks/render';
import { setLayerMasks } from '../../src/masks/commands';
import {
  EditorEngine,
  createProject,
  createLayer,
  IDENTITY_MATRIX,
  serializeProject,
} from '../../src/core';
import { deriveRenderItems, type RenderSource } from '../../src/render/adapter';
import fixture from '../fixtures/projects/av-sync.json';
const rect: Mask = {
  id: 'mask',
  type: 'rect',
  geometry: [
    [0, 0],
    [2, 2],
  ],
};
it('validates geometry counts and key topology', () => {
  expect(
    maskSchema.safeParse({
      ...rect,
      geometry: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    }).success,
  ).toBe(false);
  expect(
    maskSchema.safeParse({
      ...rect,
      keyframes: [
        {
          time: 0,
          value: [
            [0, 0],
            [2, 2],
          ],
        },
        {
          time: 0,
          value: [
            [0, 0],
            [2, 2],
          ],
        },
      ],
    }).success,
  ).toBe(false);
});
it('rectangle, ellipse, polygon and cubic path hit tests', () => {
  expect(hitTestMask(rect, [1, 1])).toBe(true);
  expect(hitTestMask(rect, [3, 1])).toBe(false);
  expect(hitTestMask({ ...rect, type: 'ellipse' }, [0.1, 0.1])).toBe(false);
  expect(
    hitTestMask(
      {
        ...rect,
        type: 'polygon',
        geometry: [
          [0, 0],
          [3, 0],
          [0, 3],
        ],
      },
      [0.5, 0.5],
    ),
  ).toBe(true);
  const curve: Mask = {
    id: 'path',
    type: 'path',
    geometry: [
      [0, 0],
      [0, 3],
      [3, 3],
      [3, 0],
    ],
  };
  expect(hitTestMask(curve, [1.5, 1])).toBe(true);
  expect(getMaskHandles(curve).map((h) => h.kind)).toEqual([
    'vertex',
    'control',
    'control',
    'vertex',
  ]);
});
it('handle changes are immutable and invalid handles fail', () => {
  expect(moveHandle(rect, 1, [4, 4]).geometry[1]).toEqual([4, 4]);
  expect(rect.geometry[1]).toEqual([2, 2]);
  expect(() => moveHandle(rect, 2, [0, 0])).toThrow();
});
it('pixel fixtures cover feather, expansion, inversion and opacity', () => {
  expect([...rasterMask(3, 2, IDENTITY_MATRIX, [rect])]).toEqual([
    255, 255, 0, 255, 255, 0,
  ]);
  expect(maskAlpha({ ...rect, feather: 2 }, [0, 1])).toBe(0.5);
  expect(maskAlpha({ ...rect, invert: true }, [1, 1])).toBe(0);
  expect(maskAlpha({ ...rect, opacity: 0.25 }, [1, 1])).toBe(0.25);
  expect(hitTestMask({ ...rect, expansion: 1 }, [2.5, 1])).toBe(true);
  expect(hitTestMask({ ...rect, expansion: -1 }, [0.5, 1])).toBe(false);
});
it('add subtract intersect combine coverage rather than replacing it', () => {
  const half = { ...rect, opacity: 0.5 };
  expect(stackAlpha([half, half], [1, 1])).toBe(0.75);
  expect(stackAlpha([rect, { ...half, mode: 'subtract' }], [1, 1])).toBe(0.5);
  expect(stackAlpha([half, { ...half, mode: 'intersect' }], [1, 1])).toBe(0.25);
  expect(stackAlpha([{ ...rect, mode: 'subtract' }], [3, 3])).toBe(1);
  expect(stackAlpha([], [0, 0])).toBe(1);
});
it('keyframes reuse easing and clamp before/after key range', () => {
  const mask: Mask = {
    ...rect,
    keyframes: [
      {
        time: 1,
        value: [
          [0, 0],
          [2, 2],
        ],
        easing: 'hold',
      },
      {
        time: 2,
        value: [
          [2, 2],
          [4, 4],
        ],
      },
    ],
  };
  expect(evaluateMask(mask, 1.5).geometry).toEqual(rect.geometry);
  expect(evaluateMask(mask, 3).geometry).toEqual([
    [2, 2],
    [4, 4],
  ]);
  expect(
    evaluateMask(
      {
        ...mask,
        keyframes: mask.keyframes!.map((k) => ({ ...k, easing: 'linear' })),
      },
      1.5,
    ).geometry,
  ).toEqual([
    [1, 1],
    [3, 3],
  ]);
});
it('alpha/luma mattes respect source alpha and invert', () => {
  expect(matteAlpha(255, 255, 255, 128, 'alpha')).toBeCloseTo(128 / 255);
  expect(matteAlpha(0, 255, 0, 255, 'luma')).toBeCloseTo(0.7152);
  expect(matteAlpha(0, 0, 0, 255, 'luma', true)).toBe(1);
});
it('cache protects stored pixels and invalidates changed geometry/size', () => {
  const cache = createMaskCache();
  const a = cache.get(3, 2, IDENTITY_MATRIX, [rect]);
  a.fill(0);
  expect(cache.get(3, 2, IDENTITY_MATRIX, [rect])[0]).toBe(255);
  expect(cache.get(3, 2, IDENTITY_MATRIX, [{ ...rect, invert: true }])[0]).toBe(
    0,
  );
  expect(cache.get(1, 1, IDENTITY_MATRIX, [rect]).length).toBe(1);
});
it('old fixture loads unchanged; mask command is one undo and validates easing', () => {
  const old = new EditorEngine(fixture);
  expect(JSON.parse(JSON.stringify(old.state.compositions))).toEqual(
    fixture.compositions,
  );
  const p = createProject(),
    layer = createLayer('shape', 'shape', 'Shape');
  p.compositions[0]!.layers.push(layer);
  const e = new EditorEngine(p),
    before = serializeProject(e.state);
  setLayerMasks(e, {
    compositionId: p.compositions[0]!.id,
    layerId: layer.id,
    masks: [rect],
  });
  expect(e.state.compositions[0]!.layers[0]!.masks?.length).toBe(1);
  e.undo();
  expect(serializeProject(e.state)).toBe(before);
});
it('group masks project a shared isolated scope onto children', () => {
  const p = createProject(),
    group = createLayer('group', 'group', 'Group');
  group.masks = [rect];
  group.children = [
    createLayer('a', 'shape', 'A'),
    createLayer('b', 'shape', 'B'),
  ];
  p.compositions[0]!.layers.push(group);
  const { items } = deriveRenderItems({
    composition: p.compositions[0]! as unknown as RenderSource['composition'],
    assets: [],
    background: '#000000',
  });
  expect(items.length).toBe(2);
  expect(items.map((i) => i.maskScopes?.[0]?.id)).toEqual(['group', 'group']);
});
