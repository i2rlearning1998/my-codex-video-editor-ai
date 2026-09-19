import {
  propertySchema,
  number,
  rotateAroundCenter,
  type TransformBounds,
  type Command,
  type TransformValues,
} from '../core';
import type { SceneLayer } from '../render/adapter';

export type InspectorField =
  'Position X' | 'Position Y' | 'Scale X' | 'Scale Y' | 'Rotation' | 'Opacity';
export function inspectorTransform(
  layer: SceneLayer,
  field: InspectorField,
  value: number,
  bounds?: TransformBounds,
): TransformValues {
  if (
    !Number.isFinite(value) ||
    (field === 'Opacity' && (value < 0 || value > 1))
  )
    throw new RangeError(
      'Enter a finite value; opacity must be between 0 and 1.',
    );
  const base = layer.transform;
  switch (field) {
    case 'Position X':
      return { ...base, position: { value: [value, base.position.value[1]] } };
    case 'Position Y':
      return { ...base, position: { value: [base.position.value[0], value] } };
    case 'Scale X':
      return { ...base, scale: { value: [value, base.scale.value[1]] } };
    case 'Scale Y':
      return { ...base, scale: { value: [base.scale.value[0], value] } };
    case 'Rotation':
      if (!bounds) throw new RangeError('Rotation requires visual bounds');
      return rotateAroundCenter(base, bounds, value);
    case 'Opacity':
      return { ...base, opacity: { value } };
  }
}
/** Preserve property metadata and dispatch only changed values via existing SET_PROPERTY commands. */
export function buildTransformCommands(
  compositionId: string,
  layer: SceneLayer,
  target: TransformValues,
  textBox?: { readonly width: number; readonly height: number },
): Command[] {
  const commands: Command[] = [];
  for (const key of ['position', 'scale', 'rotation', 'opacity'] as const) {
    if (
      JSON.stringify(layer.transform[key].value) ===
      JSON.stringify(target[key].value)
    )
      continue;
    const property = propertySchema.parse(layer.transform[key] as unknown);
    // All types are retained; runtime command/project validation remains authoritative.
    commands.push({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: layer.id,
      target: { kind: 'transform', key },
      property: { ...property, value: structuredClone(target[key].value) },
    } as Command);
  }
  if (textBox) {
    for (const [key, value] of [
      ['width', textBox.width],
      ['height', textBox.height],
      ['textWrap', true],
    ] as const) {
      const original = layer.properties[key];
      if (original?.value === value) continue;
      const property = original
        ? propertySchema.parse(original as unknown)
        : typeof value === 'number'
          ? number(value)
          : {
              type: 'boolean' as const,
              value,
              animated: false,
              keyframes: [] as [],
              constraints: [],
            };
      if (property.type !== (typeof value === 'number' ? 'number' : 'boolean'))
        throw new TypeError(`Incompatible ${key} property`);
      commands.push({
        type: 'SET_PROPERTY',
        compositionId,
        layerId: layer.id,
        target: { kind: 'property', key },
        property: { ...property, value },
      } as Command);
    }
  }
  return commands;
}
