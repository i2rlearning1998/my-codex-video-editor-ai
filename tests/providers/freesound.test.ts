import { describe, it, expect } from 'vitest';
import { createFreesound, soundLicense } from '../../src/providers';
import { setup } from './helpers';
describe('Freesound', () => {
  it('maps previews and CC0/CC-BY licences; token is only in header', async () => {
    const deps = setup('freesound'),
      p = createFreesound(deps),
      r = await p.search({
        kind: 'stock-audio',
        query: 'rain',
        minDuration: 2,
        maxDuration: 10,
      });
    expect(r.items).toHaveLength(2);
    expect(r.items[0]!.license.attributionRequired).toBe(false);
    expect(r.items[1]!.license.attributionRequired).toBe(true);
    expect(r.items[0]!.files[0]!.mime).toBe('audio/mpeg');
    const [url, init] = deps.fetch.mock.calls[0]!;
    expect(url).not.toContain('private-');
    expect(new URL(url).searchParams.get('filter')).toBe('duration:[2 TO 10]');
    expect(init?.headers).toEqual({ Authorization: 'Token private-freesound' });
  });
  it('never labels noncommercial or unknown licences commercial', () => {
    expect(
      soundLicense('https://creativecommons.org/licenses/by-nc/4.0/')
        .commercialUse,
    ).toBe(false);
    expect(
      soundLicense('https://example.org/licenses/by/4.0/').commercialUse,
    ).toBe(false);
  });
  it('rejects missing tokens and malformed provider data with typed errors', async () => {
    const deps = setup('freesound');
    deps.keys.clearKey('freesound', 'token');
    const p = createFreesound(deps);
    await expect(
      p.search({ kind: 'stock-audio', query: 'rain' }),
    ).rejects.toMatchObject({ code: 'KEY_MISSING' });
    expect(deps.fetch).not.toHaveBeenCalled();
    deps.keys.setKey('freesound', 'token', 'test');
    deps.fetch.mockResolvedValue(new Response('{}'));
    await expect(
      p.search({ kind: 'stock-audio', query: 'rain' }),
    ).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
});
