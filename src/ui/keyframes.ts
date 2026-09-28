// W5-B keyframe helpers for the UI (ANI-001, ANI-004, ANI-006). Every edit is
// an ordinary SET_PROPERTY carrying the property's new keyframe list.
import {
  evaluateProperty,
  propertySchema,
  type Command,
  type DeepReadonly,
  type Easing,
  type Property,
} from '../core';
import type { SceneLayer } from '../render/adapter';

type AnyProperty = DeepReadonly<Property>;
/** Accepts any stored or evaluated property record without deep type expansion. */
type PropertyLike = object;
const asProperty = (property: PropertyLike) => property as AnyProperty;
type Frame = { time: number; value: unknown; easing?: Easing };

export const isAnimated = (input: PropertyLike | undefined) => {
  const property = input && asProperty(input);
  return !!property && property.animated && property.keyframes.length > 0;
};

/** A mutable copy of a property record (validated shape). */
export const copyProperty = (property: PropertyLike): Property =>
  propertySchema.parse(structuredClone(property) as unknown);

/** Sets or replaces the keyframe at `time`, keeping an existing easing there. */
export function upsertKeyframe(
  property: PropertyLike,
  time: number,
  value: unknown,
): Property {
  const copy = copyProperty(property);
  const frames = copy.keyframes as Frame[];
  const existing = frames.find((frame) => frame.time === time);
  const next = frames.filter((frame) => frame.time !== time);
  next.push({
    time,
    value: structuredClone(value),
    ...(existing?.easing ? { easing: existing.easing } : {}),
  });
  next.sort((a, b) => a.time - b.time);
  return { ...copy, animated: true, keyframes: next } as Property;
}

/**
 * ANI-006 auto-keyframe: an animated property edited at `time` gets a keyframe
 * there; a static one (or no time) just takes the new value.
 */
export function withValueAt(
  property: PropertyLike,
  value: unknown,
  time: number | undefined,
): Property {
  if (time !== undefined && isAnimated(property))
    return { ...upsertKeyframe(property, time, value), value } as Property;
  return {
    ...copyProperty(property),
    value: structuredClone(value),
  } as Property;
}

/** Stopwatch on: one keyframe at `time` with the value shown there. */
export function stopwatchOn(property: PropertyLike, time: number): Property {
  return upsertKeyframe(
    property,
    time,
    evaluateProperty(asProperty(property), time),
  );
}
/** Stopwatch off: no keyframes; the value shown at `time` becomes static. */
export function stopwatchOff(property: PropertyLike, time: number): Property {
  const copy = copyProperty(property);
  return {
    ...copy,
    value: structuredClone(evaluateProperty(asProperty(property), time)),
    animated: false,
    keyframes: [],
  } as Property;
}

/** Animatable properties of a layer, in display order (ANI-001). */
export interface AnimatableProperty {
  readonly kind: 'transform' | 'property';
  readonly key: string;
  readonly labelKey: string;
}
export function animatableProperties(layer: SceneLayer): AnimatableProperty[] {
  const list: AnimatableProperty[] = [
    { kind: 'transform', key: 'position', labelKey: 'animation.position' },
    { kind: 'transform', key: 'scale', labelKey: 'animation.scale' },
    { kind: 'transform', key: 'rotation', labelKey: 'animation.rotation' },
    { kind: 'transform', key: 'opacity', labelKey: 'animation.opacity' },
  ];
  for (const key of ['fill', 'stroke'] as const)
    if (layer.properties[key]?.type === 'color')
      list.push({ kind: 'property', key, labelKey: 'animation.color' });
  if (layer.type === 'text' && layer.properties.fontSize?.type === 'number')
    list.push({
      kind: 'property',
      key: 'fontSize',
      labelKey: 'animation.size',
    });
  return list;
}
export const propertyOf = (
  layer: SceneLayer,
  item: Pick<AnimatableProperty, 'kind' | 'key'>,
): AnyProperty | undefined =>
  (
    (item.kind === 'transform' ? layer.transform : layer.properties) as Record<
      string,
      AnyProperty | undefined
    >
  )[item.key];

export function setPropertyCommand(
  compositionId: string,
  layerId: string,
  item: Pick<AnimatableProperty, 'kind' | 'key'>,
  property: Property,
): Command {
  return {
    type: 'SET_PROPERTY',
    compositionId,
    layerId,
    target: { kind: item.kind, key: item.key },
    property,
  } as Command;
}

/** Every keyframe time of a layer (all properties), ascending and unique. */
export function keyframeTimes(layer: SceneLayer): number[] {
  const times = new Set<number>();
  const all = [
    ...Object.values(layer.transform as object),
    ...Object.values(layer.properties as object),
  ] as AnyProperty[];
  for (const property of all)
    if (isAnimated(property))
      for (const frame of property.keyframes) times.add(frame.time);
  return [...times].sort((a, b) => a - b);
}
