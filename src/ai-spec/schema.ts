import { z } from 'zod';
import { validateSpecs } from './vendor/blocks/params';
export const SPEC_VERSION = 1 as const;
export const LIMITS = Object.freeze({
  bytes: 1_048_576,
  scenes: 12,
  items: 128,
  duration: 180,
  depth: 24,
  nodes: 50000,
});
export const safeId = z
  .string()
  .regex(
    /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
    'Use 1–64 letters, digits, underscore or hyphen; start with a letter',
  )
  .refine(
    (v) => !['constructor', 'prototype', '__proto__'].includes(v),
    'Reserved identifier',
  );
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const color = z
  .string()
  .regex(/^#[\da-f]{6}([\da-f]{2})?$/i, 'Expected #RRGGBB or #RRGGBBAA');
const seed = num(0, 4294967295).int();
const seconds = num(0, LIMITS.duration);
const positiveTime = num(0.001, LIMITS.duration);
const value = z.union([num(-1e9, 1e9), z.string().max(1000), z.boolean()]);
const reference = z.object({ $param: safeId }).strict();
const paramBase = { name: safeId, label: z.string().min(1).max(100) };
export const parameterSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...paramBase,
      type: z.literal('number'),
      min: num(-1e9, 1e9),
      max: num(-1e9, 1e9),
      step: num(Number.MIN_VALUE, 1e9),
      default: num(-1e9, 1e9),
    })
    .strict(),
  z.object({ ...paramBase, type: z.literal('color'), default: color }).strict(),
  z
    .object({
      ...paramBase,
      type: z.literal('text'),
      default: z.string().max(1000),
      maxLength: num(1, 1000).int().default(200),
    })
    .strict(),
  z
    .object({ ...paramBase, type: z.literal('bool'), default: z.boolean() })
    .strict(),
  z
    .object({
      ...paramBase,
      type: z.literal('select'),
      default: z.string().max(100),
      options: z.array(z.string().max(100)).min(1).max(32),
    })
    .strict(),
]);
const parameters = z
  .array(parameterSchema)
  .max(32)
  .default([])
  .superRefine((params, ctx) => {
    try {
      validateSpecs(params);
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: String(e) });
    }
  });
const ease = z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold']);
type Field<T extends z.ZodTypeAny, B extends boolean> = B extends true
  ? z.ZodUnion<[T, typeof reference]>
  : T;
