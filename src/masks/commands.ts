import { jsonSchema } from '../core/model';
import { z } from 'zod';
import type { EditorEngine } from '../core/engine';
import { compositionById, requireLayer } from '../core/scene';
import { maskSchema, matteSchema } from './types';
const inputSchema = z
  .object({
    compositionId: z.string(),
    layerId: z.string(),
    masks: z.array(maskSchema).max(32),
    matte: matteSchema.nullable().optional(),
  })
  .strict();
export function setLayerMasks(
  engine: EditorEngine,
  input: z.infer<typeof inputSchema>,
  label = 'Layer masks',
) {
  registerLayerMasks(engine);
  engine.commands.execute(
    {
      type: 'plugin:layer-masks:SET',
      input: jsonSchema.parse(
        JSON.parse(JSON.stringify(inputSchema.parse(input))),
      ),
    },
    label,
  );
}

/** FINAL2 U7: registers the capability so the UI can put its command in a transaction or a preview. */
export function registerLayerMasks(engine: EditorEngine) {
  if (!engine.capabilities.list().some((c) => c.id === 'layer-masks'))
    engine.capabilities.register({
      id: 'layer-masks',
      version: '1.0.0',
      inputSchema,
      outputSchema: z.null(),
      commands: {
        SET: {
          inputSchema,
          outputSchema: z.null(),
          apply(project, raw) {
            const p = inputSchema.parse(raw),
              composition = compositionById(project, p.compositionId),
              { layer } = requireLayer(composition, p.layerId);
            if (
              composition.tracks.some(
                (t) => t.locked && t.clips.some((c) => c.layerId === layer.id),
              )
            )
              throw new Error('Track is locked');
            layer.masks = p.masks;
            if (p.matte === null) delete layer.matte;
            else if (p.matte !== undefined) layer.matte = p.matte;
            return null;
          },
        },
      },
    });
}
