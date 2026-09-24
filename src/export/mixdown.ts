import {
  clipSchedule,
  reverseAudioBuffer,
  type AudibleClip,
  type AudioDecoder,
} from '../media';

export const MIX_RATE = 48_000;

/**
 * EXP-004: the export range's stereo mix, rendered offline with the same audible
 * clips and scheduling maths as playback (D-061). Null when nothing sounds.
 */
export async function mixdown(
  clips: readonly AudibleClip[],
  decoder: AudioDecoder,
  start: number,
  end: number,
): Promise<{ sampleRate: number; channels: Float32Array[] } | null> {
  const length = Math.max(1, Math.round((end - start) * MIX_RATE));
  const context = new OfflineAudioContext(2, length, MIX_RATE);
  let scheduled = 0;
  for (const clip of clips) {
    const decoded = await decoder.decode(clip.sourceAssetId);
    if (!(decoded instanceof AudioBuffer)) continue;
    const buffer = clip.reversed ? reverseAudioBuffer(decoded) : decoded;
    const plan = clipSchedule(clip, start, buffer.duration);
    if (!plan || plan.delay >= end - start) continue;
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = clip.speed;
    node.connect(context.destination);
    node.start(plan.delay, plan.offset, plan.length);
    scheduled++;
  }
  if (!scheduled) return null;
  const rendered = await context.startRendering();
  return {
    sampleRate: MIX_RATE,
    channels: [rendered.getChannelData(0), rendered.getChannelData(1)],
  };
}
