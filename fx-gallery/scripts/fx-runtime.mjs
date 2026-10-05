import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { bundleFx } from './load-fx.mjs';
async function run(url) {
  const fx = await import(url),
    a = fx.surface(19, 13),
    b = fx.surface(19, 13),
    ctx = { time: 1.37, duration: 4, seed: -31, width: 19, height: 13 },
    out = {};
  const rng = fx.random(113);
  for (let i = 0; i < a.data.length; i++) {
    a.data[i] = rng() * 256;
    b.data[i] = rng() * 256;
  }
  for (const def of [
    ...fx.adjustments,
    ...fx.filters,
    ...fx.effects,
    ...fx.transitions,
  ]) {
    const d = fx.surface(19, 13);
    if (def.kind === 'transition') def.apply(a, b, d, 0.43, {}, ctx);
    else def.apply(a, d, { intensity: 0.73 }, ctx);
    out[def.id] = createHash('sha256').update(d.data).digest('hex');
  }
  return out;
}
if (isMainThread) {
  const url = await bundleFx(),
    main = await run(url);
  const worker = new Worker(new URL(import.meta.url), { workerData: url });
  const other = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code) reject(new Error('Worker exit ' + code));
    });
  });
  if (JSON.stringify(main) !== JSON.stringify(other))
    throw new Error('Main/worker byte parity failed');
  console.log(
    JSON.stringify({
      items: Object.keys(main).length,
      parity: 'identical bytes in Node main and Worker',
      browser: false,
    }),
  );
} else parentPort.postMessage(await run(workerData));
