import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'vite';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SandboxClient } from '../../src/blocks/sandbox/client';
import type { WorkerPort } from '../../src/blocks/sandbox/client';
import { compileBlock } from '../../src/blocks/sandbox/compile';
let folder = '';
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'blocks-worker-'));
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      outDir: folder,
      emptyOutDir: false,
      lib: {
        entry: 'tests/blocks/node-entry.ts',
        formats: ['es'],
        fileName: () => 'worker.mjs',
      },
      rollupOptions: { external: ['node:worker_threads'] },
    },
  });
});
afterAll(async () => {
  if (folder) await rm(folder, { recursive: true, force: true });
});
function client() {
  const worker = new Worker(join(folder, 'worker.mjs'));
  const port: WorkerPort = {
    postMessage: (v) => worker.postMessage(v),
    terminate: () => worker.terminate(),
    onmessage: null,
    onerror: null,
  };
  worker.on('message', (data) => port.onmessage?.({ data }));
  worker.on('error', (error) => port.onerror?.({ message: error.message }));
  return new SandboxClient(port, 250);
}
function compiled(body: string) {
  const result = compileBlock(
    `({id:'test',version:'1.0.0',name:'Test',category:'Test',defaultDuration:4,params:[],render(ctx,t,size,params,seed){${body}}})`,
  );
  if (!result.ok) throw Error(result.error);
  return result.value;
}
const frame = { t: 3, size: { width: 320, height: 180 }, params: {}, seed: 7 };
it('real worker is scrub independent and reports user errors as values', async () => {
  const c = client();
  try {
    const code = compiled('ctx.fillRect(t, helpers.rngFor(seed, 0), 10, 10);');
    const a = await c.render({ ...frame, compiled: code });
    expect(a.ok, a.error).toBe(true);
    await c.render({ ...frame, t: 1, compiled: code });
    expect((await c.render({ ...frame, compiled: code })).pixels).toEqual(
      a.pixels,
    );
    const bad = await c.render({
      ...frame,
      compiled: compiled('ctx.restore();'),
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/restore/i);
    expect((await c.render({ ...frame, compiled: code })).ok).toBe(true);
  } finally {
    c.dispose();
  }
});
it('terminates an infinite loop while the host remains responsive', async () => {
  const c = client();
  let ticked = false;
  const tick = setTimeout(() => {
    ticked = true;
  }, 40);
  try {
    const result = await c.render({
      ...frame,
      compiled: compiled('while(true) {}'),
    });
    expect(ticked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/250 ms.*terminated/);
  } finally {
    clearTimeout(tick);
    c.dispose();
  }
});
it('dispose before startup resolves pending calls', async () => {
  const c = client();
  c.dispose();
  expect((await c.render({ ...frame, blockId: 'counter' })).ok).toBe(false);
});
