import { SpeechError, type AudioCodec, type PcmAudio } from './types';
export function encodeWav(audio: PcmAudio): Blob {
  const { sampleRate, channels } = audio,
    n = channels[0]?.length ?? 0;
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    !n ||
    !channels.length ||
    channels.length > 8 ||
    channels.some((c) => c.length !== n)
  )
    throw new SpeechError('INVALID_INPUT');
  const bytes = n * channels.length * 2;
  if (bytes > 200 * 1024 * 1024) throw new SpeechError('INVALID_INPUT');
  const buffer = new ArrayBuffer(44 + bytes),
    v = new DataView(buffer),
    text = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++)
        v.setUint8(offset + i, s.charCodeAt(i));
    };
  text(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels.length, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels.length * 2, true);
  v.setUint16(32, channels.length * 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, bytes, true);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels.length; c++) {
      const value = channels[c]![i]!;
      if (!Number.isFinite(value)) throw new SpeechError('INVALID_INPUT');
      const clamped = Math.max(-1, Math.min(1, value));
      v.setInt16(
        44 + (i * channels.length + c) * 2,
        Math.round(clamped * (clamped < 0 ? 32768 : 32767)),
        true,
      );
    }
  return new Blob([buffer], { type: 'audio/wav' });
}
export const browserCodec: AudioCodec = {
  encode: encodeWav,
  async decode(blob) {
    if (typeof OfflineAudioContext === 'undefined')
      throw new SpeechError('NOT_AVAILABLE');
    const context = new OfflineAudioContext(1, 1, 48000),
      decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return {
      sampleRate: decoded.sampleRate,
      channels: Array.from({ length: decoded.numberOfChannels }, (_, i) =>
        decoded.getChannelData(i).slice(),
      ),
    };
  },
};
export function resampleMono(audio: PcmAudio, rate: number): Float32Array {
  const length = audio.channels[0]?.length ?? 0;
  if (
    !Number.isFinite(rate) ||
    rate < 8000 ||
    rate > 192000 ||
    !Number.isFinite(audio.sampleRate) ||
    audio.sampleRate < 8000 ||
    audio.sampleRate > 192000 ||
    !length ||
    audio.channels.some(
      (c) => c.length !== length || c.some((v) => !Number.isFinite(v)),
    ) ||
    (length * rate) / audio.sampleRate > 50_000_000
  )
    throw new SpeechError('INVALID_INPUT');
  const result = new Float32Array(
    Math.max(1, Math.round((length * rate) / audio.sampleRate)),
  );
  for (let i = 0; i < result.length; i++) {
    const position = (i * audio.sampleRate) / rate,
      a = Math.min(length - 1, Math.floor(position)),
      b = Math.min(length - 1, a + 1),
      f = position - a;
    for (const channel of audio.channels)
      result[i]! +=
        (channel[a]! * (1 - f) + channel[b]! * f) / audio.channels.length;
  }
  return result;
}
