import { checkAbort, MediaProbeError, type MediaDetails } from './types';
export interface ProbeSession {
  read(signal?: AbortSignal): Promise<Omit<MediaDetails, 'sizeBytes'>>;
  dispose(): void;
}
export interface ProbeDependencies {
  open(blob: Blob): Promise<ProbeSession>;
}
export function createMediaProbe(deps: ProbeDependencies) {
  return async (
    blob: Blob,
    options: { signal?: AbortSignal } = {},
  ): Promise<MediaDetails> => {
    checkAbort(options.signal);
    if (!blob.size)
      throw new MediaProbeError('UNREADABLE', 'The media file is empty');
    let session: ProbeSession | undefined;
    const abort = () => session?.dispose();
    try {
      session = await deps.open(blob);
      checkAbort(options.signal);
      options.signal?.addEventListener('abort', abort, { once: true });
      const result = await session.read(options.signal);
      checkAbort(options.signal);
      return { ...result, sizeBytes: blob.size };
    } catch (error) {
      checkAbort(options.signal);
      if (error instanceof MediaProbeError) throw error;
      throw new MediaProbeError(
        'UNREADABLE',
        'Media metadata could not be read',
      );
    } finally {
      options.signal?.removeEventListener('abort', abort);
      session?.dispose();
    }
  };
}
const empty = {
  container: null,
  videoCodec: null,
  audioCodec: null,
  width: null,
  height: null,
  rotation: null,
  fps: null,
  isVariableFrameRate: null,
  durationSec: null,
  audioChannels: null,
  sampleRate: null,
  bitrate: null,
  hasAudio: false,
};
export const browserProbeDependencies: ProbeDependencies = {
  async open(blob) {
    const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const image =
      blob.type.startsWith('image/') ||
      (signature[0] === 137 &&
        signature[1] === 80 &&
        signature[2] === 78 &&
        signature[3] === 71) ||
      (signature[0] === 255 && signature[1] === 216) ||
      String.fromCharCode(...signature.slice(0, 3)) === 'GIF' ||
      (String.fromCharCode(...signature.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...signature.slice(8, 12)) === 'WEBP');
    if (image)
      return {
        async read(signal) {
          checkAbort(signal);
          const bitmap = await createImageBitmap(blob, {
            imageOrientation: 'from-image',
          });
          try {
            return {
              ...empty,
              kind: 'image',
              container: blob.type || null,
              width: bitmap.width,
              height: bitmap.height,
              rotation: null,
            };
          } finally {
            bitmap.close();
          }
        },
        dispose() {},
      };
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });
    let disposed = false;
    return {
      dispose() {
        if (!disposed) {
          disposed = true;
          input.dispose();
        }
      },
      async read(signal) {
        const format = await input.getFormat(),
          video = await input.getPrimaryVideoTrack(),
          audio = await input.getPrimaryAudioTrack();
        checkAbort(signal);
        if (!video && !audio)
          throw new MediaProbeError(
            'UNSUPPORTED_CONTAINER',
            'No supported audio or video track was found',
          );
        const videoCodec = video ? await video.getCodec() : null,
          audioCodec = audio ? await audio.getCodec() : null;
        if (video && (!videoCodec || !(await video.canDecode())))
          throw new MediaProbeError(
            'UNSUPPORTED_CODEC',
            `This browser cannot decode video codec ${videoCodec ?? 'unknown'}`,
          );
        if (audio && (!audioCodec || !(await audio.canDecode())))
          throw new MediaProbeError(
            'UNSUPPORTED_CODEC',
            `This browser cannot decode audio codec ${audioCodec ?? 'unknown'}`,
          );
        const durationSec = await input.computeDuration();
        if (!Number.isFinite(durationSec) || durationSec <= 0)
          throw new MediaProbeError(
            'UNREADABLE',
            'The media duration is invalid',
          );
        const metrics = video
          ? await video
              .computeFrameRateMetrics({ targetPacketCount: 256 })
              .catch(() => null)
          : null;
        checkAbort(signal);
        return {
          ...empty,
          kind: video ? 'video' : 'audio',
          container: format.mimeType,
          videoCodec,
          audioCodec,
          width: video ? await video.getDisplayWidth() : null,
          height: video ? await video.getDisplayHeight() : null,
          rotation: video ? await video.getRotation() : null,
          fps:
            metrics && Number.isFinite(metrics.bestGuessFrameRate)
              ? metrics.bestGuessFrameRate
              : null,
          isVariableFrameRate: metrics
            ? metrics.underlyingFrameRate === null ||
              metrics.maxFrameRate - metrics.minFrameRate >
                Math.max(0.1, metrics.bestGuessFrameRate * 0.01)
            : null,
          durationSec,
          audioChannels: audio ? await audio.getNumberOfChannels() : null,
          sampleRate: audio ? await audio.getSampleRate() : null,
          bitrate: Math.round((blob.size * 8) / durationSec),
          hasAudio: !!audio,
        };
      },
    };
  },
};
export const probeMedia = createMediaProbe(browserProbeDependencies);
