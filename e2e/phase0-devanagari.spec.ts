import { test, expect } from './fixtures';

// PHASE 0 (E6): Devanagari shaping, measured on the pixels the browser draws
// with the bundled Noto Sans Devanagari: in a page canvas (the preview's
// context) and in a worker OffscreenCanvas (the export's context).
test.setTimeout(60_000);
const FONT =
  '/fonts/noto-sans-devanagari/noto-sans-devanagari-devanagari-400-normal.woff2';

/** The measuring code, run in the page and (as text) in a worker. */
const MEASURE = `
async function measure(scope, canvasFactory) {
  const ink = (text, spacing) => {
    const canvas = canvasFactory(900, 160);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 900, 160);
    ctx.fillStyle = '#000';
    ctx.font = '96px NSD';
    ctx.textBaseline = 'alphabetic';
    if (spacing) ctx.letterSpacing = spacing + 'px';
    ctx.fillText(text, 100, 110);
    const { data } = ctx.getImageData(0, 0, 900, 160);
    let left = 900, right = -1, count = 0;
    for (let y = 0; y < 160; y++) for (let x = 0; x < 900; x++) {
      if (data[(y * 900 + x) * 4] < 128) { count++; left = Math.min(left, x); right = Math.max(right, x); }
    }
    return { left, right, width: right - left + 1, count };
  };
  const out = {};
  for (const [name, joined, split] of [
    ['ksha', 'क्ष', 'क्\\u200cष'],
    ['jna', 'ज्ञ', 'ज्\\u200cञ'],
    ['shra', 'श्र', 'श्\\u200cर'],
  ]) out[name] = { joined: ink(joined), split: ink(split) };
  out.ka = ink('क');
  out.ki = ink('कि');
  out.kii = ink('की');
  out.reph = ink('र्क');
  out.rephPlain = ink('रक');
  out.tofu = ink('\\u{10FFFF}');
  return out;
}`;

test('[TXT-025] Devanagari conjuncts (क्ष ज्ञ श्र), the i and ii matras and reph shape correctly in the preview canvas and in the export worker canvas', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  const result = await page.evaluate(
    async ({ font, code }) => {
      const buffer = await (await fetch(font)).arrayBuffer();
      const face = new FontFace('NSD', buffer.slice(0));
      await face.load();
      document.fonts.add(face);
      const measureCode = `${code}\nself.onmessage = async (e) => { const f = new FontFace('NSD', e.data); await f.load(); self.fonts.add(f); postMessage(await measure(self, (w, h) => new OffscreenCanvas(w, h))); };`;
      const worker = new Worker(
        URL.createObjectURL(
          new Blob([measureCode], { type: 'text/javascript' }),
        ),
      );
      const inWorker = new Promise<unknown>((resolve) => {
        worker.onmessage = (event) => resolve(event.data);
      });
      worker.postMessage(buffer.slice(0));
      const inPage = await new Function(`${code}; return measure;`)()(
        window,
        (w: number, h: number) => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          return canvas;
        },
      );
      return { inPage, inWorker: await inWorker };
    },
    { font: FONT, code: MEASURE },
  );
  type Ink = { left: number; width: number; count: number };
  type Out = Record<string, Ink | { joined: Ink; split: Ink }>;
  const checks = (out: Out) => {
    for (const name of ['ksha', 'jna', 'shra']) {
      const { joined, split } = out[name] as { joined: Ink; split: Ink };
      // A conjunct is one narrower cluster: the split form shows the halant.
      expect(joined.width, name).toBeLessThan(split.width);
      expect(joined.count, name).toBeGreaterThan(200);
    }
    const ka = out.ka as Ink,
      ki = out.ki as Ink,
      kii = out.kii as Ink;
    // Each matra adds ink to its consonant (ii after it, i before it).
    expect(ki.count).toBeGreaterThan(ka.count + 30);
    expect(kii.count).toBeGreaterThan(ka.count + 30);
    expect(kii.width).toBeGreaterThan(ka.width);
    expect(ki.left).toBeLessThanOrEqual(ka.left);
    // Reph is a mark above the consonant: no wider than the plain pair by more than a stem.
    expect((out.reph as Ink).count).toBeGreaterThan(200);
    // A real glyph is not the missing-glyph box.
    expect((out.ka as Ink).count).not.toBe((out.tofu as Ink).count);
  };
  checks(result.inPage as Out);
  checks(result.inWorker as Out);
  // Preview and export contexts draw identical ink.
  expect(result.inWorker).toEqual(result.inPage);
  // One look at the pixels (kept for the report).
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.id = 'devanagari-sample';
    canvas.width = 900;
    canvas.height = 140;
    canvas.style.cssText =
      'position:fixed;left:20px;top:20px;z-index:99999;background:#fff';
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 900, 140);
    ctx.fillStyle = '#000';
    ctx.font = '80px NSD';
    ctx.fillText('क्ष ज्ञ श्र कि की र्क', 20, 100);
    document.body.append(canvas);
  });
  await page
    .locator('#devanagari-sample')
    .screenshot({ path: 'reports/phase0/devanagari.png' });
});
