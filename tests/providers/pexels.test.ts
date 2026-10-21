import { describe, it, expect } from 'vitest';
import { createPexels } from '../../src/providers';
import { setup, fixture, response } from './helpers';
describe('Pexels', () => {
  it('maps photo author and attribution; sends Authorization, never key in URL', async () => {
    const deps = setup('pexels-photos'),
      p = createPexels(deps),
      r = await p.search({ kind: 'stock-image', query: 'lake' });
    expect(r.items[0]).toMatchObject({
      title: 'Mountain lake',
      author: 'Mira',
    });
    expect(p.attribution.text).toBe('Photos provided by Pexels');
    expect(r.nextPage).toBe(2);
    const [url, init] = deps.fetch.mock.calls[0]!;
    expect(url).not.toContain('private-');
    expect(init?.headers).toEqual({ Authorization: 'private-pexels' });
  });
  it('maps real-shaped video answers: HLS entries with null sizes, null quality and missing fps are tolerated, only MP4 renditions are kept, on the documented /videos/search endpoint', async () => {
    const deps = setup('pexels-videos'),
      p = createPexels(deps),
      r = await p.search({ kind: 'stock-video', query: 'sea' });
    const url = deps.fetch.mock.calls[0]![0] as string;
    expect(new URL(url).pathname).toBe('/videos/search');
    expect(r.items).toHaveLength(2);
    expect(r.items[0]!.files.map((f) => f.quality)).toEqual([
      'uhd-23',
      'hd-21',
      'sd-22',
      'mp4-24',
    ]);
    expect(r.items[0]!.files.every((f) => !f.url.includes('.m3u8'))).toBe(true);
    expect(r.items[0]!.files[1]!.bytes).toBe(9000000);
    expect(r.items[1]!.files.map((f) => f.quality)).toEqual(['hd-31']);
    expect(r.nextPage).toBeNull();
  });
  it('skips a video with no usable MP4 instead of failing the page', async () => {
    const raw = fixture('pexels-videos') as {
      videos: { video_files: unknown[] }[];
    };
    raw.videos[1]!.video_files = raw.videos[1]!.video_files.slice(0, 1);
    const deps = setup('pexels-videos');
    deps.fetch.mockResolvedValue(response(raw));
    const r = await createPexels(deps).search({
      kind: 'stock-video',
      query: 'sea',
    });
    expect(r.items.map((item) => item.id)).toEqual(['12']);
  });
  it('uses monthly remaining/reset headers to stop further API calls', async () => {
    const deps = setup('pexels-photos');
    deps.fetch.mockResolvedValue(
      response(fixture('pexels-photos'), {
        headers: {
          'X-Ratelimit-Remaining': '0',
          'X-Ratelimit-Reset': '3600',
          'X-Ratelimit-Limit': '20000',
        },
      }),
    );
    const p = createPexels(deps);
    await p.search({ kind: 'stock-image', query: 'one' });
    await expect(
      p.search({ kind: 'stock-image', query: 'two' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAt: 3600000 });
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it('honours 429 Retry-After and permits an explicit retry only after backoff', async () => {
    const deps = setup('pexels-photos');
    deps.fetch.mockResolvedValueOnce(
      new Response('', { status: 429, headers: { 'Retry-After': '2' } }),
    );
    const p = createPexels(deps),
      o = { kind: 'stock-image' as const, query: 'one' };
    await expect(p.search(o)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAt: 2000,
    });
    await expect(p.search(o)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    deps.advance(2000);
    expect((await p.search(o)).items).toHaveLength(1);
  });
});