function makeSchema<B extends boolean>(bindings: B) {
  const editable = <T extends z.ZodTypeAny>(schema: T): Field<T, B> =>
    (bindings ? z.union([schema, reference]) : schema) as Field<T, B>;
  const dictionary = z
    .record(safeId, editable(value))
    .default({})
    .refine((v) => Object.keys(v).length <= 32, 'At most 32 parameter values');
  const transform = z
    .object({
      x: editable(num(-32768, 32768)).default(0),
      y: editable(num(-32768, 32768)).default(0),
      scale: editable(num(0.01, 100)).default(1),
      rotation: editable(num(-3600, 3600)).default(0),
      opacity: editable(num(0, 1)).default(1),
    })
    .strict()
    .default({});
  const fx = z
    .object({
      id: z
        .string()
        .max(80)
        .regex(
          /^(effect|filter|adjust)\.[a-z0-9-]+$/,
          'Expected a pinned FX library id',
        ),
      params: dictionary,
      seed,
    })
    .strict();
  const base = {
    id: safeId,
    name: z.string().min(1).max(100),
    start: seconds,
    duration: positiveTime,
    transform,
    depth: editable(num(0, 1)).default(1),
    fx: z.array(fx).max(8).default([]),
  };
  const box = { width: editable(num(1, 4096)), height: editable(num(1, 4096)) };
  const item = z.discriminatedUnion('kind', [
    z
      .object({
        ...base,
        kind: z.literal('text'),
        text: editable(z.string().max(1000)),
        fontSize: editable(num(1, 512)).default(48),
        fontFamily: z
          .enum(['Arial', 'Georgia', 'Courier New'])
          .default('Arial'),
        fill: editable(color).default('#ffffff'),
        ...box,
      })
      .strict(),
    z
      .object({
        ...base,
        kind: z.literal('shape'),
        shape: z.enum(['rectangle', 'ellipse']),
        fill: editable(color),
        ...box,
      })
      .strict(),
    z
      .object({
        ...base,
        kind: z.literal('image-placeholder'),
        prompt: z.string().min(1).max(1000),
        slot: safeId,
        ...box,
      })
      .strict(),
    z
      .object({
        ...base,
        kind: z.literal('media-slot'),
        slot: safeId,
        sourceIn: seconds.default(0),
        ...box,
      })
      .strict(),
    z
      .object({
        ...base,
        kind: z.literal('audio-slot'),
        slot: safeId,
        sourceIn: seconds.default(0),
      })
      .strict(),
    z
      .object({
        ...base,
        kind: z.literal('code-block'),
        blockId: safeId,
        blockVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
        params: dictionary,
        seed,
      })
      .strict(),
  ]);
  const camera = z
    .object({
      x: editable(num(-32768, 32768)),
      y: editable(num(-32768, 32768)),
      zoom: editable(num(0.01, 100)),
      rotation: editable(num(-3600, 3600)),
      shake: z
        .object({
          amplitude: editable(num(0, 4096)),
          frequency: editable(num(0, 1000)),
          seed,
        })
        .strict(),
    })
    .strict();
  const cameraMove = z
    .object({
      id: safeId,
      start: seconds,
      duration: positiveTime,
      from: camera,
      to: camera,
      easing: ease.default('linear'),
    })
    .strict();
  return z
    .object({
      version: z.literal(SPEC_VERSION),
      id: safeId,
      title: z.string().min(1).max(100),
      canvas: z
        .object({
          width: num(16, 4096).int(),
          height: num(16, 4096).int(),
          fps: z.union([
            z.literal(24),
            z.literal(25),
            z.literal(30),
            z.literal(50),
            z.literal(60),
          ]),
        })
        .strict()
        .refine(
          (s) => s.width * s.height <= 8388608,
          'Canvas exceeds 8,388,608 pixels',
        ),
      parameters,
      assets: z
        .array(
          z
            .object({
              id: safeId,
              kind: z.enum(['image', 'video', 'audio']),
              description: z.string().min(1).max(1000),
              assetId: safeId.optional(),
            })
            .strict(),
        )
        .max(32)
        .default([]),
      blocks: z
        .array(
          z
            .object({ id: safeId, source: z.string().min(1).max(32768) })
            .strict(),
        )
        .max(8)
        .default([]),
      scenes: z
        .array(
          z
            .object({
              id: safeId,
              name: z.string().min(1).max(100),
              duration: positiveTime,
              background: editable(color).default('#101219'),
              items: z.array(item).min(1).max(64),
              cameraMoves: z.array(cameraMove).max(8).default([]),
              transition: z
                .object({
                  id: z.enum([
                    'crossfade',
                    'fade-black',
                    'fade-white',
                    'wipe-left',
                    'wipe-right',
                    'slide-left',
                    'slide-right',
                  ]),
                  duration: positiveTime,
                })
                .strict()
                .optional(),
            })
            .strict(),
        )
        .min(1)
        .max(LIMITS.scenes),
    })
    .strict();
}
/** Use validateSpec for bounded JSON preflight, references and catalog validation. */
export const compositionSpecSchema = makeSchema(true);
export const resolvedSpecSchema = makeSchema(false);
// Concrete inference is narrowed after resolution; Zod's dynamic schema factory
// intentionally exposes no unchecked command or executable-function types.
export type CompositionSpec = z.infer<typeof resolvedSpecSchema>;
export type Scalar = number | string | boolean;
