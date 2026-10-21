import { describe, expect, it, vi } from 'vitest';
import {
  createFontLoader,
  fontStylesheetUrl,
  type FontAsset,
  type FontStore,
} from '../../src/text-engine/fonts';
import { familyHasItalic, servedWeights } from '../../src/text-engine/catalog';
import {
  isSafeFamily,
  uploadedFamilyName,
} from '../../src/text-engine/uploaded';

const css = `@font-face { font-family: 'X'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/x.woff2) format('woff2'); }`;
function loader() {
  const saved = new Map<string, FontAsset[]>();
  const store: FontStore = {
    get: async (key) => saved.get(key),
    put: async (key, value) => {
      saved.set(key, value);
    },
  };
  const fetcher = vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        String(input).includes('css2') ? css : new Uint8Array([1, 2, 3]),
      ),
  );
  return {
    fetcher,
    loader: createFontLoader({ store, fetcher, register: async () => {} }),
  };
}
const family = (url: string) => new URL(url).searchParams.get('family');

describe('[FN3-012] font requests use each family’s real weights and italics', () => {
  it('a single-weight family is asked for with no weight list, even for bold', () => {
    expect(servedWeights('Pacifico', [700])).toEqual([400]);
    expect(
      family(fontStylesheetUrl('Pacifico', servedWeights('Pacifico', [700]))),
    ).toBe('Pacifico');
  });
  it('bold or italic on a single-weight family without italics is synthetic: no request for them', async () => {
    const { loader: load, fetcher } = loader();
    await load.loadFont('Pacifico', [700], ['latin'], { italic: true });
    const url = String(fetcher.mock.calls[0]![0]);
    expect(family(url)).toBe('Pacifico');
    expect(url).not.toMatch(/ital|wght/);
  });
  it('a family with real italics asks for them with its real weights', async () => {
    expect(familyHasItalic('Lora')).toBe(true);
    const { loader: load, fetcher } = loader();
    await load.loadFont('Lora', [400, 800], ['latin'], { italic: true });
    // Lora has 400 to 700: 800 maps to 700.
    expect(family(String(fetcher.mock.calls[0]![0]))).toBe(
      'Lora:ital,wght@0,400;0,700;1,400;1,700',
    );
  });
  it('uploaded font names are safe CSS family names', () => {
    expect(uploadedFamilyName('My Brand-Bold.otf')).toBe('My Brand-Bold');
    expect(uploadedFamilyName('evil";}{.ttf')).toBe('evil');
    expect(isSafeFamily('My Brand-Bold')).toBe(true);
    expect(isSafeFamily('a"b')).toBe(false);
  });
});
