import { it, expect, vi, beforeEach } from 'vitest';
import { probeMedia } from '../../src/media-probe/probe';
import { importMediaFiles } from '../../src/media/import';
import { MemoryMediaStore } from '../../src/media/store';
import type { Asset } from '../../src/core';
const state = vi.hoisted(() => ({ supported: true, disposed: 0 }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose() {
      state.disposed++;
    }
    async getFormat() {
      return { mimeType: 'video/mp4' };
    }
    async computeDuration() {
      return 10;
    }
    async getPrimaryVideoTrack() {
      return {
        getCodec: async () => 'avc',
        canDecode: async () => state.supported,
        getDisplayWidth: async () => 1080,
        getDisplayHeight: async () => 1920,
        getRotation: async () => 90,
        computeFrameRateMetrics: async () => ({
          underlyingFrameRate: null,
          bestGuessFrameRate: 30,
          minFrameRate: 20,
          maxFrameRate: 60,
        }),
      };
    }
    async getPrimaryAudioTrack() {
      return {
        getCodec: async () => 'aac',
        canDecode: async () => true,
        getNumberOfChannels: async () => 2,
        getSampleRate: async () => 48000,
      };
    }
  },
}));
beforeEach(() => {
  state.supported = true;
  state.disposed = 0;
});
it('demux-shaped fixture maps portrait video, audio and sampled VFR fields', async () => {
  const result = await probeMedia(new Blob(['fixture'], { type: 'video/mp4' }));
  expect(result).toMatchObject({
    kind: 'video',
    container: 'video/mp4',
    videoCodec: 'avc',
    audioCodec: 'aac',
    rotation: 90,
    width: 1080,
    height: 1920,
    fps: 30,
    isVariableFrameRate: true,
    durationSec: 10,
    sampleRate: 48000,
    audioChannels: 2,
    hasAudio: true,
    sizeBytes: 7,
    bitrate: 6,
  });
  expect(state.disposed).toBe(1);
});
it('unsupported decoder returns a typed reason and disposes input', async () => {
  state.supported = false;
  await expect(probeMedia(new Blob(['fixture']))).rejects.toMatchObject({
    code: 'UNSUPPORTED_CODEC',
    message: expect.stringContaining('avc'),
  });
  expect(state.disposed).toBe(1);
});
it('import persists details in asset metadata without adding schema fields', async () => {
  const added: Asset[] = [],
    store = new MemoryMediaStore(),
    file = new File(['fixture'], 'phone.mp4', { type: 'video/mp4' }),
    details = await probeMedia(file);
  const result = await importMediaFiles([file], {
    store,
    hasAsset: () => false,
    addAsset: (a) => added.push(a),
    probe: async () => ({ width: 1080, height: 1920, duration: 10, details }),
  });
  expect(result.outcomes[0]?.status).toBe('imported');
  expect(added[0]?.metadata.mediaProbe).toEqual(details);
  expect(added[0]?.width).toBe(1080);
});
