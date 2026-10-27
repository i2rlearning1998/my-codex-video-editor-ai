// FIX6-008: a plan that names a file never gets a stock picture in its place.
import { describe, expect, it } from 'vitest';
import { namesAFile, resolveMedia } from '../src/video-plan/resolve';
import type { MediaCandidate } from '../src/video-plan/resolve';

const stock: MediaCandidate = {
  key: 'mock:well-1',
  source: 'stock',
  kind: 'image',
  title: 'stone well',
  tags: ['stone', 'well'],
  width: 1000,
  height: 1000,
};
const services = {
  local: () => [] as MediaCandidate[],
  stock: async () => [stock],
};
const layer = (query: string) =>
  ({
    id: 'a',
    kind: 'media',
    mediaIntent: { query, type: 'photo' },
  }) as never;

describe('[FIX6-008] stock never replaces a named file', () => {
  it('[FIX6-008] reads file names', () => {
    expect(namesAFile('stone-well.png')).toBe(true);
    expect(namesAFile(' Narration.MP3 ')).toBe(true);
    expect(namesAFile('a stone well')).toBe(false);
  });
  it('[FIX6-008] flags a named file as needing an asset and keeps stock as a suggestion', async () => {
    const choice = await resolveMedia(
      layer('stone-well.png'),
      services as never,
    );
    expect(choice.chosen).toBeNull();
    expect(choice.flag).toBe('needs-asset');
    expect(choice.alternatives.map((item) => item.key)).toEqual([
      'mock:well-1',
    ]);
  });
  it('[FIX6-008] still uses stock for a described query, and for a swap the person chose', async () => {
    expect(
      (await resolveMedia(layer('stone well'), services as never)).chosen?.key,
    ).toBe('mock:well-1');
    expect(
      (
        await resolveMedia(
          layer('stone-well.png'),
          services as never,
          'mock:well-1',
        )
      ).chosen?.key,
    ).toBe('mock:well-1');
  });
});
