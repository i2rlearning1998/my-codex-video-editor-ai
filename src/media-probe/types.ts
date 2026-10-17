export interface MediaDetails {
  kind: 'video' | 'audio' | 'image';
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  fps: number | null;
  isVariableFrameRate: boolean | null;
  durationSec: number | null;
  audioChannels: number | null;
  sampleRate: number | null;
  bitrate: number | null;
  hasAudio: boolean;
  sizeBytes: number;
}
export class MediaProbeError extends Error {
  constructor(
    public readonly code:
      'UNSUPPORTED_CODEC' | 'UNSUPPORTED_CONTAINER' | 'UNREADABLE' | 'ABORTED',
    message: string,
  ) {
    super(message);
    this.name = code === 'ABORTED' ? 'AbortError' : 'MediaProbeError';
  }
}
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new MediaProbeError('ABORTED', 'Media inspection cancelled');
}
