import { z } from 'zod';

export const SCHEMA_VERSION = 5;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ]),
);
export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine(
    (id) => !['__proto__', 'constructor', 'prototype'].includes(id),
    'Reserved identifier',
  );
export const nameSchema = z.string().trim().min(1).max(256);
const finite = z.number().finite();
const positive = finite.positive();
const vector = z.tuple([finite, finite]);
/**
 * Schema 5 (ANI-002): the easing of the segment that starts at a keyframe.
 * Absent means linear. Cubic x1 and x2 stay in [0, 1] so time is monotonic.
 */
export const easingSchema = z.union([
  z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold']),
  z
    .object({
      type: z.literal('cubic'),
      x1: finite.min(0).max(1),
      y1: finite,
      x2: finite.min(0).max(1),
      y2: finite,
    })
    .strict(),
]);
export type Easing = z.infer<typeof easingSchema>;
const frames = <T extends z.ZodTypeAny>(value: T) =>
  z.array(
    z
      .object({
        time: finite.nonnegative(),
        value,
        easing: easingSchema.optional(),
      })
      .strict(),
  );
const propertyBase = {
  animated: z.boolean(),

  constraints: z.array(jsonSchema),
};
export const propertySchema = z.discriminatedUnion('type', [
  z
    .object({
      ...propertyBase,
      type: z.literal('number'),
      value: finite,
      keyframes: frames(finite),
    })
    .strict(),
  z
    .object({
      ...propertyBase,
      type: z.literal('string'),
      value: z.string(),
      keyframes: frames(z.string()),
    })
    .strict(),
  z
    .object({
      ...propertyBase,
      type: z.literal('boolean'),
      value: z.boolean(),
      keyframes: frames(z.boolean()),
    })
    .strict(),
  z
    .object({
      ...propertyBase,
      type: z.literal('vector2'),
      value: vector,
      keyframes: frames(vector),
    })
    .strict(),
  z
    .object({
      ...propertyBase,
      type: z.literal('color'),
      keyframes: frames(z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)),
      value: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/),
    })
    .strict(),
]);
export type Property = z.infer<typeof propertySchema>;
const numberProperty = propertySchema.options[0];
const vectorProperty = propertySchema.options[3];
export const transformSchema = z
  .object({
    position: vectorProperty,
    rotation: numberProperty,
    scale: vectorProperty,
    opacity: numberProperty.extend({
      value: finite.min(0).max(1),
      keyframes: frames(finite.min(0).max(1)),
    }),
  })
  .strict();
export type Transform = z.infer<typeof transformSchema>;
export const layerTypeSchema = z.enum([
  'group',
  'video',
  'audio',
  'image',
  'text',
  'shape',
]);
export interface Layer {
  id: string;
  name: string;
  type: z.infer<typeof layerTypeSchema>;
  startTime: number;
  duration: number;
  transform: Transform;
  properties: Record<string, Property>;
  effects: [];
  masks: [];
  assetId: string | null;
  children: Layer[];
}
export const layerSchema: z.ZodType<Layer> = z.lazy(() =>
  z
    .object({
      id: idSchema,
      name: nameSchema,
      type: layerTypeSchema,
      startTime: finite.nonnegative(),
      duration: positive,
      transform: transformSchema,
      properties: z.record(idSchema, propertySchema),
      effects: z.tuple([]),
      masks: z.tuple([]),
      assetId: idSchema.nullable(),
      children: z.array(layerSchema),
    })
    .strict()
    .superRefine((layer, ctx) => {
      if (layer.type !== 'group' && layer.children.length)
        ctx.addIssue({
          code: 'custom',
          message: 'Only groups can contain children',
        });
      if (layer.type === 'group' && layer.assetId !== null)
        ctx.addIssue({
          code: 'custom',
          message: 'Groups cannot reference assets',
        });
    }),
);
export const clipSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    layerId: idSchema,
    assetId: idSchema.nullable(),
    startTime: finite.nonnegative(),
    duration: positive,
    sourceIn: finite.nonnegative(),
    sourceOut: positive,
    enabled: z.boolean(),
    speed: positive.max(16),
    transitionMetadata: z.record(jsonSchema),
    effectMetadata: z.record(jsonSchema),
    metadata: z.record(jsonSchema),
  })
  .strict()
  .superRefine((clip, ctx) => {
    if (
      clip.sourceOut <= clip.sourceIn ||
      !Number.isFinite(clip.startTime + clip.duration)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid clip timing' });
  });
export type Clip = z.infer<typeof clipSchema>;
export const trackTypeSchema = z.enum(['video', 'audio', 'text', 'object']);
export const trackSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    type: trackTypeSchema,
    order: z.number().int().nonnegative(),
    enabled: z.boolean(),
    locked: z.boolean(),
    muted: z.boolean(),
    clips: z.array(clipSchema),
  })
  .strict();
