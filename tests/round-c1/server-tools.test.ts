// RDC1-006: the shared tools on the gateway: the owner adds a REST stock
// provider in Platform Config (no code change), the key lives on the
// server only, credits are charged on the server for successful paid calls,
// and the browser-only tools are refused there.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/platform-config';
import { startServer, type Started } from '../server/helpers';
import { fakeProvider, startFakeRest, type FakeRest } from './fake-rest';

let s: Started;
let fake: FakeRest;
let admin = '';
const publish = async (edit: (c: ReturnType<typeof defaultConfig>) => void) => {
  const c = defaultConfig();
  edit(c);
  const r = await s.api('/v1/config', {
    token: admin,
    body: { config: c, note: 'media provider', publish: true },
  });
  expect(r.status).toBe(200);
};
beforeAll(async () => {
  fake = await startFakeRest();
  s = await startServer({ FAKESTOCK_KEY: 'server-only-key' }, undefined, {
    toolRuntime: { fetch: fake.fetch, resolve: fake.resolve },
  });
  admin = s.token('admin-0000', { app_metadata: { role: 'admin' } });
  await publish((c) => c.mediaProviders.push(fakeProvider({ costPerCall: 2 })));
});
afterAll(async () => {
  await s.close();
  await fake.close();
});
const run = (token: string, tool: string, input: unknown) =>
  s.api('/v1/tools/run', { token, body: { tool, input, videoId: 'v1' } });

describe('[RDC1-006] tools on the gateway', () => {
  it('[RDC1-006] searchMedia finds items from the provider the owner added; the key stays on the server; the paid search is charged once', async () => {
    const user = s.token('user-tools-1');
    const before = (await s.api('/v1/balance', { token: user })).body
      .balance as number;
    const r = await run(user, 'searchMedia', {
      kind: 'stock-video',
      query: 'river',
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.output.items[0]).toMatchObject({
      key: 'fakestock:101',
      provider: 'fakestock',
    });
    expect(JSON.stringify(r.body)).not.toMatch(/server-only-key/);
    expect(fake.calls.at(-1)).toMatch(/\|server-only-key$/);
    expect((await s.api('/v1/balance', { token: user })).body.balance).toBe(
      before - 2,
    );
    // A failing provider costs nothing.
    const failed = await run(user, 'searchMedia', {
      kind: 'stock-video',
      query: 'error',
    });
    expect(failed.body.output.failures[0].message).toMatch(/500/);
    expect((await s.api('/v1/balance', { token: user })).body.balance).toBe(
      before - 2,
    );
  });
  it('[RDC1-006] the capability sheet follows the published config; disabling the provider between plan and build removes it', async () => {
    const user = s.token('user-tools-2');
    const a = await run(user, 'getCapabilities', {});
    expect(a.body.output.text).toMatch(/fakestock/);
    await publish((c) =>
      c.mediaProviders.push(fakeProvider({ enabled: false })),
    );
    const b = await run(user, 'getCapabilities', {});
    expect(b.body.output.text).not.toMatch(/fakestock/);
    const search = await run(user, 'searchMedia', {
      kind: 'stock-video',
      query: 'river',
    });
    expect(search.body.output.items).toEqual([]);
    expect(search.body.output.asked).not.toContain('fakestock');
    await publish((c) =>
      c.mediaProviders.push(fakeProvider({ costPerCall: 2 })),
    );
  });
  it('[RDC1-006] editor-only and unknown tools are refused; web tools follow the rules (off by default); no credits means no paid search', async () => {
    const user = s.token('user-tools-3');
    expect(
      (await run(user, 'renderFrames', { project: {}, times: [0] })).body,
    ).toMatchObject({
      ok: false,
      error: 'The renderFrames tool runs in the editor, not on the server.',
    });
    expect((await run(user, 'rm-rf', {})).body).toMatchObject({
      ok: false,
      code: 'unknown-tool',
    });
    expect(
      (await run(user, 'fetchPage', { url: 'https://example.com/' })).body,
    ).toMatchObject({ ok: false, error: 'Reading web pages is turned off.' });
    await publish((c) => {
      c.mediaProviders.push(fakeProvider({ costPerCall: 9999 }));
    });
    const poor = await run(user, 'searchMedia', {
      kind: 'stock-photo',
      query: 'fort',
    });
    expect(poor.body.output.failures[0].message).toMatch(/not enough credits/);
    await publish((c) =>
      c.mediaProviders.push(fakeProvider({ costPerCall: 2 })),
    );
  });
});
