// FIX7-001..003: a build never fills in an asset the person did not add.
import { describe, expect, it, vi } from 'vitest';
import { namesMatch, resolveMedia } from '../src/video-plan/resolve';
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
const own: MediaCandidate = {
  key: 'asset:1',
  source: 'asset',
  kind: 'image',
  title: 'Stone-Well.PNG',
  tags: [],
  width: 800,
  height: 800,
};
const layer = (query: string) =>
  ({
    id: 'a',
    kind: 'media',
    mediaIntent: { query, type: 'photo' },
  }) as never;

describe('[FIX7-001] names match without extension, dashes or case', () => {
  it('[FIX7-001] reads a name the way a person writes it', () => {
    expect(namesMatch('Stone-Well.PNG', 'stone-well')).toBe(true);
    expect(namesMatch('library eratosthenes.jpg', 'library-eratosthenes')).toBe(
      true,
    );
    expect(namesMatch('stone.png', 'stone-well')).toBe(false);
    expect(namesMatch('anything.png', '')).toBe(false);
  });
});

describe('[FIX7-002] a missing file stays missing', () => {
  it('[FIX7-002] never picks or even searches stock, whatever the query looks like', async () => {
    const search = vi.fn(async () => [stock]);
    const services = { local: () => [] as MediaCandidate[], stock: search };
    for (const query of ['stone-well', 'stone-well.png', 'a stone well']) {
      const choice = await resolveMedia(layer(query), services as never);
      expect(choice.chosen).toBeNull();
      expect(choice.flag).toBe('needs-asset');
    }
    expect(search).not.toHaveBeenCalled();
  });
});

describe('[FIX7-003] the person’s own file is used', () => {
  it('[FIX7-003] uses media with the same name, and a pick the person made', async () => {
    const services = {
      local: () => [own],
      stock: async () => [stock],
    };
    expect(
      (await resolveMedia(layer('stone-well'), services as never)).chosen?.key,
    ).toBe('asset:1');
    expect(
      (
        await resolveMedia(
          layer('something-else'),
          services as never,
          'asset:1',
        )
      ).chosen?.key,
    ).toBe('asset:1');
    expect(
      (await resolveMedia(layer('something-else'), services as never)).chosen,
    ).toBeNull();
  });
});