export type Track = z.infer<typeof trackSchema>;
export const compositionSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    width: positive.int().max(32768),
    height: positive.int().max(32768),
    fps: positive.max(240),
    duration: positive,
    layers: z.array(layerSchema),
    tracks: z.array(trackSchema),
    markers: z.array(
      z
        .object({ id: idSchema, time: finite.nonnegative(), label: z.string() })
        .strict(),
    ),
    audioTracks: z.tuple([]),
  })
  .strict()
  .superRefine((composition, ctx) => {
    const checkTiming = (layers: Layer[]) => {
      for (const layer of layers) {
        if (!Number.isFinite(layer.startTime + layer.duration))
          ctx.addIssue({
            code: 'custom',
            message: 'Layer timing exceeds numerical limits',
          });
        for (const property of [
          ...Object.values(layer.transform),
          ...Object.values(layer.properties),
        ]) {
          let previous = -1;
          for (const keyframe of property.keyframes) {
            if (
              !property.animated ||
              keyframe.time <= previous ||
              !Number.isFinite(keyframe.time)
            )
              ctx.addIssue({
                code: 'custom',
                message: 'Invalid keyframe timing or animation flag',
              });
            previous = keyframe.time;
          }
        }
        checkTiming(layer.children);
      }
    };
    checkTiming(composition.layers);
    const ids = new Set<string>();
    for (const marker of composition.markers) {
      if (ids.has(marker.id))
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid or duplicate marker',
        });
      ids.add(marker.id);
    }
    const orders = new Set<number>();
    for (const track of composition.tracks) {
      if (orders.has(track.order))
        ctx.addIssue({ code: 'custom', message: 'Duplicate track order' });
      orders.add(track.order);
    }
  });
export type Composition = z.infer<typeof compositionSchema>;
export const assetSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    type: z.enum(['video', 'audio', 'image', 'font', 'other']),
    source: z
      .object({
        kind: z.enum(['local', 'uri', 'generated']),
        reference: z.string().min(1),
      })
      .strict(),
    metadata: z.record(jsonSchema),
    width: positive.int().optional(),
    height: positive.int().optional(),
    duration: finite.nonnegative().optional(),
  })
  .strict();
export type Asset = z.infer<typeof assetSchema>;
export const projectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: idSchema,
    metadata: z
      .object({
        name: nameSchema,
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
      })
      .strict(),
    settings: z
      .object({
        backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        audioSampleRate: z.union([z.literal(44100), z.literal(48000)]),
      })
      .strict(),
    compositions: z.array(compositionSchema).min(1),
    assets: z.array(assetSchema),
  })
  .strict()
  .superRefine((project, ctx) => {
    const ids = new Set<string>([project.id]);
    const assetIds = new Map(project.assets.map((asset) => [asset.id, asset]));
    const unique = (id: string) => {
      if (ids.has(id))
        ctx.addIssue({ code: 'custom', message: `Duplicate ID: ${id}` });
      ids.add(id);
    };
    project.assets.forEach((asset) => unique(asset.id));
    const visit = (layers: Layer[]) =>
      layers.forEach((layer) => {
        unique(layer.id);
        if (layer.assetId !== null) {
          const asset = assetIds.get(layer.assetId);
          if (!asset || asset.type !== layer.type)
            ctx.addIssue({
              code: 'custom',
              message: `Missing or incompatible asset for layer ${layer.id}`,
            });
        }
        visit(layer.children);
      });
    project.compositions.forEach((composition) => {
      unique(composition.id);
      composition.markers.forEach((marker) => unique(marker.id));
      visit(composition.layers);
      const layersById = new Map<string, Layer>();
      const collect = (layers: Layer[]) =>
        layers.forEach((layer) => {
          layersById.set(layer.id, layer);
          collect(layer.children);
        });
      collect(composition.layers);
      const linkedLayers = new Set<string>();
      composition.tracks.forEach((track) => {
        unique(track.id);
        track.clips.forEach((clip) => {
          unique(clip.id);
          const layer = layersById.get(clip.layerId);
          if (!layer || linkedLayers.has(clip.layerId))
            ctx.addIssue({
              code: 'custom',
              message: `Invalid or duplicate clip layer ${clip.layerId}`,
            });
          linkedLayers.add(clip.layerId);
          const compatible =
            layer &&
            (track.type === 'object'
              ? ['group', 'shape'].includes(layer.type)
              : track.type === 'video'
                ? ['video', 'image'].includes(layer.type)
                : layer.type === track.type);
          if (!compatible)
            ctx.addIssue({
              code: 'custom',
              message: `Incompatible layer for track ${track.id}`,
            });
          if (layer && clip.assetId !== layer.assetId)
            ctx.addIssue({
              code: 'custom',
              message: `Clip ${clip.id} asset does not match its layer`,
            });
          if (clip.assetId !== null) {
            const asset = assetIds.get(clip.assetId);
            if (!asset)
              ctx.addIssue({
                code: 'custom',
                message: `Missing asset for clip ${clip.id}`,
              });
            else if (
              asset.duration !== undefined &&
              clip.sourceOut > asset.duration
            )
              ctx.addIssue({
                code: 'custom',
                message: `Clip ${clip.id} exceeds its source duration`,
              });
          }
        });
      });
    });
  });
