// T-ALL P6: a clip's effect stack, stored in its metadata as
// `fx: { version: 1, stack: [{ id, params }], blendMode }` (schema unchanged,
// read defensively). Ids name items of the FX library (src/fx); the UI
// sanitizes params with the library before a command. Unknown ids are kept
// and skipped when drawing.
import { z } from 'zod';

export const FX_ID = /^(adjust|filter|effect)\.[a-z0-9-]+$/;
export const BLEND_ID = /^blend\.[a-z-]+$/;
export const MAX_FX_STACK = 16;
const paramValue = z.union([
  z.number().finite(),
  z.boolean(),
  z.string().max(64),
]);
export const fxEntrySchema = z
  .object({
    id: z.string().regex(FX_ID),
    params: z.record(z.string().max(32), paramValue),
  })
  .strict();
export const clipFxSchema = z
  .object({
    version: z.literal(1),
    stack: z.array(fxEntrySchema).max(MAX_FX_STACK),
    blendMode: z.string().regex(BLEND_ID).optional(),
  })
  .strict();
export type ClipFx = z.infer<typeof clipFxSchema>;
export type FxEntry = z.infer<typeof fxEntrySchema>;

/** A clip's effect stack, or null when it has none (or it is unreadable). */
export function clipFx(clip: {
  readonly metadata: Readonly<Record<string, unknown>>;
}): ClipFx | null {
  const parsed = clipFxSchema.safeParse(clip.metadata.fx);
  return parsed.success ? parsed.data : null;
}
