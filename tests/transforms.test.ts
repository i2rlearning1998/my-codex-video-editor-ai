import { describe, expect, it, vi } from 'vitest';
import {
  EditorEngine,
  IDENTITY_MATRIX,
  INVERSE_DETERMINANT_EPSILON,
  createComposition,
  createLayer,
  createProject,
  deserializeProject,
  serializeProject,
  invertMatrix,
  localTransformMatrix,
  multiplyMatrices,
  number,
  transformPoint,
  vector2,
  worldTransform,
  type AffineMatrix,
  type Layer,
  type Transform,
} from '../src/core';

function transform(
  position: [number, number] = [0, 0],
  scale: [number, number] = [1, 1],
  rotation = 0,
  opacity = 1,
): Transform {
  return {
    position: vector2(...position),
    scale: vector2(...scale),
    rotation: number(rotation),
    opacity: number(opacity),
  };
}
function layer(id: string, value = transform(), children: Layer[] = []): Layer {
  return {
    ...createLayer(id, children.length ? 'group' : 'text', id),
    transform: value,
    children,
  };
}
function scene(layers: Layer[]): EditorEngine {
  const project = createProject();
  project.compositions[0]!.layers = layers;
  return new EditorEngine(project);
}
function near(
  actual: readonly number[],
  expected: readonly number[],
  digits = 11,
): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index]!, digits),
  );
}

describe('frozen local transform contract', () => {
  it('maps the identity exactly and returns frozen derived values', () => {
    const source = transform();
    const result = localTransformMatrix(source);
    expect(result).toEqual(IDENTITY_MATRIX);
    expect(transformPoint(result, [2, -4])).toEqual([2, -4]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(IDENTITY_MATRIX)).toBe(true);
    expect(Object.isFrozen(transformPoint(result, [0, 0]))).toBe(true);
    expect(source).toEqual(transform());
  });
  it('translates the fixed local origin to parent-space position', () => {
    const result = localTransformMatrix(transform([10.5, -20]));
    expect(result).toEqual([1, 0, 0, 1, 10.5, -20]);
    expect(transformPoint(result, [0, 0])).toEqual([10.5, -20]);
    expect(transformPoint(result, [3, 4])).toEqual([13.5, -16]);
  });
  it('scales local axes, allowing reflection and collapsed axes', () => {
    expect(
      transformPoint(localTransformMatrix(transform([0, 0], [2, 3])), [4, 5]),
    ).toEqual([8, 15]);
    expect(
      transformPoint(localTransformMatrix(transform([0, 0], [-2, 0])), [4, 5]),
    ).toEqual([-8, 0]);
  });
  it.each([
    [0, [1, 0]],
    [90, [0, 1]],
    [180, [-1, 0]],
    [270, [0, -1]],
    [360, [1, 0]],
    [-90, [0, -1]],
    [-180, [-1, 0]],
    [-270, [0, 1]],
    [-360, [1, 0]],
    [450, [0, 1]],
  ] as const)(
    'uses clockwise positive rotation in a downward Y axis: %s degrees',
    (degrees, expected) => {
      expect(
        transformPoint(
          localTransformMatrix(transform([0, 0], [1, 1], degrees)),
          [1, 0],
        ),
      ).toEqual(expected);
    },
  );
  it('handles non-cardinal rotations without rounding stored values', () => {
    const source = transform([0, 0], [1, 1], 45);
    near(transformPoint(localTransformMatrix(source), [1, 0]), [
      Math.SQRT1_2,
      Math.SQRT1_2,
    ]);
    expect(source.rotation.value).toBe(45);
    const almost = localTransformMatrix(transform([0, 0], [1, 1], 90 + 1e-8));
    expect(almost[0]).not.toBe(0);
  });
  it('applies scale, then rotation, then translation, around (0,0)', () => {
    const result = localTransformMatrix(transform([10, 20], [2, 3], 90));
    expect(result).toEqual([0, 2, -3, 0, 10, 20]);
    expect(transformPoint(result, [1, 2])).toEqual([4, 22]);
    expect(transformPoint(result, [0, 0])).toEqual([10, 20]);
    const translation = localTransformMatrix(transform([10, 20]));
    const rotation = localTransformMatrix(transform([0, 0], [1, 1], 90));
    const scale = localTransformMatrix(transform([0, 0], [2, 3]));
    expect(
      multiplyMatrices(multiplyMatrices(translation, rotation), scale),
    ).toEqual(result);
    expect(
      multiplyMatrices(multiplyMatrices(scale, rotation), translation),
    ).not.toEqual(result);
  });
  it('does not conflate opacity with spatial geometry or evaluate animation metadata', () => {
    const source = transform([1, 2], [3, 4], 5, 0.25);
    source.position.animated = true;
    source.position.constraints = [{ reserved: true }];
    expect(localTransformMatrix(source)).toEqual(
      localTransformMatrix(transform([1, 2], [3, 4], 5, 1)),
    );
  });
});

