// Run from repository root: node fx-gallery/scripts/fx-bench.mjs
// Uses the already-installed Vite transformer; no TS runtime dependency.
import { cpus } from 'node:os';
import { bundleFx } from './load-fx.mjs';
const fx = await import(await bundleFx());
const alphaInput = process.argv.includes('--alpha');
const w = 1280,
  h = 720,
  a = fx.surface(w, h),
  b = fx.surface(w, h),
  d = fx.surface(w, h);
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    a.data.set(
      [
        (x / w) * 255,
        (y / h) * 255,
        (x + y) % 256,
        alphaInput ? (x + y) % 256 : 255,
      ],
      i,
    );
    b.data.set(
      [
        255 - (y / h) * 255,
        (x / w) * 255,
        128,
        alphaInput ? (x * 3 + y) % 256 : 255,
      ],
      i,
    );
  }
const ctx = { width: w, height: h, time: 1.37, duration: 4, seed: 42 };
const rows = [];
for (const def of [
  ...fx.adjustments,
  ...fx.filters,
  ...fx.effects,
  ...fx.transitions,
]) {
  const params = def.kind === 'adjustment' ? { amount: 0.5 } : {};
  const run = () =>
    def.kind === 'transition'
      ? def.apply(a, b, d, 0.43, params, ctx)
      : def.apply(a, d, params, ctx);
  const coldStart = performance.now();
  run();
  const firstCallMs = performance.now() - coldStart;
  for (let i = 0; i < 3; i++) run();
  const times = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    run();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const target =
    def.kind === 'adjustment'
      ? 8
      : def.kind === 'filter'
        ? 15
        : def.kind === 'transition'
          ? 25
          : 40;
  rows.push({
    id: def.id,
    firstCallMs: +firstCallMs.toFixed(2),
    medianMs: +times[3].toFixed(2),
    maxMs: +times[6].toFixed(2),
    targetMs: target,
    withinTarget: times[3] <= target,
  });
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      alphaInput,
      cpu: cpus()[0]?.model,
      width: w,
      height: h,
      method:
        'Bundled ES module (no Vite SSR wrappers); 3 warmups + 7 samples, median; defaults except adjustment amount=.5; effect time=1.37s; transition progress=.43; allocation included; no timing assertions',
      items: rows,
    },
    null,
    2,
  ),
);
