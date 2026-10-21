import { expect, it, vi } from 'vitest';
import {
  createFontLoader,
  type FontAsset,
  type FontStore,
} from '../../src/text-engine/fonts';
const css = `@font-face { font-family: 'Lora'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/test.woff2) format('woff2'); unicode-range: U+0-FF; }`;
function fixture() {
  const saved = new Map<string, FontAsset[]>();
  const store: FontStore = {
    get: async (k) => saved.get(k),
    put: async (k, v) => {
      saved.set(k, v);
    },
  };
  const fetcher = vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        String(input).includes('css2') ? css : new Uint8Array([1, 2, 3]),
      ),
  );
  const register = vi.fn(async (_asset: FontAsset) => {});
  return { store, fetcher, register, saved };
}
it('downloads CSS/files once, registers binary faces, caches and reports state', async () => {
  const f = fixture(),
    loader = createFontLoader(f),
    states: string[] = [];
  const faces = await loader.loadFont('Lora', [400], ['latin'], {
    onState: (s) => states.push(s),
  });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(f.register).toHaveBeenCalledTimes(1);
  expect(faces[0]?.bytes.byteLength).toBe(3);
  expect(states).toEqual(['loading', 'ready']);
  await loader.loadFont('Lora', [400]);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  expect(loader.state('Lora')).toBe('ready');
});
it('fresh worker loader reuses stored bytes offline without network', async () => {
  const f = fixture();
  await createFontLoader(f).loadFont('Lora');
  f.fetcher.mockClear();
  await createFontLoader({ ...f, online: () => false }).loadFont('Lora');
  expect(f.fetcher).not.toHaveBeenCalled();
  await expect(
    createFontLoader({ ...f, online: () => false }).loadFont('Inter'),
  ).rejects.toMatchObject({ code: 'OFFLINE_MISS' });
});
it('failed or aborted fetch never commits an incomplete family', async () => {
  const f = fixture();
  f.fetcher.mockRejectedValue(new Error('offline'));
  await expect(createFontLoader(f).loadFont('Lora')).rejects.toThrow('offline');
  expect(f.saved.size).toBe(0);
  const abort = new AbortController();
  abort.abort();
  await expect(
    createFontLoader(f).loadFont('Lora', [400], ['latin'], {
      signal: abort.signal,
    }),
  ).rejects.toMatchObject({ code: 'ABORTED' });
});
it('rejects unexpected font hosts and invalid families', async () => {
  const f = fixture();
  f.fetcher.mockResolvedValue(
    new Response(css.replace('fonts.gstatic.com', 'evil.example')),
  );
  await expect(createFontLoader(f).loadFont('Lora')).rejects.toMatchObject({
    code: 'FONT_UNAVAILABLE',
  });
  await expect(createFontLoader(f).loadFont('Unknown')).rejects.toMatchObject({
    code: 'FONT_UNAVAILABLE',
  });
  expect(f.saved.size).toBe(0);
});
it('default registration uses loaded FontFace bytes and the worker font set', async () => {
  const f = fixture(),
    add = vi.fn(),
    load = vi.fn(async () => ({}));
  class FakeFontFace {
    load = load;
    constructor(
      public family: string,
      public bytes: ArrayBuffer,
    ) {}
  }
  vi.stubGlobal('FontFace', FakeFontFace);
  vi.stubGlobal('fonts', { add });
  try {
    await createFontLoader({ store: f.store, fetcher: f.fetcher }).loadFont(
      'Lora',
    );
    expect(load).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

// FIX1 F8: single-weight families are asked for the weights they have
// (Google answers 400 to a missing weight); bold is then synthetic.
import {
  FONT_CATALOG,
  fontStylesheetUrl,
  servedWeights,
} from '../../src/text-engine';
it('[FX1-017] requests only the weights a family really has; single-weight fonts are asked without a weight list', async () => {
  for (const family of [
    'Tiro Devanagari Hindi',
    'Pacifico',
    'Bebas Neue',
    'Anton',
    'Abril Fatface',
    'Righteous',
    'Alfa Slab One',
    'Bungee',
    'DM Serif Display',
  ]) {
    expect(FONT_CATALOG.find((f) => f.family === family)!.weights).toEqual([
      400,
    ]);
    expect(servedWeights(family, [700])).toEqual([400]);
    expect(fontStylesheetUrl(family, servedWeights(family, [600, 700]))).toBe(
      `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}&display=swap`,
    );
  }
  expect(servedWeights('Cinzel', [300])).toEqual([400]);
  expect(servedWeights('Kalam', [500, 600])).toEqual([400, 700]);
  expect(servedWeights('Inter', [600, 700])).toEqual([600, 700]);
  // A real request: the loader never asks Google for a missing weight.
  const f = fixture();
  f.fetcher.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes(':wght@'))
      return new Response('Bad request', { status: 400 });
    return new Response(
      url.includes('css2')
        ? css.replace("'Lora'", "'Pacifico'")
        : new Uint8Array([1, 2, 3]),
    );
  });
  const faces = await createFontLoader(f).loadFont('Pacifico', [700]);
  expect(faces).toHaveLength(1);
  expect(String(f.fetcher.mock.calls[0]![0])).not.toContain('wght');
});
it('[FX1-017] a refused stylesheet says the status', async () => {
  const f = fixture();
  f.fetcher.mockResolvedValue(new Response('', { status: 403 }));
  await expect(
    createFontLoader(f).loadFont('Inter', [400]),
  ).rejects.toMatchObject({
    status: 403,
    message: expect.stringContaining('403'),
  });
});
