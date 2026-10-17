import { it, expect, vi } from 'vitest';
import { createMediaProbe } from '../../src/media-probe/probe';
import {
  MediaProbeError,
  type MediaDetails,
} from '../../src/media-probe/types';
export const details: MediaDetails = {
  kind: 'video',
  container: 'video/mp4',
  videoCodec: 'avc',
  audioCodec: 'aac',
  width: 1080,
  height: 1920,
  rotation: 90,
  fps: 30,
  isVariableFrameRate: true,
  durationSec: 10,
  audioChannels: 2,
  sampleRate: 48000,
  bitrate: 800,
  hasAudio: true,
  sizeBytes: 1000,
};
it('fake demux maps metadata, actual blob size and always disposes', async () => {
  const dispose = vi.fn(),
    probe = createMediaProbe({
      open: async () => ({ read: async () => details, dispose }),
    });
  const result = await probe(new Blob(['123']));
  expect(result).toEqual({ ...details, sizeBytes: 3 });
  expect(dispose).toHaveBeenCalledOnce();
});
it('typed codec errors retain clear reasons and close the session', async () => {
  const dispose = vi.fn(),
    probe = createMediaProbe({
      open: async () => ({
        read: async () => {
          throw new MediaProbeError(
            'UNSUPPORTED_CODEC',
            'This browser cannot decode video codec hevc',
          );
        },
        dispose,
      }),
    });
  await expect(probe(new Blob(['x']))).rejects.toMatchObject({
    code: 'UNSUPPORTED_CODEC',
    message: expect.stringContaining('hevc'),
  });
  expect(dispose).toHaveBeenCalledOnce();
});
it('aborted and unreadable inspections do not leave sessions open', async () => {
  const dispose = vi.fn(),
    controller = new AbortController(),
    probe = createMediaProbe({
      open: async () => ({
        read: async () => {
          controller.abort();
          return details;
        },
        dispose,
      }),
    });
  await expect(
    probe(new Blob(['x']), { signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'ABORTED', name: 'AbortError' });
  expect(dispose).toHaveBeenCalled();
  await expect(probe(new Blob([]))).rejects.toMatchObject({
    code: 'UNREADABLE',
  });
});
