import { z } from 'zod';
import type { EditorEngine, JsonValue } from '../core';
import { compositionById, requireLayer } from '../core/scene';

const db = z.number().finite().min(-96).max(24);
export const audioSettingsSchema = z
  .object({
    eq: z
      .object({
        low: z.number().finite().min(-18).max(18).default(0),
        mid: z.number().finite().min(-18).max(18).default(0),
        high: z.number().finite().min(-18).max(18).default(0),
      })
      .strict()
      .default({}),
    compressor: z
      .object({
        enabled: z.boolean().default(false),
        threshold: z.number().finite().min(-60).max(0).default(-24),
        ratio: z.number().finite().min(1).max(20).default(4),
        attack: z.number().finite().min(0).max(1).default(0.003),
        release: z.number().finite().min(0.01).max(1).default(0.25),
      })
      .strict()
      .default({}),
    normalization: z
      .object({
        gainDb: z.number().finite().min(-96).max(24),
        measuredLufs: z.number().finite(),
        targetLufs: z.number().finite().min(-36).max(-5),
        limited: z.boolean(),
        signature: z.string().max(65536),
      })
      .strict()
      .nullable()
      .default(null),
    role: z.enum(['none', 'speech', 'music']).default('none'),
    duck: z
      .object({
        enabled: z.boolean().default(false),
        thresholdDb: z.number().finite().min(-60).max(-6).default(-36),
        reductionDb: z.number().finite().min(-36).max(0).default(-12),
        attack: z.number().finite().min(0.01).max(2).default(0.05),
        hold: z.number().finite().min(0).max(2).default(0.15),
        release: z.number().finite().min(0.01).max(5).default(0.3),
      })
      .strict()
      .default({}),
    gainDb: db.default(0),
    pan: z.number().finite().min(-1).max(1).default(0),
    fadeIn: z.number().finite().min(0).max(86400).default(0),
    fadeOut: z.number().finite().min(0).max(86400).default(0),
    muted: z.boolean().default(false),
    // Clip-local seconds. Linear interpolation in dB; follows clip moves.
    volumeKeys: z
      .array(z.object({ time: z.number().finite().nonnegative(), db }).strict())
      .max(2048)
      .default([])
      .refine(
        (keys) => keys.every((k, i) => !i || k.time > keys[i - 1]!.time),
        'Volume keys must be sorted and unique',
      ),
  })
  .strict();
export type AudioSettings = z.infer<typeof audioSettingsSchema>;
export const defaultAudioSettings = (): AudioSettings =>
  audioSettingsSchema.parse({});
export function readAudioSettings(clip: {
  readonly metadata?: object;
}): AudioSettings {
  const value = (clip.metadata as Record<string, unknown> | undefined)?.audio;
  const parsed = audioSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : defaultAudioSettings();
}
const commandSchema = z
  .object({
    compositionId: z.string().min(1),
    clipId: z.string().min(1),
    settings: audioSettingsSchema.nullable(),
  })
  .strict();
/** Existing capability command bus: no new engine/model fields, same undo/validation. */
export function registerAudioCommands(engine: EditorEngine): void {
  if (engine.capabilities.list().some((c) => c.id === 'audio')) return;
  engine.capabilities.register({
    id: 'audio',
    version: '1.0.0',
    inputSchema: commandSchema,
    outputSchema: z.null(),
    commands: {
      SET: {
        inputSchema: commandSchema,
        outputSchema: z.null(),
        apply(draft, raw) {
          const input = commandSchema.parse(raw);
          const composition = compositionById(draft, input.compositionId);
          const track = composition.tracks.find((t) =>
            t.clips.some((c) => c.id === input.clipId),
          );
          const clip = track?.clips.find((c) => c.id === input.clipId);
          if (!track || !clip) throw new Error('Unknown audio clip');
          if (track.locked) throw new Error('Track is locked');
          const { layer } = requireLayer(composition, clip.layerId);
          if (layer.type !== 'audio' && layer.type !== 'video')
            throw new Error('Clip has no audio');
          if (input.settings?.duck.enabled && clip.duration > 300)
            throw new Error('Ducking is limited to five-minute music clips');
          if (input.settings === null) delete clip.metadata.audio;
          else clip.metadata.audio = input.settings as unknown as JsonValue;
          return null;
        },
      },
    },
  });
}
export function setClipAudio(
  engine: EditorEngine,
  compositionId: string,
  clipId: string,
  settings: AudioSettings | null,
  label: string,
): void {
  registerAudioCommands(engine);
  engine.commands.execute(
    {
      type: 'plugin:audio:SET',
      input: {
        compositionId,
        clipId,
        settings: settings as unknown as JsonValue,
      },
    },
    label,
  );
}
export const dbToGain = (db: number) => 10 ** (db / 20);
export function volumeDbAt(settings: AudioSettings, local: number): number {
  const keys = settings.volumeKeys;
  if (!keys.length) return settings.gainDb;
  if (local <= keys[0]!.time) return keys[0]!.db;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!,
      b = keys[i]!;
    if (local <= b.time)
      return a.db + ((b.db - a.db) * (local - a.time)) / (b.time - a.time);
  }
  return keys[keys.length - 1]!.db;
}
export function clipGainAt(
  settings: AudioSettings,
  local: number,
  duration: number,
): number {
  if (settings.muted || local < 0 || local > duration) return 0;
  const total = settings.fadeIn + settings.fadeOut;
  const factor = total > duration ? duration / total : 1;
  const fadeIn = settings.fadeIn * factor,
    fadeOut = settings.fadeOut * factor;
  const fade = Math.min(
    1,
    fadeIn ? local / fadeIn : 1,
    fadeOut ? (duration - local) / fadeOut : 1,
  );
  return dbToGain(volumeDbAt(settings, local)) * Math.max(0, fade);
}

export function normalizationSignature(
  clip: {
    duration: number;
    sourceIn: number;
    sourceOut: number;
    speed: number;
    reversed: boolean;
  },
  audio: AudioSettings,
): string {
  const { normalization: _normalization, ...processing } = audio;
  return JSON.stringify([
    clip.duration,
    clip.sourceIn,
    clip.sourceOut,
    clip.speed,
    clip.reversed,
    processing,
  ]);
}
