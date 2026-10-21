import { describe, it, expect } from 'vitest';
import { createIconify, importStockItem } from '../../src/providers';
import { setup } from './helpers';
describe('Iconify', () => {
  it('uses public search without keys and filters noncommercial/emoji sets out of icons', async () => {
    const deps = setup('iconify'),
      r = await createIconify(deps).search({ kind: 'icon', query: 'home' });
    expect(r.items.map((i) => i.id)).toEqual(['mdi:home']);
    expect(r.items[0]!.license).toMatchObject({
      name: 'Apache-2.0',
      attributionRequired: true,
      commercialUse: true,
    });
    expect(deps.fetch.mock.calls[0]![1]?.headers).toEqual({});
  });
  it('returns Noto stickers with per-set licences and leaves share-alike OpenMoji out (FIX1 F2)', async () => {
    const deps = setup('iconify'),
      r = await createIconify(deps).search({
        kind: 'sticker',
        query: 'smile',
        page: 2,
        perPage: 32,
      });
    expect(r.items.map((i) => i.id)).toEqual(['noto:grinning-face']);
    expect(deps.fetch.mock.calls[0]![0]).toContain('start=32');
    expect(
      decodeURIComponent(deps.fetch.mock.calls[0]![0] as string),
    ).not.toContain('openmoji');
  });
  it('fetches the actual SVG for import rather than fabricating vector data', async () => {
    const deps = setup('iconify'),
      r = await createIconify(deps).search({ kind: 'icon', query: 'home' });
    deps.fetch.mockResolvedValue(
      new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
        headers: { 'Content-Type': 'image/svg+xml' },
      }),
    );
    const imported = await importStockItem(r.items[0]!, 'svg', {
      network: deps.network,
    });
    expect(await imported.blob.text()).toContain('<svg');
    expect(deps.fetch.mock.lastCall![0]).toBe(
      'https://api.iconify.design/mdi/home.svg',
    );
  });
});
