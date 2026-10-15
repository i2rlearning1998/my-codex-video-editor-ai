import { z } from 'zod';
import { libraryItemSchema } from '../library/schema';
import { controlsSchema } from './controls';
export const idSchema = z.string().regex(/^[a-z0-9-]{3,64}$/);
export const nameSchema = z
  .object({ en: z.string().min(1).max(80), hi: z.string().max(80).optional() })
  .strict();
const number = z.number().finite();
export const sourceSchema = z
  .string()
  .min(1)
  .refine(
    (s) => new TextEncoder().encode(s).length <= 1048576,
    'Source exceeds 1 MiB UTF-8.',
  );
const common = {
  id: idSchema,
  name: nameSchema,
  tags: z.array(z.string().min(1).max(30)).max(12),
  thumbnailTime: number.min(0).optional(),
  controls: controlsSchema.optional(),
  needs: z.array(z.string().min(1).max(129)).max(200).optional(),
};
export const presetSchema = z
  .object({
    appliesTo: z
      .array(
        z.enum(['any', 'text', 'shape', 'image', 'video', 'code', 'group']),
      )
      .min(1)
      .max(7),
    controls: controlsSchema,
    tracks: z
      .array(
        z
          .object({
            property: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/),
            keys: z
              .array(
                z
                  .object({
                    t: number.min(0).max(1),
                    v: z.union([number, z.string().min(1).max(2048)]),
                    ease: z
                      .enum([
                        'linear',
                        'ease-in',
                        'ease-out',
                        'ease-in-out',
                        'hold',
                      ])
                      .optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(64),
    loop: z
      .object({ mode: z.enum(['none', 'repeat', 'pingpong']) })
      .strict()
      .optional(),
  })
  .strict();
const meta = z
  .object({
    id: idSchema,
    name: z.union([z.string().min(1), nameSchema]),
    version: z.string().min(1),
    category: z.string().min(1),
    params: controlsSchema,
    duration: number.min(0.1).max(600).optional(),
    defaultDuration: number.min(0.1).max(600).optional(),
    fps: number.int().min(1).max(120).optional(),
    thumbnailTime: number.min(0).optional(),
    seekable: z.boolean().optional(),
    keepFrame: z.boolean().optional(),
    libs: z
      .array(z.enum(['three', 'pixi', 'lottie']))
      .max(3)
      .optional(),
  })
  .strict();
const step = z
  .object({ fx: z.string().min(1).max(100), params: z.record(z.unknown()) })
  .strict();
export const recipeSchema = z
  .object({
    mode: z.literal('recipe'),
    steps: z.array(step).min(1).max(64).optional(),
    from: z
      .union([
        z.string().min(1),
        z.object({ steps: z.array(step).min(1).max(64) }).strict(),
      ])
      .optional(),
  })
  .strict()
  .refine(
    (v) => !!v.steps !== !!v.from,
    'Recipe needs exactly one of steps or from.',
  );
const code = z
  .object({
    mode: z.literal('code'),
    source: sourceSchema,
    kind: z.enum(['adjust', 'filter', 'effect', 'transition']),
  })
  .strict();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** T1: a theme (palette slots, fonts, motion style, caption style). */
export const themeDataSchema = z
  .object({
    palette: z
      .object({
        background: hexColor,
        primary: hexColor,
        accent: hexColor,
        text: hexColor,
        extra: hexColor.optional(),
      })
      .strict(),
    fonts: z
      .object({
        heading: z.string().min(1).max(40),
        body: z.string().min(1).max(40),
      })
      .strict(),
    motion: z.enum(['calm', 'snappy', 'bouncy', 'cinematic']),
    caption: z.string().max(40).optional(),
  })
  .strict();
const native = libraryItemSchema.options.map((s) => s.extend({ ...common }));
const v1ItemSchema = z
  .union([
    native[0]!,
    native[1]!,
    native[2]!,
    native[3]!,
    z
      .object({
        ...common,
        type: z.literal('motion'),
        controls: z.never().optional(),
        data: z
          .object({ tier: z.enum(['B', 'C']), source: sourceSchema, meta })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('preset'),
        controls: z.never().optional(),
        data: presetSchema,
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('theme'),
        controls: z.never().optional(),
        data: themeDataSchema,
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('composition'),
        controls: z.never().optional(),
        data: z.object({ spec: z.record(z.unknown()) }).strict(),
      })
      .strict(),
    ...(['adjust', 'filter', 'effect', 'transition'] as const).map((type) =>
      z
        .object({
          ...common,
          type: z.literal(type),
          controls: controlsSchema,
          data:
            type === 'adjust'
              ? z.union([
                  z
                    .object({
                      values: z.record(
                        z.union([
                          number,
                          z.object({ $param: z.string() }).strict(),
                        ]),
                      ),
                    })
                    .strict(),
                  recipeSchema,
                  code,
                ])
              : z.union([recipeSchema, code]),
        })
        .strict(),
    ),
  ])
  .superRefine((item, ctx) => {
    if (['adjust', 'filter', 'effect', 'transition'].includes(item.type)) {
      const intensity = item.controls?.find((c) => c.name === 'intensity');
      if (
        !intensity ||
        intensity.type !== 'number' ||
        intensity.min !== 0 ||
        intensity.max !== 1 ||
        intensity.default !== 1
      )
        ctx.addIssue({
          code: 'custom',
          path: ['controls'],
          message: 'Declare intensity: number, min 0, max 1, default 1.',
        });
      if (
        'mode' in item.data &&
        item.data.mode === 'code' &&
        item.data.kind !== item.type
      )
        ctx.addIssue({
          code: 'custom',
          path: ['data', 'kind'],
          message: 'Code kind must match the item type.',
        });
    }
    if (item.type === 'motion' && item.data.meta.id !== item.id)
      ctx.addIssue({
        code: 'custom',
        path: ['data', 'meta', 'id'],
        message: 'Motion metadata id must match item id.',
      });
  });
export const itemSchema = z.preprocess((value, context) => {
  if (
    value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'font'
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Font is not supported in Creator Pack v1; fonts are phase 2.',
    });
    return z.NEVER;
  }
  return value;
}, v1ItemSchema);
export const packEnvelopeSchema = z
  .object({
    format: z.literal('creator-pack'),
    version: z.literal(1),
    pack: z
      .object({
        id: idSchema,
        name: nameSchema,
        version: number.int().positive(),
        author: z.enum(['ai', 'human']),
        createdWith: z.enum(['claude-chat', 'api', 'codex']),
        notes: z.string().max(2000).optional(),
      })
      .strict(),
    items: z.array(z.unknown()).max(200),
  })
  .strict();
export const packSchema = packEnvelopeSchema.extend({
  items: z.array(itemSchema).max(200),
});
export type CreatorItem = z.infer<typeof itemSchema>;
export type CreatorPack = z.infer<typeof packSchema>;
export type Preset = z.infer<typeof presetSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
