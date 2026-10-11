import { duckGainAt } from './ducking';
import { clipSchedule, type AudibleClip } from '../media/audio';
import {
  clipGainAt,
  defaultAudioSettings,
  normalizationSignature,
  dbToGain,
} from './settings';

export interface ScheduledAudio {
  node: AudioBufferSourceNode;
  dispose(): void;
}
/** The one clip graph used by live preview, scrub snippets and offline export. */
export function scheduleAudioClip(
  context: BaseAudioContext,
  destination: AudioNode,
  clip: AudibleClip,
  buffer: AudioBuffer,
  time: number,
  contextStart: number,
  latency = 0,
  maximumDuration = Infinity,
): ScheduledAudio | null {
  const plan = clipSchedule(clip, time, buffer.duration);
  if (!plan) return null;
  const early = Math.max(0, latency - plan.delay);
  const offset = plan.offset + early * clip.speed;
  const duration = Math.min(plan.length / clip.speed - early, maximumDuration);
  if (duration <= 0 || offset >= buffer.duration) return null;
  const start = contextStart + Math.max(0, plan.delay - latency);
  const local = Math.max(0, time - clip.startTime) + early;
  const settings = clip.audio ?? defaultAudioSettings();
  const node = context.createBufferSource();
  node.buffer = buffer;
  node.playbackRate.value = clip.speed;
  // Web Audio's explicit speaker downmix: mono duplicates; quad/5.1 mix to stereo,
  // including center/surround at sqrt(1/2), excluding LFE. Never guess 7.1 layouts.
  const stereo = context.createGain();
  stereo.channelCount = 2;
  stereo.channelCountMode = 'explicit';
  stereo.channelInterpretation = 'speakers';
  const gain = context.createGain();
  const pan = context.createStereoPanner();
  pan.pan.value = settings.pan;
  const effects: AudioNode[] = [];
  let tail: AudioNode = stereo;
  for (const [band, type, frequency] of [
    ['low', 'lowshelf', 200],
    ['mid', 'peaking', 1000],
    ['high', 'highshelf', 4000],
  ] as const) {
    if (settings.eq[band] === 0) continue;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 1;
    filter.gain.value = settings.eq[band];
    tail.connect(filter);
    tail = filter;
    effects.push(filter);
  }
  if (settings.compressor.enabled) {
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = settings.compressor.threshold;
    compressor.knee.value = 6;
    compressor.ratio.value = settings.compressor.ratio;
    compressor.attack.value = settings.compressor.attack;
    compressor.release.value = settings.compressor.release;
    tail.connect(compressor);
    tail = compressor;
    effects.push(compressor);
  }
  const normalized = context.createGain();
  const normalization = settings.normalization;
  normalized.gain.value =
    normalization &&
    normalization.signature === normalizationSignature(clip, settings)
      ? dbToGain(normalization.gainDb)
      : 1;
  node.connect(stereo);
  tail.connect(gain).connect(pan).connect(normalized).connect(destination);
  // Small chunks bound automation memory, 200 samples/s; exact endpoints.
  const chunkLength = 10;
  for (let elapsed = 0; elapsed < duration; elapsed += chunkLength) {
    const seconds = Math.min(chunkLength, duration - elapsed);
    const curve = new Float32Array(Math.max(2, Math.ceil(seconds * 200) + 1));
    for (let i = 0; i < curve.length; i++) {
      const localTime = local + elapsed + (seconds * i) / (curve.length - 1);
      curve[i] =
        duckGainAt(clip.duckEnvelope, localTime) *
        clipGainAt(
          settings,
          local + elapsed + (seconds * i) / (curve.length - 1),
          clip.duration,
        );
    }
    gain.gain.setValueCurveAtTime(curve, start + elapsed, seconds);
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    node.onended = null;
    try {
      node.stop();
    } catch {
      /* Already ended. */
    }
    node.disconnect();
    stereo.disconnect();
    gain.disconnect();
    pan.disconnect();
    normalized.disconnect();
    for (const effect of effects) effect.disconnect();
  };
  node.start(start, offset, duration * clip.speed);
  node.onended = dispose;
  return { node, dispose };
}
