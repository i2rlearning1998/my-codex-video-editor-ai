import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkPack, ITEM_KINDS } from '../../src/creator-pack';
import { effects, transitions } from '../../src/fx';

// B1: the `style` item kind: schema, kit ids and asset policy.
const fxCatalog = [...effects, ...transitions].map((item) => item.id);
const read = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../examples/creator-packs/${name}`, import.meta.url),
      'utf8',
    ),
  ) as { items: Record<string, unknown>[] } & Record<string, unknown>;
const withStyle = (change: (data: Record<string, unknown>) => void) => {
  const pack = read('style-youtube-intro.json');
  const item = structuredClone(pack.items[0]!);
  change(item.data as Record<string, unknown>);
  return { ...pack, items: [item] };
};
const check = (pack: unknown, known: string[] = []) =>
  checkPack(pack, { fxCatalog, knownLibraryIds: known });

describe('[B1] style items', () => {
  it('is a schema kind and the examples pass with the real FX catalog', () => {
    expect(ITEM_KINDS).toContain('style');
    expect(check(read('style-youtube-intro.json')).items[0]!.status).toBe('ok');
    const documentary = check(read('style-documentary.json')).items[0]!;
    expect(documentary.status).toBe('warning');
    expect(documentary.reasons.join()).toContain('transition.dip-to-black');
    expect(check(read('style-logo-reveal-2d.json')).ok).toBe(true);
  });
  it('rejects a required kit id the editor lacks, accepts it when optional', () => {
    const missing = withStyle((data) => {
      (data.kit as Record<string, unknown>).transitions = ['transition.nope'];
    });
    expect(check(missing).items[0]!.reasons.join()).toContain(
      'Unknown kit transition transition.nope',
    );
    const optional = withStyle((data) => {
      (data.kit as Record<string, unknown>).transitions = [
        { id: 'transition.nope', optional: true },
      ];
    });
    expect(check(optional).items[0]!.status).toBe('warning');
  });
  it('checks library ids against the known library', () => {
    const pack = withStyle((data) => {
      (data.kit as Record<string, unknown>).preferLibrary = ['starter/badge'];
    });
    expect(check(pack, ['starter/badge']).items[0]!.status).toBe('ok');
    expect(check(pack, ['starter/other']).ok).toBe(false);
  });
  it('refuses URLs, a non-data thumbnail, AI assets without "ai" and long text', () => {
    const url = withStyle((data) => {
      data.description = 'See https://example.com for the look.';
    });
    expect(check(url).ok).toBe(false);
    const thumb = withStyle((data) => {
      data.thumbnail = 'images/thumb.png';
    });
    expect(check(thumb).items[0]!.reasons.join()).toContain('data: URI');
    const ai = withStyle((data) => {
      data.assetPolicy = { order: ['library'], aiImagesMax: 2, aiVideosMax: 0 };
    });
    expect(check(ai).items[0]!.reasons.join()).toContain('add "ai" last');
    const order = withStyle((data) => {
      data.assetPolicy = {
        order: ['ai', 'library'],
        aiImagesMax: 0,
        aiVideosMax: 0,
      };
    });
    expect(check(order).ok).toBe(false);
    const long = withStyle((data) => {
      data.description = 'x'.repeat(601);
    });
    expect(check(long).ok).toBe(false);
  });
});
