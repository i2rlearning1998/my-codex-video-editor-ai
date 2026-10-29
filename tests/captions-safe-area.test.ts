import { describe, expect, it } from 'vitest';
import { captionLayout } from '../src/captions/layers';
import { CAPTION_STYLES } from '../src/captions/styles';

// FIX7-013: captions on a 9:16 video stay out of the lowest fifth.
describe('[FIX7-013] caption safe area', () => {
  const style = Object.values(CAPTION_STYLES)[0]!;
  it('[FIX7-013] keeps a 9:16 caption above the bottom fifth and 16:9 as before', () => {
    const tall = captionLayout(style, 2, { width: 1080, height: 1920 });
    expect(tall.y + tall.height).toBeLessThanOrEqual(1920 * 0.8 + 1);
    const wide = captionLayout(style, 2, { width: 1920, height: 1080 });
    expect(wide.y + wide.height).toBeCloseTo(1080 - Math.round(1080 * 0.07), 0);
  });
});
