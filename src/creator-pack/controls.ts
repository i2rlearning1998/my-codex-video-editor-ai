import { z } from 'zod';
const finite = z.number().finite();
const label = z
  .object({ en: z.string().min(1).max(80), hi: z.string().max(80).optional() })
  .strict();
const base = {
  name: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
    .refine(
      (v) => !['constructor', 'prototype', '__proto__'].includes(v),
      'Reserved control name.',
    ),
  label,
  group: z.enum(['basic', 'advanced']).default('basic'),
  help: label.optional(),
};
const bounded = {
  min: finite,
  max: finite,
  step: finite.positive(),
  unit: z.string().max(20).optional(),
};
export const easingSchema = z.enum([
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'hold',
]);
export const paramSpecSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        ...base,
        type: z.literal('number'),
        ...bounded,
        default: finite,
      })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal('angle'),
        ...bounded,
        default: finite,
      })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal('color'),
        default: z.string().regex(/^#[\da-f]{6}([\da-f]{2})?$/i),
      })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal('text'),
        default: z.string(),
        maxLength: z.number().int().min(1).max(10000).default(200),
      })
      .strict(),
    z
      .object({ ...base, type: z.literal('bool'), default: z.boolean() })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal('select'),
        default: z.string(),
        options: z.array(z.string().min(1).max(100)).min(1).max(100),
      })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal('point'),
        default: z
          .object({ x: finite.min(0).max(1), y: finite.min(0).max(1) })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal('range'),
        ...bounded,
        default: z.tuple([finite, finite]),
      })
      .strict(),
    z
      .object({ ...base, type: z.literal('easing'), default: easingSchema })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal('media'),
        default: z.string().max(129),
        kind: z.enum(['image', 'video', 'audio']).optional(),
      })
      .strict(),
  ])
  .superRefine((p, c) => {
    const bad = (message: string) => c.addIssue({ code: 'custom', message });
    if ('min' in p) {
      if (p.min > p.max) bad('Minimum exceeds maximum.');
      for (const n of Array.isArray(p.default) ? p.default : [p.default])
        if (n < p.min || n > p.max) bad('Default must lie inside min/max.');
    }
    if (p.type === 'range' && p.default[0] > p.default[1])
      bad('Range must be ordered.');
    if (p.type === 'text' && p.default.length > p.maxLength)
      bad('Default text exceeds maxLength.');
    if (
      p.type === 'select' &&
      (!p.options.includes(p.default) ||
        new Set(p.options).size !== p.options.length)
    )
      bad('Select needs unique options containing its default.');
    if (p.type === 'media' && /[:/\\]/.test(p.default))
      bad('Media default is an opaque slot id, never a URL/path.');
  });
export type ParamSpec = z.infer<typeof paramSpecSchema>;
export type ControlValue = ParamSpec['default'];
export const controlsSchema = z
  .array(paramSpecSchema)
  .max(24)
  .superRefine((controls, ctx) => {
    if (controls.filter((c) => c.group === 'basic').length > 8)
      ctx.addIssue({
        code: 'custom',
        message: 'At most 8 basic controls; move others to advanced.',
      });
    if (new Set(controls.map((c) => c.name)).size !== controls.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate control name.' });
  });
export function controlValues(
  controls: readonly ParamSpec[],
  overrides: Record<string, unknown> = {},
): Record<string, ControlValue> {
  for (const key of Object.keys(overrides))
    if (!controls.some((c) => c.name === key))
      throw Error(`Unknown control ${key}.`);
  return Object.fromEntries(
    controls.map((p) => {
      const r = paramSpecSchema.safeParse({
        ...p,
        default: Object.hasOwn(overrides, p.name)
          ? overrides[p.name]
          : p.default,
      });
      if (!r.success)
        throw Error(`Control ${p.name}: ${r.error.issues[0]!.message}`);
      return [p.name, r.data.default];
    }),
  );
}
