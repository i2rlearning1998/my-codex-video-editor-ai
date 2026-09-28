import { clipSchedule, type AudibleClip } from '../media/audio';
import { clipGainAt, defaultAudioSettings } from './settings';

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
  node.connect(stereo).connect(gain).connect(pan).connect(destination);
  // Small chunks bound automation memory, 200 samples/s; exact endpoints.
  const chunkLength = 10;
  for (let elapsed = 0; elapsed < duration; elapsed += chunkLength) {
    const seconds = Math.min(chunkLength, duration - elapsed);
    const curve = new Float32Array(Math.max(2, Math.ceil(seconds * 200) + 1));
    for (let i = 0; i < curve.length; i++)
      curve[i] = clipGainAt(
        settings,
        local + elapsed + (seconds * i) / (curve.length - 1),
        clip.duration,
      );
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
  };
  node.start(start, offset, duration * clip.speed);
  node.onended = dispose;
  return { node, dispose };
}
