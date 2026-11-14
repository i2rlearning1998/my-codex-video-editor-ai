// RDC1-001..006: the provider registry in Platform Config, the REST
// descriptor runtime behind the network guard (a real local HTTP server
// plays the provider), searchMedia, capability sheet v2 from the live
// config, and the DOM-free tool registry (run under Node, no DOM).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  defaultConfig,
  platformConfigSchema,
  type PlatformConfig,
} from '../../src/platform-config';
import { memoryUsageLog } from '../../src/gateway/usage';
import { runTool, TOOL_IDS, type ToolContext } from '../../src/tools';
import { checkUrl, isPrivateAddress } from '../../src/tools/net-guard';
import {
  RateLimiter,
  restRunner,
  searchMedia,
  type MediaItem,
  type MediaRuntime,
} from '../../src/tools/media';
import { buildVideoFromPlan } from '../../src/video-plan';
import { fakeProvider, startFakeRest, type FakeRest } from './fake-rest';
import type { Asset } from '../../src/core';

let fake: FakeRest;
beforeAll(async () => {
  fake = await startFakeRest();
});
afterAll(() => fake.close());
const runtime = (): MediaRuntime => ({
  builtin: {},
  rest: restRunner({
    fetch: fake.fetch,
    resolve: fake.resolve,
    key: (ref) => (ref === 'FAKESTOCK_KEY' ? 'secret-123' : undefined),
  }),
});
const config = (edit: (c: PlatformConfig) => void = () => {}) => {
  const c = defaultConfig();
  c.mediaProviders = c.mediaProviders.map((p) => ({ ...p, enabled: false }));
  c.mediaProviders.push(fakeProvider());
  edit(c);
  return platformConfigSchema.parse(c);
};
const ctx = (
  c: PlatformConfig,
  over: Partial<ToolContext> = {},
): ToolContext => ({
  config: c,
  planId: c.plans[0]!.id,
  userId: 'u1',
  media: runtime(),
  usage: memoryUsageLog(),
  ...over,
});

describe('[RDC1-001] provider registry in Platform Config', () => {
  it('[RDC1-001] an old config without the registry is still valid and gets the built-in providers', () => {
    const old = JSON.parse(JSON.stringify(defaultConfig())) as Record<
      string,
      any
    >;
    delete old.mediaProviders;
    delete old.director.web;
    delete old.director.rulebook;
    const parsed = platformConfigSchema.parse(old);
    expect(parsed.mediaProviders.map((p) => p.id)).toEqual([
      'pexels',
      'pixabay',
      'iconify',
      'freesound',
      'offline-captions',
    ]);
    expect(
      parsed.mediaProviders.every((p) => p.adapter.type === 'builtin'),
    ).toBe(true);
    expect(parsed.director.web.enabled).toBe(false);
    expect(parsed.director.rulebook.length).toBeGreaterThan(5);
    expect(parsed.director.rulebook.every((r) => r.en && r.hi)).toBe(true);
  });
  it('[RDC1-001] a REST provider is data: http, a key in the config, code in a path and a duplicate id are refused', () => {
    expect(() => config()).not.toThrow();
    const bad = (edit: (p: any) => void) => () =>
      config((c) => {
        const p = fakeProvider() as any;
        edit(p);
        c.mediaProviders[c.mediaProviders.length - 1] = p;
      });
    expect(
      bad(
        (p) =>
          (p.adapter.descriptor.baseUrl = 'http://stock.fake-provider.test'),
      ),
    ).toThrow(/https/);
    expect(
      bad((p) => (p.adapter.descriptor.auth.keyRef = 'sk-live-123')),
    ).toThrow();
    expect(
      bad((p) => (p.adapter.descriptor.response.items = 'data.hits.map(x=>x)')),
    ).toThrow(/path/);
    expect(() => config((c) => c.mediaProviders.push(fakeProvider()))).toThrow(
      /duplicate media provider/,
    );
    // A new kind is data too.
    expect(() =>
      config((c) =>
        c.mediaProviders.push(
          fakeProvider({ id: 'gifs', kinds: ['animated-gif'] }),
        ),
      ),
    ).not.toThrow();
  });
});

