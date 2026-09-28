import { mixdown } from '../export/mixdown';
import type { AudibleClip, AudioDecoder } from '../media/audio';
import { defaultAudioSettings, normalizationSignature } from './settings';
import { measureLoudness, normalizationAdjustment } from './loudness';

/** Analyse a clip through the SAME processing graph, then store a post-graph gain.
 * Any timing/settings edit invalidates this result through its signature.
 */
export async function normalizeClip(
  clip: AudibleClip,
  decoder: AudioDecoder,
  target: number,
) {
  if (clip.duration > 300)
    throw new Error('Normalization is limited to five-minute clips');
  const audio = {
    ...(clip.audio ?? defaultAudioSettings()),
    normalization: null,
  };
  const rendered = await mixdown(
    [{ ...clip, audio }],
    decoder,
    clip.startTime,
    clip.startTime + clip.duration,
  );
  if (!rendered)
    throw new Error('Audio is unavailable, silent, or unsupported');
  const measurement = measureLoudness(rendered.channels, rendered.sampleRate);
  const adjustment = normalizationAdjustment(measurement, target);
  return {
    ...audio,
    normalization: {
      gainDb: adjustment.gainDb,
      measuredLufs: measurement.lufs!,
      targetLufs: target,
      limited: adjustment.limited,
      signature: normalizationSignature(clip, audio),
    },
  };
}
