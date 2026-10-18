import { z } from 'zod';
import type { EditorEngine } from '../core/engine';
import { compositionById, requireLayer } from '../core/scene';
const inputSchema = z
  .object({
    compositionId: z.string(),
    layerId: z.string(),
    blendMode: z.string().max(64),
  })
  .strict();
export function setLayerBlendMode(
  engine: EditorEngine,
  input: z.infer<typeof inputSchema>,
  label = 'Layer blend mode',
) {
  registerLayerBlend(engine);
  engine.commands.execute({ type: 'plugin:layer-blend:SET', input }, label);
}

/** FINAL2 U7: registers the capability so the UI can put its command in a transaction or a preview. */
export function registerLayerBlend(engine: EditorEngine) {
  if (!engine.capabilities.list().some((c) => c.id === 'layer-blend'))
    engine.capabilities.register({
      id: 'layer-blend',
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
            layer.blendMode = p.blendMode;
            return null;
          },
        },
      },
    });
}
