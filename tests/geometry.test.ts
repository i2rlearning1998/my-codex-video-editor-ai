import { describe, expect, it } from 'vitest';
import {
  EditorEngine,
  createProject,
  createLayer,
  number,
  vector2,
  worldTransform,
  type Layer,
} from '../src/core';
import type { RenderSource } from '../src/render/adapter';
import {
  geometryEdit,
  layerGeometry,
  selectionGeometry,
} from '../src/ui/geometry';

const shape = (id: string, x: number, y: number, w: number, h: number) => {
  const layer = createLayer(id, 'shape', id);
  layer.transform.position = vector2(x, y);
  layer.properties = { width: number(w), height: number(h) };
  return layer;
};
function source(layers: Layer[], selectedIds: string[]): RenderSource {
  const project = createProject();
  project.compositions[0]!.width = 1280;
  project.compositions[0]!.height = 720;
  project.compositions[0]!.layers = layers;
  const state = new EditorEngine(project).state;
  return {
    composition: state.compositions[0]!,
    assets: state.assets,
    background: '#000000',
    selectedIds,
  };
}
/** The same layers with one edit applied, like the command would. */
function apply(
  src: RenderSource,
  id: string,
  edit: ReturnType<typeof geometryEdit>,
): RenderSource {
  const layers = JSON.parse(JSON.stringify(src.composition.layers)) as Layer[];
  const visit = (items: Layer[]) => {
    for (const layer of items) {
      if (layer.id === id) {
        layer.transform.position.value = [
          ...edit!.transform.position.value,
        ] as [number, number];
        layer.transform.scale.value = [...edit!.transform.scale.value] as [
          number,
          number,
        ];
      }
      visit(layer.children);
    }
  };
  visit(layers);
  return source(layers, [...(src.selectedIds ?? [])]);
}

describe('[CV-044] G2 geometry: X, Y, W and H of the drawn box', () => {
  it('reads an unrotated layer as its top-left corner and size', () => {
    const src = source([shape('a', 100, 50, 200, 80)], ['a']);
    expect(layerGeometry(src, 'a')).toMatchObject({
      x: 100,
      y: 50,
      width: 200,
      height: 80,
      rotation: 0,
    });
  });
  it('edits W inside a scaled group for a rotated layer, keeping X and Y and the ratio', () => {
    const child = shape('c', 10, 20, 100, 50);
    child.transform.rotation = number(30);
    const group = createLayer('g', 'group', 'g');
    group.transform.position = vector2(300, 200);
    group.transform.scale = vector2(2, 2);
    group.children = [child];
    const src = source([group], ['c']);
    const before = layerGeometry(src, 'c')!;
    expect(before.width).toBeCloseTo(200, 9);
    expect(before.height).toBeCloseTo(100, 9);
    expect(before.rotation).toBeCloseTo(30, 9);
    const edit = geometryEdit(src, 'c', 'W', 300, true)!;
    const after = layerGeometry(apply(src, 'c', edit), 'c')!;
    expect(after.width).toBeCloseTo(300, 9);
    expect(after.height).toBeCloseTo(150, 9);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    // Unlocked: only the width changes.
    const free = geometryEdit(src, 'c', 'W', 300, false)!;
    const stretched = layerGeometry(apply(src, 'c', free), 'c')!;
    expect(stretched.height).toBeCloseTo(100, 9);
    // X moves the drawn box, whatever the parent's scale.
    const moved = geometryEdit(src, 'c', 'X', before.x + 40)!;
    const shifted = apply(src, 'c', moved);
    expect(layerGeometry(shifted, 'c')!.x).toBeCloseTo(before.x + 40, 9);
    expect(worldTransform(shifted.composition, 'c').matrix[5]).toBeCloseTo(
      worldTransform(src.composition, 'c').matrix[5],
      9,
    );
  });
  it('keeps a group and a drawing to their ratio even when unlocked; refuses sizes at or below 0', () => {
    const group = createLayer('g', 'group', 'g');
    group.children = [shape('a', 0, 0, 100, 50)];
    const src = source([group], ['g']);
    const edit = geometryEdit(src, 'g', 'W', 200, false)!;
    expect(edit.transform.scale.value).toEqual([2, 2]);
    expect(() => geometryEdit(src, 'g', 'W', 0)).toThrow(RangeError);
    expect(() => geometryEdit(src, 'g', 'X', Number.NaN)).toThrow(RangeError);
  });
  it('describes a multi-selection by its dashed box', () => {
    const src = source(
      [shape('a', 100, 100, 50, 50), shape('b', 300, 200, 100, 20)],
      ['a', 'b'],
    );
    expect(selectionGeometry(src)).toMatchObject({
      x: 100,
      y: 100,
      width: 300,
      height: 120,
    });
  });
});
