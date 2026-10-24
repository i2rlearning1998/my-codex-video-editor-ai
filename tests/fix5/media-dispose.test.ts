import { expect, it, vi } from 'vitest';
import { MediaFrames } from '../../src/media/frames';
import { MemoryMediaStore } from '../../src/media/store';
import type { MediaFrameRequest } from '../../src/render/adapter';
it('[MED-006] ignores a late image decode after disposing the media provider', async () => {
  let decoded!: () => void;
  class FakeImage {
    src = '';
    decode() {
      return new Promise<void>((resolve) => {
        decoded = resolve;
      });
    }
  }
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('HTMLImageElement', FakeImage);
  try {
    const key = 'media/' + 'a'.repeat(32);
    const store = new MemoryMediaStore();
    await store.write(key, new Blob(['image'], { type: 'image/png' }));
    let loaded!: () => void;
    const ready = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    const changed = vi.fn(() => loaded());
    const frames = new MediaFrames(
      Promise.resolve(store),
      () => [
        {
          id: 'a',
          type: 'image',
          source: { kind: 'local', reference: key },
          metadata: {},
        },
      ],
      changed,
    );
    const request: MediaFrameRequest = {
      key: 'layer',
      assetId: 'a',
      kind: 'image',
      sourceTime: 0,
      speed: 1,
      reversed: false,
      frozen: false,
    };
    frames.frame(request, false);
    await ready;
    frames.frame(request, false);
    expect(decoded).toBeTypeOf('function');
    changed.mockClear();
    frames.dispose();
    decoded();
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
    expect(frames.frame(request, false)).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});
