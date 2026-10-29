import { describe, it, expect } from 'vitest';
import { createPexels, createPixabay } from '../../src/providers';
import { setup } from './helpers';

// MED-032: category and colour filters reach the provider that can use them.
describe('stock filters', () => {
  it('[MED-032] Pixabay sends category and colours for photos, category only for videos', async () => {
    const photos = setup('pixabay-images'),
      pixabay = createPixabay(photos);
    expect(pixabay.filters?.['stock-image']?.category).toContain('nature');
    expect(pixabay.filters?.['stock-image']?.color).toContain('blue');
    expect(pixabay.filters?.['stock-video']?.color).toBeUndefined();
    await pixabay.search({
      kind: 'stock-image',
      query: 'sky',
      category: 'nature',
      color: 'blue',
    });
    const query = new URL(photos.fetch.mock.calls[0]![0] as string)
      .searchParams;
    expect(query.get('category')).toBe('nature');
    expect(query.get('colors')).toBe('blue');
    const videos = setup('pixabay-videos');
    await createPixabay(videos).search({
      kind: 'stock-video',
      query: 'sea',
      category: 'travel',
      color: 'blue',
    });
    const video = new URL(videos.fetch.mock.calls[0]![0] as string)
      .searchParams;
    expect(video.get('category')).toBe('travel');
    expect(video.get('colors')).toBeNull();
  });
  it('[MED-032] Pexels sends a colour for photos only, and has no category', async () => {
    const photos = setup('pexels-photos'),
      pexels = createPexels(photos);
    expect(pexels.filters?.['stock-image']?.color).toContain('red');
    expect(pexels.filters?.['stock-image']?.category).toBeUndefined();
    expect(pexels.filters?.['stock-video']).toBeUndefined();
    await pexels.search({ kind: 'stock-image', query: 'lake', color: 'red' });
    expect(
      new URL(photos.fetch.mock.calls[0]![0] as string).searchParams.get(
        'color',
      ),
    ).toBe('red');
    const videos = setup('pexels-videos');
    await createPexels(videos).search({
      kind: 'stock-video',
      query: 'sea',
      color: 'red',
    });
    expect(
      new URL(videos.fetch.mock.calls[0]![0] as string).searchParams.get(
        'color',
      ),
    ).toBeNull();
  });
  it('[MED-032] a different colour is not answered from the cache of another', async () => {
    const deps = setup('pexels-photos'),
      pexels = createPexels(deps);
    await pexels.search({ kind: 'stock-image', query: 'lake', color: 'red' });
    await pexels.search({ kind: 'stock-image', query: 'lake', color: 'blue' });
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });
});