describe('[RDC1-002] REST runtime behind the network guard', () => {
  const search = (query: string, c = config()) =>
    searchMedia(
      { kind: 'stock-video', query },
      { providers: c.mediaProviders, planId: 'free', runtime: runtime() },
    );
  it('[RDC1-002] maps the reply by path expressions, sends the key from the vault, keeps licence and credit', async () => {
    const r = await search('river');
    expect(r.failures).toEqual([]);
    expect(r.items[0]).toMatchObject({
      key: 'fakestock:101',
      title: 'River delta at dawn',
      width: 1920,
      height: 1080,
      duration: 18,
      licence: 'free',
      attribution: 'Asha',
      download: 'https://stock.fake-provider.test/files/101.mp4',
    });
    expect(fake.calls.at(-1)).toMatch(/term=river.*\|secret-123$/);
  });
  it.each([
    ['nothing', /^$/],
    ['badformat', /shape it did not promise/],
    ['notjson', /not JSON/],
    ['huge', /too large/],
    ['error', /answered with an error \(500\)/],
    ['slow', /took too long/],
    ['private', /private or local/],
    ['sneaky', /leaves the provider's own host/],
  ])(
    '[RDC1-002] a reply "%s" is a plain failure of that provider only',
    async (q, msg) => {
      const r = await search(q);
      expect(r.items).toEqual([]);
      if (q === 'nothing') expect(r.failures).toEqual([]);
      else expect(r.failures[0]!.message).toMatch(msg);
    },
  );
  it('[RDC1-002] the guard refuses http, IP literals, local names, logins and private addresses', async () => {
    const o = {
      resolve: async (h: string) =>
        h === 'evil.example.com' ? ['192.168.1.4'] : ['93.184.216.34'],
    };
    await expect(checkUrl('http://a.example.com/x', o)).rejects.toThrow(
      /Only https/,
    );
    await expect(checkUrl('https://127.0.0.1/x', o)).rejects.toThrow(/private/);
    await expect(checkUrl('https://[::1]/x', o)).rejects.toThrow(/private/);
    await expect(checkUrl('https://printer.local/x', o)).rejects.toThrow(
      /private/,
    );
    await expect(checkUrl('https://u:p@a.example.com/', o)).rejects.toThrow(
      /login/,
    );
    await expect(checkUrl('https://evil.example.com/', o)).rejects.toThrow(
      /private/,
    );
    await expect(checkUrl('https://a.example.com:8443/', o)).rejects.toThrow(
      /port/,
    );
    for (const ip of [
      '10.0.0.1',
      '172.20.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '::ffff:127.0.0.1',
      'fd00::1',
      'fe80::1',
    ])
      expect(isPrivateAddress(ip)).toBe(true);
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });
});

describe('[RDC1-003] searchMedia over every enabled provider of a kind', () => {
  const item = (
    id: string,
    title: string,
    provider = 'b',
  ): Omit<MediaItem, 'provider' | 'providerName' | 'kind' | 'mediaType'> & {
    key: string;
  } => ({
    key: `${provider}:${id}`,
    id,
    title,
    tags: [],
    thumbnail: `https://cdn.example.com/${id}-t.jpg`,
    preview: '',
    download: `https://cdn.example.com/${title.replace(/\s/g, '-')}.jpg`,
    width: 1000,
    height: 800,
    duration: 0,
    licence: 'free',
    attribution: provider,
  });
  const twoProviders = (c: PlatformConfig) => {
    const b = fakeProvider({
      id: 'other',
      name: 'Other',
      adapter: { type: 'builtin', name: 'other' },
    });
    c.mediaProviders.push(b);
  };
  const rt = (other: () => Promise<any[]>): MediaRuntime => ({
    ...runtime(),
    builtin: {
      other: async () =>
        (await other()).map((x) => ({
          ...x,
          provider: 'other',
          providerName: 'Other',
          kind: 'stock-photo',
          mediaType: 'image',
        })),
    },
  });
  it('[RDC1-003] asks providers in parallel, merges, removes the same picture from two providers, ranks deterministically', async () => {
    const c = config(twoProviders);
    const same = item('9', 'Old stone fort', 'other');
    const r = await searchMedia(
      { kind: 'stock-photo', query: 'fort' },
      {
        providers: c.mediaProviders,
        planId: 'free',
        runtime: rt(async () => [{ ...same, width: 2400, height: 1600 }]),
      },
    );
    expect(r.asked).toEqual(['fakestock', 'other']);
    expect(r.items.filter((i) => i.title === 'Old stone fort')).toHaveLength(1);
    const again = await searchMedia(
      { kind: 'stock-photo', query: 'fort' },
      {
        providers: c.mediaProviders,
        planId: 'free',
        runtime: rt(async () => [{ ...same, width: 2400, height: 1600 }]),
      },
    );
    expect(again.items.map((i) => i.key)).toEqual(r.items.map((i) => i.key));
  });
  it('[RDC1-003] one provider failing never fails the rest; all disabled asks nobody', async () => {
    const c = config(twoProviders);
    const r = await searchMedia(
      { kind: 'stock-photo', query: 'fort' },
      {
        providers: c.mediaProviders,
        planId: 'free',
        runtime: rt(async () => {
          throw new Error('boom');
        }),
      },
    );
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.failures).toEqual([
      { provider: 'other', name: 'Other', message: 'Other: boom.' },
    ]);
    const off = config((x) =>
      x.mediaProviders.forEach((p) => (p.enabled = false)),
    );
    const none = await searchMedia(
      { kind: 'stock-photo', query: 'fort' },
      { providers: off.mediaProviders, planId: 'free', runtime: runtime() },
    );
    expect(none).toMatchObject({ items: [], asked: [], failures: [] });
  });
  it('[RDC1-003] plans, credits, licences and the rate limit come from the config', async () => {
    const paid = config((c) => (c.mediaProviders.at(-1)!.costPerCall = 2));
    let spent = 0;
    const poor = await searchMedia(
      { kind: 'stock-photo', query: 'fort' },
      {
        providers: paid.mediaProviders,
        planId: 'free',
        runtime: runtime(),
        available: () => 1,
        spend: (_p, n) => (spent += n),
      },
    );
    expect(poor.failures[0]!.message).toMatch(/not enough credits/);
    expect(spent).toBe(0);
    const rich = await searchMedia(
      { kind: 'stock-photo', query: 'fort' },
      {
        providers: paid.mediaProviders,
        planId: 'free',
        runtime: runtime(),
        available: () => 10,
        spend: (_p, n) => (spent += n),
      },
    );
    expect(rich.credits).toBe(2);
    expect(spent).toBe(2);
    const failing = await searchMedia(
      { kind: 'stock-photo', query: 'error' },
      {
        providers: paid.mediaProviders,
        planId: 'free',
        runtime: runtime(),
        available: () => 10,
        spend: (_p, n) => (spent += n),
      },
    );
    expect(failing.credits).toBe(0); // a failure is not charged
    const pro = config((c) => (c.mediaProviders.at(-1)!.plans = ['pro']));
    expect(
      (
        await searchMedia(
          { kind: 'stock-photo', query: 'fort' },
          { providers: pro.mediaProviders, planId: 'free', runtime: runtime() },
        )
      ).asked,
    ).toEqual([]);
    const lic = config((c) => (c.mediaProviders.at(-1)!.licences = ['free']));
    const fort = await searchMedia(
      { kind: 'stock-photo', query: 'fort' },
      { providers: lic.mediaProviders, planId: 'free', runtime: runtime() },
    );
    expect(fort.items.map((i) => i.licence)).toEqual(['free']);
    const slow = config(
      (c) => (c.mediaProviders.at(-1)!.rateLimit = { perMinute: 1 }),
    );
    const limiter = new RateLimiter(() => 0);
    await searchMedia(
      { kind: 'stock-photo', query: 'fort' },
      {
        providers: slow.mediaProviders,
        planId: 'free',
        runtime: runtime(),
        limiter,
      },
    );
    const busy = await searchMedia(
      { kind: 'stock-photo', query: 'fort' },
      {
        providers: slow.mediaProviders,
        planId: 'free',
        runtime: runtime(),
        limiter,
      },
    );
    expect(busy.failures[0]!.message).toMatch(/busy/);
  });
});

