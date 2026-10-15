import {
  controlsSchema,
  controlValues,
  easingSchema,
  type ParamSpec,
  type ControlValue,
} from './controls';
import { presetSchema, type Preset } from './schemas';
import {
  parseExpression,
  expressionReferences,
  evaluateExpression,
  defaultDimensions,
  type Dimensions,
} from './expression';
const builtins: ParamSpec[] = controlsSchema.parse([
  {
    name: 'duration',
    label: { en: 'Duration', hi: 'अवधि' },
    type: 'number',
    min: 0.01,
    max: 120,
    step: 0.01,
    default: 1,
    group: 'advanced',
  },
  {
    name: 'delay',
    label: { en: 'Delay', hi: 'देरी' },
    type: 'number',
    min: 0,
    max: 120,
    step: 0.01,
    default: 0,
    group: 'advanced',
  },
  {
    name: 'easing',
    label: { en: 'Smoothness', hi: 'सहजता' },
    type: 'easing',
    default: 'linear',
    group: 'advanced',
  },
]);
export function presetControls(preset: Preset): ParamSpec[] {
  return controlsSchema.parse([
    ...preset.controls,
    ...builtins.filter((b) => !preset.controls.some((c) => c.name === b.name)),
  ]);
}
export interface KeyframeTrack {
  property: string;
  keys: { t: number; v: number; ease: string }[];
}
export function generatePreset(
  input: unknown,
  overrides: Record<string, unknown> = {},
  dimensions: Dimensions = defaultDimensions,
): KeyframeTrack[] {
  const preset = presetSchema.parse(input),
    values = controlValues(presetControls(preset), overrides);
  const duration = values.duration,
    delay = values.delay,
    ease = easingSchema.parse(values.easing);
  if (
    typeof duration !== 'number' ||
    duration <= 0 ||
    typeof delay !== 'number' ||
    delay < 0
  )
    throw Error('Duration must be positive and delay nonnegative.');
  for (const v of Object.values(dimensions))
    if (!Number.isFinite(v) || v <= 0)
      throw Error('Canvas/layer dimensions must be positive finite numbers.');
  const properties = new Set<string>();
  return preset.tracks.map((track) => {
    if (properties.has(track.property))
      throw Error(`Duplicate track ${track.property}.`);
    properties.add(track.property);
    let previous = -1;
    return {
      property: track.property,
      keys: track.keys.map((key) => {
        if (key.t <= previous)
          throw Error(`Track ${track.property}: key times must increase.`);
        previous = key.t;
        const t = delay + key.t * duration;
        if (!Number.isFinite(t)) throw Error('Key time overflow.');
        return {
          t,
          v:
            typeof key.v === 'number'
              ? key.v
              : evaluateExpression(key.v, values, dimensions),
          ease: key.ease ?? ease,
        };
      }),
    };
  });
}
export function validatePreset(
  input: unknown,
  dimensions: Dimensions = defaultDimensions,
): Preset {
  const preset = presetSchema.parse(input),
    controls = presetControls(preset),
    references = new Set<string>();
  for (const track of preset.tracks)
    for (const key of track.keys)
      if (typeof key.v === 'string')
        for (const name of expressionReferences(parseExpression(key.v)))
          references.add(name);
  for (const name of references)
    if (!controls.some((c) => c.name === name))
      throw Error(`Unknown control $${name}.`);
  for (const control of controls)
    if (
      !['duration', 'delay', 'easing'].includes(control.name) &&
      !references.has(control.name)
    )
      throw Error(
        `Unused control ${control.name}: reference it in a track or remove it.`,
      );
  generatePreset(preset, {}, dimensions);
  for (const control of controls) {
    let extremes: ControlValue[] = [];
    if (control.type === 'number' || control.type === 'angle')
      extremes = [control.min, control.max];
    else if (control.type === 'range')
      extremes = [
        [control.min, control.min],
        [control.max, control.max],
      ];
    else if (control.type === 'point')
      extremes = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
    else if (control.type === 'bool') extremes = [false, true];
    else if (control.type === 'select') extremes = control.options;
    for (const value of extremes)
      try {
        generatePreset(preset, { [control.name]: value }, dimensions);
      } catch (e) {
        throw Error(
          `Control ${control.name} at an extreme: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
  }
  return preset;
}
