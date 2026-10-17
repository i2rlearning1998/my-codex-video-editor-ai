import {
  RecorderError,
  type RecorderDependencies,
  type RecorderPort,
} from './types';
import { repairWebM } from './webm';
export function browserRecorderDependencies(): RecorderDependencies {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof MediaRecorder === 'undefined'
  )
    throw new RecorderError('UNSUPPORTED');
  return {
    devices: navigator.mediaDevices,
    queryPermission: async (name) => {
      try {
        return (
          await navigator.permissions.query({ name: name as PermissionName })
        ).state;
      } catch {
        return 'prompt';
      }
    },
    isTypeSupported: (mime) => MediaRecorder.isTypeSupported(mime),
    createStream: (tracks) => new MediaStream(tracks),
    now: () => performance.now(),
    schedule: (fn, ms) => {
      const timer = setInterval(fn, ms);
      return () => clearInterval(timer);
    },
    repairWebM,
    createRecorder(stream, mime) {
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const port: RecorderPort = {
        mimeType: recorder.mimeType,
        onData: undefined,
        onStop: undefined,
        onError: undefined,
        start: () => recorder.start(1000),
        pause: () => recorder.pause(),
        resume: () => recorder.resume(),
        stop: () => recorder.stop(),
      };
      recorder.ondataavailable = (e) => port.onData?.(e.data);
      recorder.onstop = () => port.onStop?.();
      recorder.onerror = () => port.onError?.();
      return port;
    },
    createMeter(stream) {
      if (!stream.getAudioTracks().length)
        return { read: () => ({ peak: 0, rms: 0 }), close: () => {} };
      const context = new AudioContext(),
        source = context.createMediaStreamSource(stream),
        analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      void context.resume().catch(() => {});
      const samples = new Float32Array(analyser.fftSize);
      return {
        read: () => {
          analyser.getFloatTimeDomainData(samples);
          let peak = 0,
            sum = 0;
          for (const value of samples) {
            peak = Math.max(peak, Math.abs(value));
            sum += value * value;
          }
          return { peak, rms: Math.sqrt(sum / samples.length) };
        },
        close: () => {
          source.disconnect();
          analyser.disconnect();
          void context.close().catch(() => {});
        },
      };
    },
  };
}
