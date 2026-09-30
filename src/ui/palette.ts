import type { SceneLayer } from '../render/adapter';
// G1: the colour picker's default swatches. These are content colours offered
// to the user (like Canva's defaults), not UI chrome, so they live here rather
// than in the design tokens.
export const DEFAULT_SWATCHES: readonly string[] = [
  '#000000',
  '#545454',
  '#a6a6a6',
  '#ffffff',
  '#ff3131',
  '#ff66c4',
  '#cb6ce6',
  '#8c52ff',
  '#5e17eb',
  '#0097b2',
  '#0cc0df',
  '#5ce1e6',
  '#00bf63',
  '#7ed957',
  '#ffde59',
  '#ff914d',
];

/** Every colour used in a composition's layers, for pickers' design row. */
export function documentColors(composition: {
  readonly layers: readonly SceneLayer[];
}): string[] {
  const colors: string[] = [];
  const visit = (layers: readonly SceneLayer[]) => {
    for (const layer of layers) {
      for (const property of Object.values(layer.properties))
        if (property?.type === 'color')
          colors.push(property.value.slice(0, 7).toLowerCase());
      visit(layer.children);
    }
  };
  visit(composition.layers);
  return colors;
}