describe('world transforms derived from the canonical tree', () => {
  it('composes root, nested group and leaf in parent-to-child order', () => {
    const engine = scene([
      layer('root', transform([10, 20], [2, 3], 90, 0.5), [
        layer('inner', transform([4, 5], [1, 2], -90, 0.4), [
          layer('leaf', transform([2, 3], [-1, 0.5], 0, 0.25)),
        ]),
      ]),
    ]);
    const composition = engine.state.compositions[0]!;
    expect(worldTransform(composition, 'inner')).toEqual({
      matrix: [3, 0, 0, 4, -5, 28],
      opacity: 0.2,
    });
    const result = worldTransform(composition, 'leaf');
    expect(result).toEqual({ matrix: [-3, 0, 0, 2, 1, 40], opacity: 0.05 });
    expect(transformPoint(result.matrix, [2, 3])).toEqual([-5, 46]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(worldTransform(composition, 'leaf')).toEqual(result);
    expect(engine.canUndo).toBe(false);
  });
  it('treats the composition root as identity and dimensions as bounds, not a transform', () => {
    const composition = createComposition({ width: 500, height: 300 });
    composition.layers.push(layer('root', transform([600, -100])));
    expect(worldTransform(composition, 'root').matrix).toEqual([
      1, 0, 0, 1, 600, -100,
    ]);
    composition.width = 1000;
    expect(worldTransform(composition, 'root').matrix).toEqual([
      1, 0, 0, 1, 600, -100,
    ]);
  });
  it('multiplies opacity along ancestry, including zero and one, without using siblings', () => {
    const engine = scene([
      layer('g', transform([0, 0], [1, 1], 0, 0), [layer('a'), layer('b')]),
      layer('other'),
    ]);
    const composition = engine.state.compositions[0]!;
    expect(worldTransform(composition, 'a').opacity).toBe(0);
    expect(worldTransform(composition, 'b').opacity).toBe(0);
    expect(worldTransform(composition, 'other').opacity).toBe(1);
    expect(() => worldTransform(composition, 'missing')).toThrow(
      /Unknown layer/,
    );
  });
  it('keeps affine shear instead of lossy TRS decomposition', () => {
    const engine = scene([
      layer('parent', transform([0, 0], [2, 1]), [
        layer('child', transform([0, 0], [1, 1], 45)),
      ]),
    ]);
    const m = worldTransform(engine.state.compositions[0]!, 'child').matrix;
    // Columns of a single R*S matrix are orthogonal. This product has a nonzero dot product.
    expect(m[0] * m[2] + m[1] * m[3]).toBeCloseTo(-1.5, 12);
    near(m, [Math.SQRT2, Math.SQRT1_2, -Math.SQRT2, Math.SQRT1_2, 0, 0]);
  });
  it('only calculates the requested branch and surfaces overflow on that branch', () => {
    const engine = scene([
      layer('huge', transform([0, 0], [1e308, 1e308]), [
        layer('overflow', transform([0, 0], [2, 2])),
      ]),
      layer('valid'),
    ]);
    expect(
      worldTransform(engine.state.compositions[0]!, 'valid').matrix,
    ).toEqual(IDENTITY_MATRIX);
    expect(() =>
      worldTransform(engine.state.compositions[0]!, 'overflow'),
    ).toThrow(RangeError);
  });
  it('leaves project data, serialization and canonical state untouched', () => {
    const engine = scene([layer('root', transform([2.5, -3], [-2, 0], 450))]);
    const before = serializeProject(engine.state);
    worldTransform(engine.state.compositions[0]!, 'root');
    expect(serializeProject(engine.state)).toBe(before);
    const loaded = deserializeProject(before);
    expect(loaded.schemaVersion).toBe(4);
    expect(worldTransform(loaded.compositions[0]!, 'root')).toEqual(
      worldTransform(engine.state.compositions[0]!, 'root'),
    );
  });
});

describe('inverse and numerical contract', () => {
  it('inverts identity, translation, affine shear and reflection', () => {
    expect(invertMatrix(IDENTITY_MATRIX)).toEqual(IDENTITY_MATRIX);
    expect(invertMatrix([1, 0, 0, 1, 10, -20])).toEqual([1, 0, 0, 1, -10, 20]);
    expect(invertMatrix([1, 2, 3, 4, 5, 6])).toEqual([-2, 1, 1.5, -0.5, 1, -2]);
    expect(invertMatrix([-2, 0, 0, 4, 0, 0])).toEqual([-0.5, 0, 0, 0.25, 0, 0]);
  });
  it('round trips a point and composes with the inverse in both orders', () => {
    const m = localTransformMatrix(transform([10, -20], [-2, 3], 37));
    const inverse = invertMatrix(m)!;
    near(multiplyMatrices(m, inverse), IDENTITY_MATRIX);
    near(multiplyMatrices(inverse, m), IDENTITY_MATRIX);
    near(transformPoint(inverse, transformPoint(m, [8, -7])), [8, -7]);
  });
  it('normalizes the determinant to avoid scale-only overflow or underflow', () => {
    expect(invertMatrix([1e200, 0, 0, 1e200, 0, 0])).toEqual([
      1e-200, 0, 0, 1e-200, 0, 0,
    ]);
    expect(invertMatrix([1e-200, 0, 0, 1e-200, 0, 0])).toEqual([
      1e200, 0, 0, 1e200, 0, 0,
    ]);
  });
  it('returns null for singular and relatively ill-conditioned linear blocks', () => {
    expect(invertMatrix([0, 0, 0, 0, 10, 20])).toBeNull();
    expect(invertMatrix([1, 2, 2, 4, 0, 0])).toBeNull();
    expect(
      invertMatrix([1, 0, 0, INVERSE_DETERMINANT_EPSILON, 0, 0]),
    ).toBeNull();
    expect(
      invertMatrix([1, 0, 0, INVERSE_DETERMINANT_EPSILON * 2, 0, 0]),
    ).not.toBeNull();
  });
  it.each([NaN, Infinity, -Infinity])(
    'rejects nonfinite scalar input %s',
    (invalid) => {
      expect(() => localTransformMatrix(transform([invalid, 0]))).toThrow(
        RangeError,
      );
      expect(() =>
        localTransformMatrix(transform([0, 0], [1, invalid])),
      ).toThrow(RangeError);
      expect(() =>
        localTransformMatrix(transform([0, 0], [1, 1], invalid)),
      ).toThrow(RangeError);
      const matrix: AffineMatrix = [1, 0, 0, 1, invalid, 0];
      expect(() => invertMatrix(matrix)).toThrow(RangeError);
      expect(() => multiplyMatrices(matrix, IDENTITY_MATRIX)).toThrow(
        RangeError,
      );
      expect(() => transformPoint(IDENTITY_MATRIX, [invalid, 0])).toThrow(
        RangeError,
      );
    },
  );
  it('throws on nonfinite results and does not substitute identity', () => {
    expect(() =>
      multiplyMatrices([1e308, 0, 0, 1, 0, 0], [2, 0, 0, 1, 0, 0]),
    ).toThrow(RangeError);
    expect(() => transformPoint([1e308, 0, 0, 1, 0, 0], [2, 0])).toThrow(
      RangeError,
    );
    expect(() =>
      invertMatrix([Number.MIN_VALUE, 0, 0, Number.MIN_VALUE, 0, 0]),
    ).toThrow(RangeError);
  });
  it('canonicalizes signed zero, accepts subpixels and reduces huge finite angles', () => {
    expect(localTransformMatrix(transform([-0, -0], [1, 1], -0))).toEqual(
      IDENTITY_MATRIX,
    );
    expect(transformPoint(IDENTITY_MATRIX, [-0, -0])).toEqual([0, 0]);
    expect(
      transformPoint(localTransformMatrix(transform([1e-9, -1e-9])), [0, 0]),
    ).toEqual([1e-9, -1e-9]);
    expect(localTransformMatrix(transform([0, 0], [1, 1], 1e308))).toEqual(
      localTransformMatrix(transform([0, 0], [1, 1], 1e308 % 360)),
    );
  });
});

describe('command semantics frozen before rendering', () => {
  function reparentScene() {
    return scene([
      layer('a', transform([10, 0], [2, 2], 0, 0.5), [
        layer('child', transform([3, 0], [1, 1], 0, 0.8)),
      ]),
      { ...layer('b', transform([100, 0], [3, 3], 0, 0.25)), type: 'group' },
    ]);
  }
  it('MOVE_LAYER preserves local data, changes world geometry/opacity, and supports undo/redo', () => {
    const engine = reparentScene();
    const before = engine.state;
    const composition = before.compositions[0]!;
    const local = composition.layers[0]!.children[0]!.transform;
    expect(worldTransform(composition, 'child')).toEqual({
      matrix: [2, 0, 0, 2, 16, 0],
      opacity: 0.4,
    });
    engine.commands.execute({
      type: 'MOVE_LAYER',
      compositionId: composition.id,
      layerId: 'child',
      parentId: 'b',
    });
    const after = engine.state;
    expect(after.compositions[0]!.layers[1]!.children[0]!.transform).toEqual(
      local,
    );
    expect(worldTransform(after.compositions[0]!, 'child')).toEqual({
      matrix: [3, 0, 0, 3, 109, 0],
      opacity: 0.2,
    });
    engine.undo();
    expect(engine.state).toEqual(before);
    engine.redo();
    expect(engine.state).toEqual(after);
    engine.commands.execute({
      type: 'MOVE_LAYER',
      compositionId: composition.id,
      layerId: 'child',
      parentId: null,
    });
    expect(worldTransform(engine.state.compositions[0]!, 'child')).toEqual({
      matrix: [1, 0, 0, 1, 3, 0],
      opacity: 0.8,
    });
  });
  it('allows moving into a singular parent because preserving local values requires no inverse', () => {
    const engine = reparentScene();
    const compositionId = engine.state.compositions[0]!.id;
    engine.commands.transaction('Collapse and move', [
      {
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'b',
        target: { kind: 'transform', key: 'scale' },
        property: vector2(0, 0),
      },
      { type: 'MOVE_LAYER', compositionId, layerId: 'child', parentId: 'b' },
    ]);
    expect(
      worldTransform(engine.state.compositions[0]!, 'child').matrix,
    ).toEqual([0, 0, 0, 0, 100, 0]);
    expect(engine.history.undo).toHaveLength(1);
  });
  it('reorders within the same parent without changing world transform', () => {
    const engine = scene([layer('a', transform([4, 5])), layer('b')]);
    const composition = engine.state.compositions[0]!;
    const before = worldTransform(composition, 'a');
    engine.commands.execute({
      type: 'MOVE_LAYER',
      compositionId: composition.id,
      layerId: 'a',
      parentId: null,
      index: 1,
    });
    expect(engine.state.compositions[0]!.layers.map((item) => item.id)).toEqual(
      ['b', 'a'],
    );
    expect(worldTransform(engine.state.compositions[0]!, 'a')).toEqual(before);
  });
  it('GROUP inserts an identity frame and identity UNGROUP preserves descendants under a transformed ancestor', () => {
    const engine = scene([
      layer('ancestor', transform([7, 8], [2, 3], 90, 0.4), [
        layer('a', transform([1, 2])),
        layer('b', transform([3, 4])),
      ]),
    ]);
    const compositionId = engine.state.compositions[0]!.id;
    const before = worldTransform(engine.state.compositions[0]!, 'a');
    engine.commands.execute({
      type: 'GROUP',
      compositionId,
      groupId: 'g',
      name: 'Group',
      layerIds: ['a', 'b'],
    });
    expect(worldTransform(engine.state.compositions[0]!, 'a')).toEqual(before);
    const grouped = engine.state;
    engine.commands.execute({ type: 'UNGROUP', compositionId, groupId: 'g' });
    expect(worldTransform(engine.state.compositions[0]!, 'a')).toEqual(before);
    expect(
      engine.state.compositions[0]!.layers[0]!.children.map((item) => item.id),
    ).toEqual(['a', 'b']);
    engine.undo();
    expect(engine.state).toEqual(grouped);
    engine.redo();
    expect(worldTransform(engine.state.compositions[0]!, 'a')).toEqual(before);
  });
  it.each([
    transform([1, 0]),
    transform([0, 0], [2, 1]),
    transform([0, 0], [1, 1], 45),
    transform([0, 0], [1, 1], 0, 0.5),
    transform([0, 0], [0, 1]),
    transform([0, 0], [1, 1], 360),
  ])(
    'rejects transformed UNGROUP without state, history, or event side effects %#',
    (value) => {
      const engine = scene([layer('g', value, [layer('a')])]);
      const before = engine.state;
      const changed = vi.fn();
      engine.on('state:changed', changed);
      expect(() =>
        engine.commands.execute({
          type: 'UNGROUP',
          compositionId: before.compositions[0]!.id,
          groupId: 'g',
        }),
      ).toThrow(/identity/);
      expect(engine.state).toBe(before);
      expect(engine.canUndo).toBe(false);
      expect(changed).not.toHaveBeenCalled();
    },
  );
  it('does not remove identity groups carrying reserved metadata or custom properties', () => {
    for (const change of [
      (group: Layer) => {
        group.transform.position.animated = true;
      },
      (group: Layer) => {
        group.transform.scale.constraints = [{ reserved: 'constraint' }];
      },
      (group: Layer) => {
        group.properties.custom = number(1);
      },
    ]) {
      const group = layer('g', transform(), [layer('a')]);
      change(group);
      const engine = scene([group]);
      expect(() =>
        engine.commands.execute({
          type: 'UNGROUP',
          compositionId: engine.state.compositions[0]!.id,
          groupId: 'g',
        }),
      ).toThrow(/identity/);
    }
  });
  it('rolls back an earlier edit if transformed UNGROUP fails in the same transaction, retaining redo', () => {
    const engine = scene([layer('g', transform(), [layer('a')])]);
    const compositionId = engine.state.compositions[0]!.id;
    engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: 'a',
      target: { kind: 'transform', key: 'position' },
      property: vector2(1, 2),
    });
    engine.undo();
    const before = engine.state;
    expect(() =>
      engine.commands.transaction('Unsafe flatten', [
        {
          type: 'SET_PROPERTY',
          compositionId,
          layerId: 'g',
          target: { kind: 'transform', key: 'rotation' },
          property: number(45),
        },
        { type: 'UNGROUP', compositionId, groupId: 'g' },
      ]),
    ).toThrow(/identity/);
    expect(engine.state).toBe(before);
    expect(engine.canUndo).toBe(false);
    expect(engine.canRedo).toBe(true);
  });
  it('specifies future flattening as G*C and opacity multiplication, not value addition', () => {
    const group = transform([10, 20], [2, 3], 90, 0.5);
    const child = transform([4, 5], [1, 2], -90, 0.4);
    const parent = localTransformMatrix(transform([3, 4], [1, 1], 30));
    const flattened = multiplyMatrices(
      localTransformMatrix(group),
      localTransformMatrix(child),
    );
    near(
      multiplyMatrices(parent, flattened),
      multiplyMatrices(
        multiplyMatrices(parent, localTransformMatrix(group)),
        localTransformMatrix(child),
      ),
    );
    expect(group.opacity.value * child.opacity.value).toBe(0.2);
    // Contract verification only: no decomposition or transformed-UNGROUP command is introduced.
  });
});
