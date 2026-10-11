// V7 (spec 11.5): a text to speech clip remembers what made it, in
// `clip.metadata.tts` (schema unchanged), so its panel reopens with the
// same text, voice and speed. Set through the capability Command Bus like
// the audio settings, so it is validated and undone with the rest.
import { z } from 'zod';
import type { Command, EditorEngine, JsonValue } from '../../core';
import { compositionById } from '../../core/scene';
import { MAX_TTS_TEXT } from './types';

export const ttsSettingsSchema = z
  .object({
    provider: z.string().min(1).max(64),
    language: z.string().min(1).max(64),
    voice: z.string().min(1).max(256),
    speed: z.number().finite().min(0.5).max(2),
    text: z.string().max(MAX_TTS_TEXT),
  })
  .strict();
export type TtsSettings = z.infer<typeof ttsSettingsSchema>;
export function readTtsSettings(clip: {
  readonly metadata?: object;
}): TtsSettings | null {
  const parsed = ttsSettingsSchema.safeParse(
    (clip.metadata as Record<string, unknown> | undefined)?.tts,
  );
  return parsed.success ? parsed.data : null;
}
const inputSchema = z
  .object({
    compositionId: z.string().min(1),
    clipId: z.string().min(1),
    settings: ttsSettingsSchema.nullable(),
  })
  .strict();
export function registerTtsCommands(engine: EditorEngine): void {
  if (engine.capabilities.list().some((item) => item.id === 'tts')) return;
  engine.capabilities.register({
    id: 'tts',
    version: '1.0.0',
    inputSchema,
    outputSchema: z.null(),
    commands: {
      SET: {
        inputSchema,
        outputSchema: z.null(),
        apply(draft, raw) {
          const input = inputSchema.parse(raw);
          const composition = compositionById(draft, input.compositionId);
          const track = composition.tracks.find((item) =>
            item.clips.some((clip) => clip.id === input.clipId),
          );
          const clip = track?.clips.find((item) => item.id === input.clipId);
          if (!track || !clip) throw new Error('Unknown clip');
          if (track.locked) throw new Error('Track is locked');
          if (input.settings === null) delete clip.metadata.tts;
          else clip.metadata.tts = input.settings as unknown as JsonValue;
          return null;
        },
      },
    },
  });
}
export const ttsCommand = (
  compositionId: string,
  clipId: string,
  settings: TtsSettings | null,
): Command =>
  ({
    type: 'plugin:tts:SET',
    input: { compositionId, clipId, settings },
  }) as unknown as Command;
