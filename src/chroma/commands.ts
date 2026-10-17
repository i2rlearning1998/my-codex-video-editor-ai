import { z } from 'zod';
import type { EditorEngine } from '../core/engine';
import { jsonSchema } from '../core/model';
import { compositionById, requireLayer } from '../core/scene';
import { chromaSchema } from './types';
const inputSchema = z
  .object({
    compositionId: z.string(),
    layerId: z.string(),
    chromaKey: chromaSchema.nullable(),
  })
  .strict();
export function setChromaKey(
  engine: EditorEngine,
  input: z.infer<typeof inputSchema>,
  label = 'Chroma key',
) {
  if (!engine.capabilities.list().some((c) => c.id === 'chroma-key'))
    engine.capabilities.register({
      id: 'chroma-key',
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
            if (layer.type !== 'image' && layer.type !== 'video')
              throw new Error('Chroma key requires an image or video');
            if (
              composition.tracks.some(
                (t) => t.locked && t.clips.some((c) => c.layerId === layer.id),
              )
            )
              throw new Error('Track is locked');
            if (p.chromaKey === null) delete layer.chromaKey;
            else layer.chromaKey = p.chromaKey;
            return null;
          },
        },
      },
    });
  engine.commands.execute(
    {
      type: 'plugin:chroma-key:SET',
      input: jsonSchema.parse(
        JSON.parse(JSON.stringify(inputSchema.parse(input))),
      ),
    },
    label,
  );
}