describe('[RDC1-004] capability sheet v2 from the live config', () => {
  it('[RDC1-004] a provider the owner adds is listed and found; disabled, it disappears; the version follows', async () => {
    const without = config((c) => c.mediaProviders.pop());
    const withIt = config();
    const a = await runTool('getCapabilities', {}, ctx(without));
    const b = await runTool('getCapabilities', {}, ctx(withIt));
    if (!a.ok || !b.ok) throw new Error('tool failed');
    expect(a.output.text).not.toMatch(/fakestock/);
    expect(b.output.text).toMatch(
      /stock-video: fakestock \(Documentary footage and photos; 60\/min\)/,
    );
    expect(b.output.text).toMatch(/VERSION 4 LAYER FIELDS/);
    expect(b.output.version).not.toBe(a.output.version);
    // A plan that needs footage finds items from it (no code change).
    const make = (key: string, d: number) =>
      ({
        id: key.replace(':', '-'),
        name: key,
        type: 'video',
        source: { kind: 'local', reference: `media/${key}` },
        metadata: { mimeType: 'video/mp4', size: 1 },
        duration: d,
        width: 1920,
        height: 1080,
      }) as unknown as Asset;
    const built = await buildVideoFromPlan(
      {
        format: 'video-plan',
        version: 4,
        meta: { title: 'Rivers' },
        captions: { enabled: false },
        scenes: [
          {
            id: 'a',
            durationHint: 5,
            layers: [
              {
                id: 'f',
                kind: 'media',
                size: 'full',
                mediaIntent: { query: 'river', type: 'video' },
              },
            ],
          },
        ],
      },
      {
        resolve: {
          local: () => [],
          stock: async (query, type) => {
            const r = await runTool(
              'searchMedia',
              { kind: type === 'video' ? 'stock-video' : 'stock-photo', query },
              ctx(withIt),
            );
            if (!r.ok) throw new Error(r.error);
            return r.output.items.map((i) => ({
              key: i.key,
              source: 'stock' as const,
              kind:
                i.mediaType === 'video'
                  ? ('video' as const)
                  : ('image' as const),
              title: i.title,
              tags: [...i.tags],
              width: i.width,
              height: i.height,
              duration: i.duration,
              licence: i.licence,
              attribution: i.attribution,
              provider: i.provider,
            }));
          },
        },
        importCandidate: async (c) => make(c.key, c.duration ?? 0),
      },
    );
    expect(built.resolved['a/f']).toBe('fakestock:101');
    const off = config((c) => (c.mediaProviders.at(-1)!.enabled = false));
    const d = await runTool('getCapabilities', {}, ctx(off));
    if (!d.ok) throw new Error('tool failed');
    expect(d.output.text).not.toMatch(/fakestock/);
  });
});