export type Project = z.infer<typeof projectSchema>;
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export function freeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

// Accept only JSON trees: reject cycles, exotic objects and lossy JSON values before parsing.
export function assertJson(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): void {
  if (depth > 100) throw new Error('Maximum document depth exceeded');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || ancestors.has(value))
    throw new Error('Expected an acyclic JSON value');
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error('Expected plain JSON objects');
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++)
      assertJson(value[i], ancestors, depth + 1);
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new Error('Unsafe JSON key');
      assertJson(child, ancestors, depth + 1);
    }
  }
  ancestors.delete(value);
}

export function validateProject(value: unknown): Project {
  assertJson(value);
  const project = projectSchema.parse(value);
  for (const composition of project.compositions) {
    const endpoints: number[] = [];
    const linkedLayers = new Set(
      composition.tracks.flatMap((track) =>
        track.clips.map((clip) => clip.layerId),
      ),
    );
    const visit = (layers: Layer[]) => {
      for (const layer of layers) {
        if (!linkedLayers.has(layer.id))
          endpoints.push(layer.startTime + layer.duration);
        for (const property of [
          ...Object.values(layer.transform),
          ...Object.values(layer.properties),
        ])
          endpoints.push(...property.keyframes.map((frame) => frame.time));
        visit(layer.children);
      }
    };
    visit(composition.layers);
    for (const track of composition.tracks)
      for (const clip of track.clips)
        endpoints.push(clip.startTime + clip.duration);
    endpoints.push(...composition.markers.map((marker) => marker.time));
    composition.duration = endpoints.length
      ? Math.max(1 / composition.fps, ...endpoints)
      : 10;
  }
  return projectSchema.parse(project);
}

export function createComposition(
  options: Partial<
    Pick<Composition, 'id' | 'name' | 'width' | 'height' | 'fps' | 'duration'>
  > = {},
): Composition {
  return compositionSchema.parse({
    id: crypto.randomUUID(),
    name: 'Composition 1',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 10,
    ...options,
    layers: [],
    tracks: [],
    markers: [],
    audioTracks: [],
  });
}

export function createProject(
  name = 'Untitled project',
  now = new Date().toISOString(),
): Project {
  return validateProject({
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    metadata: { name, createdAt: now, updatedAt: now },
    settings: { backgroundColor: '#101219', audioSampleRate: 48000 },
    compositions: [createComposition()],
    assets: [],
  });
}

export function number(value: number): Extract<Property, { type: 'number' }> {
  return {
    type: 'number',
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  };
}
export function vector2(
  x: number,
  y: number,
): Extract<Property, { type: 'vector2' }> {
  return {
    type: 'vector2',
    value: [x, y],
    animated: false,
    keyframes: [],
    constraints: [],
  };
}
export function createLayer(
  id: string,
  type: Layer['type'],
  name: string,
  duration = 10,
): Layer {
  return layerSchema.parse({
    id,
    type,
    name,
    startTime: 0,
    duration,
    transform: {
      position: vector2(0, 0),
      rotation: number(0),
      scale: vector2(1, 1),
      opacity: number(1),
    },
    properties: {},
    effects: [],
    masks: [],
    assetId: null,
    children: [],
  });
}
