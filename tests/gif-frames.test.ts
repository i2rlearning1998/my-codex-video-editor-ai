import { describe, expect, it } from 'vitest';
import { gifFrameIndex } from '../src/media/gif';

// VID-008: which picture of an animated GIF shows at a given clip time.
describe('gif frames', () => {
  const ends = [0.1, 0.3, 0.4];
  it('[VID-008] picks the frame by time and repeats the GIF', () => {
    expect(gifFrameIndex(ends, 0.4, 0)).toBe(0);
    expect(gifFrameIndex(ends, 0.4, 0.099)).toBe(0);
    expect(gifFrameIndex(ends, 0.4, 0.1)).toBe(1);
    expect(gifFrameIndex(ends, 0.4, 0.39)).toBe(2);
    expect(gifFrameIndex(ends, 0.4, 0.4)).toBe(0);
    expect(gifFrameIndex(ends, 0.4, 1.05)).toBe(1);
    expect(gifFrameIndex(ends, 0.4, -0.05)).toBe(2);
    expect(gifFrameIndex([], 0, 3)).toBe(0);
  });
});