describe('[RDC1-005] the shared tools run under Node with no DOM', () => {
  it('[RDC1-005] no DOM; every tool is listed; typed errors in plain sentences; each call is in the usage log', async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe(
      'undefined',
    );
    expect(TOOL_IDS).toEqual([
      'getCapabilities',
      'searchMedia',
      'searchWeb',
      'fetchPage',
      'listLibrary',
      'validatePlan',
      'checkBlock',
      'buildPlan',
      'renderFrames',
      'registerBlock',
    ]);
    const c = ctx(config());
    expect(await runTool('makeCoffee', {}, c)).toMatchObject({
      ok: false,
      code: 'unknown-tool',
      error: 'There is no tool called "makeCoffee".',
    });
    expect(
      await runTool('searchMedia', { kind: 'stock-photo' }, c),
    ).toMatchObject({ ok: false, code: 'invalid-input' });
    expect(
      await runTool('renderFrames', { project: {}, times: [1] }, c),
    ).toMatchObject({
      ok: false,
      error: 'Frames can only be drawn in the editor.',
    });
    expect(
      await runTool('fetchPage', { url: 'https://example.com/' }, c),
    ).toMatchObject({ ok: false, error: 'Reading pages needs the server.' });
    const ok = await runTool(
      'searchMedia',
      { kind: 'stock-photo', query: 'fort' },
      c,
    );
    expect(ok.ok).toBe(true);
    const rows = c.usage!.list('u1');
    expect(rows.map((r) => [r.modelId, r.outcome])).toEqual([
      ['tool:makeCoffee', 'refused'],
      ['tool:searchMedia', 'refused'],
      ['tool:renderFrames', 'failed'],
      ['tool:fetchPage', 'failed'],
      ['tool:searchMedia', 'ok'],
    ]);
  });
  it('[RDC1-005] checkBlock and registerBlock check new graphics; the Project kit then lists them in the sheet', async () => {
    const { BAR_RISE } = await import('./v4-fixtures');
    const saved: any[] = [];
    const c = ctx(config(), {
      kit: { list: () => saved, add: (e) => saved.push(e) },
    });
    const bad = await runTool(
      'checkBlock',
      {
        id: 'bar-rise',
        tier: 'B',
        source: '({ id: "bar-rise", render() { window.alert(1) } })',
      },
      c,
    );
    expect(bad.ok && bad.output.ok).toBe(false);
    const good = await runTool(
      'registerBlock',
      { id: 'bar-rise', tier: 'B', source: BAR_RISE, summary: 'Bars rise.' },
      c,
    );
    expect(good.ok).toBe(true);
    const sheet = await runTool('getCapabilities', {}, c);
    expect(sheet.ok && sheet.output.text).toMatch(
      /- bar-rise: Rising bars \[Tier B\] Bars rise\. Settings: color, bars, speed/,
    );
  });
});
