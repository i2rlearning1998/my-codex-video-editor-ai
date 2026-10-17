import { z } from 'zod';
import type { Easing } from '../core/model';
const point = z.tuple([z.number().finite(), z.number().finite()]);
export const geometrySchema = z.array(point).min(2).max(300);
export const maskSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.enum(['rect', 'ellipse', 'polygon', 'path']),
    geometry: geometrySchema,
    feather: z.number().finite().min(0).max(500).optional(),
    expansion: z.number().finite().min(-500).max(500).optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    invert: z.boolean().optional(),
    mode: z.enum(['add', 'subtract', 'intersect']).optional(),
    keyframes: z
      .array(
        z
          .object({
            time: z.number().finite().nonnegative(),
            value: geometrySchema,
            easing: z.custom<Easing>().optional(),
          })
          .strict(),
      )
      .max(1000)
      .optional(),
  })
  .strict()
  .superRefine((m, c) => {
    const count = m.geometry.length;
    if (
      ((m.type === 'rect' || m.type === 'ellipse') && count !== 2) ||
      (m.type === 'polygon' && count < 3) ||
      (m.type === 'path' && (count < 4 || (count - 1) % 3 !== 0))
    )
      c.addIssue({
        code: 'custom',
        message: 'Invalid mask geometry point count',
      });
    if (
      m.keyframes?.some(
        (k, i, a) =>
          k.value.length !== count || (i > 0 && k.time <= a[i - 1]!.time),
      )
    )
      c.addIssue({
        code: 'custom',
        message: 'Mask keys must be sorted, unique and preserve point count',
      });
  });
export type Mask = z.infer<typeof maskSchema>;
export const matteSchema = z
  .object({
    layerId: z.string().min(1).max(128),
    type: z.enum(['alpha', 'luma']),
    invert: z.boolean().optional(),
  })
  .strict();
export type Matte = z.infer<typeof matteSchema>;
