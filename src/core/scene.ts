import type { Composition, Layer, Project } from './model';

export function compositionById(project: Project, id: string): Composition {
  const composition = project.compositions.find((item) => item.id === id);
  if (!composition) throw new Error(`Unknown composition: ${id}`);
  return composition;
}
export interface LayerLocation {
  layer: Layer;
  siblings: Layer[];
  index: number;
  parentId: string | null;
}
export function findLayer(
  layers: Layer[],
  id: string,
  parentId: string | null = null,
): LayerLocation | undefined {
  for (const [index, layer] of layers.entries()) {
    if (layer.id === id) return { layer, siblings: layers, index, parentId };
    const child = findLayer(layer.children, id, layer.id);
    if (child) return child;
  }
  return undefined;
}
export function requireLayer(
  composition: Composition,
  id: string,
): LayerLocation {
  const location = findLayer(composition.layers, id);
  if (!location) throw new Error(`Unknown layer: ${id}`);
  return location;
}
export function childrenOf(
  composition: Composition,
  parentId: string | null,
): Layer[] {
  if (parentId === null) return composition.layers;
  const { layer } = requireLayer(composition, parentId);
  if (layer.type !== 'group') throw new Error('Parent must be a group');
  return layer.children;
}
export function insert(layers: Layer[], layer: Layer, index?: number): void {
  const position = index ?? layers.length;
  if (position < 0 || position > layers.length)
    throw new Error('Layer index out of bounds');
  layers.splice(position, 0, layer);
}
