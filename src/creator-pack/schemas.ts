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
/** B1: a style's free-text field: bounded, no links (styles never fetch). */
const styleText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (text) => !/(https?:\/\/|www\.|ftp:\/\/)/i.test(text),
      'No URLs: a style is offline text.',
    );
/** B1: a kit id, or `{id, optional: true}` when the editor may lack it. */
export const kitIdSchema = z.union([
  z.string().min(1).max(129),
  z
    .object({ id: z.string().min(1).max(129), optional: z.literal(true) })
    .strict(),
]);
export const STYLE_CATEGORIES = [
  'documentary',
  'youtube-intro',
  'logo-reveal-2d',
  'logo-reveal-3d',
  'reels',
  'education',
  'animation-2d',
  'animation-3d',
  'recorded-video-enhance',
  'custom',
] as const;
export const STYLE_INPUTS = [
  'topic',
  'script',
  'audio',
  'video',
  'reference',
  'logo',
  'brand',
] as const;
export const STYLE_ASPECTS = [
  '16:9',
  '9:16',
  '1:1',
  '4:5',
  '2:3',
  '21:9',
  '4:3',
] as const;
const unique = <T>(list: readonly T[]) => new Set(list).size === list.length;
/**
 * B1: a style, a reusable creative direction for the AI creator (what kind
 * of video, how it should feel, which library pieces it likes, the asset
 * policy and the output). It is never placed on the canvas.
 */
export const styleDataSchema = z
  .object({
    category: z.enum(STYLE_CATEGORIES),
    description: styleText(600),
    thumbnail: z
      .string()
      .max(200_000)
      .regex(
        /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/,
        'Thumbnail must be a base64 data: URI image.',
      )
      .optional(),
    brief: z
      .object({
        mood: styleText(200),
        pacing: styleText(300),
        structure: z.array(styleText(200)).min(1).max(12),
        doNot: z.array(styleText(200)).max(12),
        qualityBar: styleText(300),
      })
      .strict(),
    look: z
      .object({
        themeId: idSchema.optional(),
        palette: z
          .object({
            background: hexColor,
            primary: hexColor,
            accent: hexColor,
            text: hexColor,
            extra: hexColor.optional(),
          })
          .strict()
          .optional(),
        fonts: z
          .object({
            heading: z.string().min(1).max(40),
            body: z.string().min(1).max(40),
          })
          .strict()
          .optional(),
        motion: z.enum(['calm', 'snappy', 'bouncy', 'cinematic']).optional(),
      })
      .strict(),
    kit: z
      .object({
        preferLibrary: z.array(kitIdSchema).max(24),
        presets: z.array(kitIdSchema).max(24),
        transitions: z.array(kitIdSchema).max(24),
        effects: z.array(kitIdSchema).max(24),
      })
      .strict(),
    inputs: z
      .object({
        accepts: z
          .array(z.enum(STYLE_INPUTS))
          .min(1)
          .max(STYLE_INPUTS.length)
          .refine(unique, 'List each input once.'),
      })
      .strict(),
    assetPolicy: z
      .object({
        order: z
          .array(z.enum(['library', 'stock', 'ai']))
          .min(1)
          .max(3)
          .refine(unique, 'List each source once.')
          .refine(
            (order) => order[0] === 'library',
            'The editor library comes first.',
          )
          .refine(
            (order) => !order.includes('ai') || order.at(-1) === 'ai',
            'AI-generated assets come last.',
          ),
        aiImagesMax: number.int().min(0).max(50),
        aiVideosMax: number.int().min(0).max(20),
      })
      .strict(),
    output: z
      .object({
        aspect: z.enum(STYLE_ASPECTS),
        fps: number.int().min(12).max(120),
        durationHint: styleText(60),
      })
      .strict(),
    defaultFreedom: z.enum(['strict', 'guided', 'free']),
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
        type: z.literal('style'),
        controls: z.never().optional(),
        data: styleDataSchema,
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
/** T2: every item kind the schema accepts, read from the schema itself. */
export const ITEM_KINDS: readonly string[] = (
  v1ItemSchema as unknown as {
    _def: { schema: { options: { shape: { type: { value: string } } }[] } };
  }
)._def.schema.options.map((option) => option.shape.type.value);
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
export type StyleData = z.infer<typeof styleDataSchema>;
export type KitId = z.infer<typeof kitIdSchema>;
