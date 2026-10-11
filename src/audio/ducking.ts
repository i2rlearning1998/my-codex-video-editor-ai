import type { AudibleClip } from '../media/audio';
import {
  clipGainAt,
  dbToGain,
  defaultAudioSettings,
  normalizationSignature,
} from './settings';

export interface PcmAudio {
  readonly sampleRate: number;
  readonly length: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}
export interface DuckEnvelope {
  readonly rate: number;
  readonly gains: Float32Array;
}
export const DUCK_RATE = 100;
export const MAX_DUCK_SECONDS = 300;
/** Detector reads source PCM after clip gain/fades/mute, before EQ/compression.
 * Explicit Speech roles are required: no voice classification or hidden provider.
 */
function speechPower(
  clip: AudibleClip,
  buffer: PcmAudio,
  time: number,
): number {
  const local = time - clip.startTime;
  if (local < 0 || local >= clip.duration) return 0;
  const audio = clip.audio ?? defaultAudioSettings();
  if (audio.muted) return 0;
  const sourceTime = clip.reversed
    ? clip.sourceOut - local * clip.speed
    : clip.sourceIn + local * clip.speed;
  const start = Math.max(
    0,
    Math.floor(
      (clip.reversed ? sourceTime - clip.speed / DUCK_RATE : sourceTime) *
        buffer.sampleRate,
    ),
  );
  const end = Math.min(
    buffer.length,
    Math.ceil(
      (clip.reversed ? sourceTime : sourceTime + clip.speed / DUCK_RATE) *
        buffer.sampleRate,
    ),
  );
  if (end <= start) return 0;
  let sum = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = start; i < end; i++) sum += data[i]! * data[i]!;
  }
  const normalized =
    audio.normalization?.signature === normalizationSignature(clip, audio)
      ? dbToGain(audio.normalization.gainDb)
      : 1;
  const gain = clipGainAt(audio, local, clip.duration) * normalized;
  return (sum / ((end - start) * buffer.numberOfChannels)) * gain * gain;
}
/** Deterministic per-music-clip envelope; shared preparation for preview and export. */
export function prepareDucking(
  clips: readonly AudibleClip[],
  buffers: ReadonlyMap<string, PcmAudio>,
): AudibleClip[] {
  const speech = clips.filter(
    (c) => c.audio?.role === 'speech' && !c.audio.muted,
  );
  return clips.map((clip) => {
    const audio = clip.audio ?? defaultAudioSettings();
    if (
      audio.role !== 'music' ||
      !audio.duck.enabled ||
      clip.duration > MAX_DUCK_SECONDS
    )
      return clip;
    const gains = new Float32Array(Math.ceil(clip.duration * DUCK_RATE) + 1);
    const settings = audio.duck,
      floor = dbToGain(settings.reductionDb),
      threshold = dbToGain(settings.thresholdDb) ** 2;
    let gain = 1,
      holdUntil = -Infinity;
    for (let i = 0; i < gains.length; i++) {
      const local = i / DUCK_RATE,
        time = clip.startTime + local;
      const active = speech.some((s) => {
        const buffer = buffers.get(s.sourceAssetId);
        return buffer && speechPower(s, buffer, time) > threshold;
      });
      if (active) holdUntil = local + settings.hold;
      const lower = active || local < holdUntil;
      gains[i] = gain;
      const delta =
        (1 - floor) /
        (DUCK_RATE * (lower ? settings.attack : settings.release));
      gain = lower ? Math.max(floor, gain - delta) : Math.min(1, gain + delta);
    }
    return { ...clip, duckEnvelope: { rate: DUCK_RATE, gains } };
  });
}
export function duckGainAt(
  envelope: DuckEnvelope | undefined,
  local: number,
): number {
  if (!envelope) return 1;
  const position = Math.max(
    0,
    Math.min(envelope.gains.length - 1, local * envelope.rate),
  );
  const a = Math.floor(position),
    b = Math.min(a + 1, envelope.gains.length - 1);
  return (
    envelope.gains[a]! +
    (envelope.gains[b]! - envelope.gains[a]!) * (position - a)
  );
}
