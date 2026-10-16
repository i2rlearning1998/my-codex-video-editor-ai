import type { Layer } from './model';

/** Stored as ordinary boolean properties; no document schema extension. */
export function markManualColor(
  layer: Pick<Layer, 'properties'>,
  prop: string,
): void {
  layer.properties[`manualColor_${prop}`] = {
    type: 'boolean',
    value: true,
    animated: false,
    keyframes: [],
    constraints: [],
  };
}
export function clearManualColor(
  layer: Pick<Layer, 'properties'>,
  prop: string,
): void {
  delete layer.properties[`manualColor_${prop}`];
}
export function isManualColor(
  layer: { readonly properties: object },
  prop: string,
): boolean {
  const record = layer.properties as Record<
    string,
    { readonly value?: unknown } | undefined
  >;
  return record[`manualColor_${prop}`]?.value === true;
}
