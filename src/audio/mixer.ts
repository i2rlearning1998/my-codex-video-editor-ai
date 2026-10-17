import { z } from 'zod';
import type { EditorEngine } from '../core';
import { compositionById } from '../core/scene';
import {
  clipGainAt,
  defaultAudioSettings,
  type AudioSettings,
} from './settings';
import { duckGainAt, type DuckEnvelope } from './ducking';
export const volumeSchema = z.number().finite().min(0).max(2);
export function safeVolume(value: unknown): number {
  const parsed = volumeSchema.safeParse(value);
  return parsed.success ? parsed.data : 1;
}
export function mixedGainAt(
  clip: {
    audio?: AudioSettings;
    duration: number;
    trackVolume?: number;
    masterVolume?: number;
    duckEnvelope?: DuckEnvelope;
  },
  local: number,
): number {
  return (
    safeVolume(clip.trackVolume) *
    safeVolume(clip.masterVolume) *
    clipGainAt(clip.audio ?? defaultAudioSettings(), local, clip.duration) *
    duckGainAt(clip.duckEnvelope, local)
  );
}
export function fadePreset(
  settings: AudioSettings,
  kind: 'in' | 'out' | 'both',
  seconds = 0.5,
): AudioSettings {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400)
    throw Error('Invalid fade duration');
  return {
    ...settings,
    ...(kind !== 'out' ? { fadeIn: seconds } : {}),
    ...(kind !== 'in' ? { fadeOut: seconds } : {}),
  };
}
const inputSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('master'), volume: volumeSchema }).strict(),
  z
    .object({
      scope: z.literal('track'),
      compositionId: z.string(),
      trackId: z.string(),
      volume: volumeSchema,
    })
    .strict(),
]);
export function setMixerVolume(
  engine: EditorEngine,
  input: z.infer<typeof inputSchema>,
  label = 'Audio volume',
): void {
  if (!engine.capabilities.list().some((c) => c.id === 'audio-mixer'))
    engine.capabilities.register({
      id: 'audio-mixer',
      version: '1.0.0',
      inputSchema,
      outputSchema: z.null(),
      commands: {
        SET: {
          inputSchema,
          outputSchema: z.null(),
          apply(project, raw) {
            const p = inputSchema.parse(raw);
            if (p.scope === 'master') project.settings.masterVolume = p.volume;
            else {
              const track = compositionById(
                project,
                p.compositionId,
              ).tracks.find((t) => t.id === p.trackId);
              if (!track) throw Error('Unknown track');
              if (track.locked) throw Error('Track is locked');
              track.volume = p.volume;
            }
            return null;
          },
        },
      },
    });
  engine.commands.execute({ type: 'plugin:audio-mixer:SET', input }, label);
}
