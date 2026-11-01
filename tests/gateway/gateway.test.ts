// P2-R1 Part C: gateway core on the mock and on documented fixture JSON.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CreditLedger,
  GatewayError,
  anthropicAdapter,
  createGateway,
  creditsOf,
  emptyUsage,
  estimateDirector,
  estimateStudio,
  googleAdapter,
  memoryLedgerStore,
  memoryUsageLog,
  mockAdapter,
  openaiAdapter,
  preCheck,
  storageLedgerStore,
  xaiAdapter,
  type GatewayRequest,
} from '../../src/gateway';
import {
  defaultConfig,
  modelById,
  planFor,
  providerById,
  studioById,
} from '../../src/platform-config';

const fixture = (n: string) =>
  JSON.parse(
    readFileSync(`tests/fixtures/gateway/${n}.json`, 'utf8'),
  ) as unknown;
const req: GatewayRequest = {
  system: 'Plan the video.',
  messages: [{ role: 'user', content: 'Eratosthenes' }],
  json: true,
  maxOutputTokens: 900,
};
const zeroUse = {
  exportsThisMonth: 0,
  storageMb: 0,
  voiceClones: 0,
  projects: 0,
  callsLastMinute: 0,
  creditsToday: 0,
};

function setup(failure: Parameters<typeof mockAdapter>[0] = {}) {
  const config = defaultConfig();
  const ledgers = new Map<string, CreditLedger>();
  const ledger = (u: string) => {
    if (!ledgers.has(u))
      ledgers.set(
        u,
        new CreditLedger(memoryLedgerStore(), () => '2026-11-01T10:00:00.000Z'),
      );
    return ledgers.get(u)!;
  };
  const usageLog = memoryUsageLog();
  let t = Date.parse('2026-11-01T10:00:00Z');
  const gw = createGateway({
    config: () => config,
    adapters: { mock: mockAdapter(failure) },
    ledger,
    usageLog,
    limits: () => ({
      exportsThisMonth: 0,
      storageMb: 0,
      voiceClones: 0,
      projects: 0,
    }),
    now: () => (t += 10),
  });
  return { config, gw, ledger, usageLog };
}

describe('P2-R1 gateway', () => {
  it('[P2R1-009] the mock adapter is deterministic and fails on request', async () => {
    const c = defaultConfig();
    const ctx = {
      model: modelById(c, 'mock-fast')!,
      provider: providerById(c, 'mock')!,
    };
    const a = await mockAdapter().call(req, ctx);
    const b = await mockAdapter().call(req, ctx);
    expect(a).toEqual(b);
    expect(a.usage.inputTokens).toBeGreaterThan(0);
    for (const f of ['error', 'timeout', 'rate-limit'] as const)
      await expect(
        mockAdapter({ failure: f }).call(req, ctx),
      ).rejects.toBeInstanceOf(GatewayError);
    expect(
      (await mockAdapter({ failure: 'bad-json' }).call(req, ctx)).text,
    ).toMatch(/not json/);
    const img = await mockAdapter().call(
      { ...req, units: 3 },
      {
        model: modelById(c, 'mock-image')!,
        provider: providerById(c, 'mock')!,
      },
    );
    expect(img.media).toMatchObject({ kind: 'image', units: 3 });
    expect(img.usage.images).toBe(3);
  });

  it('[P2R1-010] real adapters build requests with secret names only and parse documented responses; without a server they say not connected', async () => {
    const c = defaultConfig();
    const cases = [
      [
        'anthropic',
        anthropicAdapter(),
        'claude-balanced',
        '/v1/messages',
        'x-api-key',
      ],
      [
        'openai',
        openaiAdapter(),
        'openai-balanced',
        '/v1/chat/completions',
        'authorization',
      ],
      [
        'google',
        googleAdapter(),
        'gemini-fast',
        ':generateContent',
        'x-goog-api-key',
      ],
      [
        'xai',
        xaiAdapter(),
        'grok-balanced',
        '/v1/chat/completions',
        'authorization',
      ],
    ] as const;
    for (const [name, adapter, modelId, path, header] of cases) {
      const model = modelById(c, modelId)!;
      expect(model.tested).toBe(false);
      const ctx = { model, provider: providerById(c, model.providerId)! };
      const http = adapter.buildRequest(req, ctx);
      expect(http.url).toContain(path);
      expect(http.headers[header]).toContain(`secret:${ctx.provider.keyRef}`);
      expect(JSON.stringify(http)).not.toMatch(/sk-|AIza/);
      const r = adapter.parseResponse(fixture(name), ctx);
      expect(JSON.parse(r.text!)).toEqual({ ok: true });
      expect(r.usage).toMatchObject({ inputTokens: 1200, outputTokens: 340 });
      expect(adapter.connected()).toBe(false);
      await expect(adapter.call(req, ctx)).rejects.toMatchObject({
        code: 'not-connected',
      });
      expect(() => adapter.parseResponse({ nope: 1 }, ctx)).toThrow(
        GatewayError,
      );
    }
    // With a transport (a server), the same adapter calls through it.
    const model = modelById(c, 'claude-balanced')!;
    const ctx = { model, provider: providerById(c, 'anthropic')! };
    const seen: unknown[] = [];
    const r = await anthropicAdapter(
      async (h) => (seen.push(h), fixture('anthropic')),
    ).call(req, ctx);
    expect(r.usage.outputTokens).toBe(340);
    expect(seen).toHaveLength(1);
  });

  it('[P2R1-011] the estimator gives min and max credits per scene and in total, from config', () => {
    const c = defaultConfig();
    const fast = modelById(c, 'mock-fast')!;
    const best = modelById(c, 'mock-best')!;
    const methods = ['motion-graphics', 'library', 'stock', 'ai-image'];
    const a = estimateDirector(c, fast, { briefChars: 800, methods });
    const b = estimateDirector(c, best, { briefChars: 800, methods });
    expect(a.scenes).toHaveLength(4);
    expect(a.scenes.reduce((s, x) => s + x.max, 0)).toBe(a.max);
    expect(a.min).toBeLessThanOrEqual(a.max);
    expect(b.max).toBeGreaterThan(a.max);
    // Image scene: the owner's 10 credits plus its share of the model.
    expect(a.scenes[3]!.min).toBeGreaterThanOrEqual(10);
    // credits = ceil(usd x margin x rate)
    const u = { ...emptyUsage(), inputTokens: 1_000_000 };
    expect(creditsOf(c, fast, u)).toBe(30); // 0.2 USD x 1.5 x 100, float dust removed
    const img = estimateStudio(
      c,
      studioById(c, 'images')!,
      modelById(c, 'mock-image')!,
      { prompt: 'a', count: 2 },
    );
    expect(img).toMatchObject({
      units: 2,
      min: 20 + Math.ceil(2 * 0.04 * 1.5 * 100),
    });
  });

  it('[P2R1-012] the ledger is append-only, idempotent, and the balance is derived', () => {
    const kv = new Map<string, string>();
    const storage = {
      getItem: (k: string) => kv.get(k) ?? null,
      setItem: (k: string, v: string) => void kv.set(k, v),
    };
    const l = new CreditLedger(storageLedgerStore(storage, 'u1'));
    l.grant(100, 'g1', 'monthly');
    l.grant(100, 'g1', 'monthly'); // retried: no second grant
    expect(l.balance()).toBe(100);
    l.adjust(-10, 'a1', 'support');
    const r = l.reserve(30, 'r1');
    expect(l.reserve(30, 'r1').id).toBe(r.id);
    expect(l.balance()).toBe(60);
    expect(l.held()).toBe(30);
    const before = l.history().length;
    expect(new CreditLedger(storageLedgerStore(storage, 'u1')).balance()).toBe(
      60,
    );
    expect(new CreditLedger(storageLedgerStore(storage, 'u2')).balance()).toBe(
      0,
    );
    l.settle(r.id, 12, 's1');
    expect(l.history().length).toBe(before + 2); // settle + refund of the rest
    expect(l.balance()).toBe(78);
    expect(l.history().slice(0, before)).toEqual(
      new CreditLedger(storageLedgerStore(storage, 'u1'))
        .history()
        .slice(0, before),
    );
  });

  it('[P2R1-013] reserve at max, settle at actual, refund the difference; failure refunds in full; settling twice is a no-op', () => {
    const l = new CreditLedger(memoryLedgerStore());
    l.grant(50, 'g');
    const r = l.reserve(40, 'r');
    expect(() => l.reserve(20, 'r2')).toThrow(
      /needs 20 credits and you have 10/,
    );
    l.settle(r.id, 25, 's');
    l.settle(r.id, 5, 's-again');
    expect(l.balance()).toBe(25);
    expect(l.reservations().get(r.id)).toMatchObject({
      state: 'settled',
      used: 25,
    });
    const r2 = l.reserve(20, 'r3');
    l.refund(r2.id, 'f');
    l.refund(r2.id, 'f2');
    l.settle(r2.id, 20, 's3');
    expect(l.balance()).toBe(25);
    // Using more than was held is capped at the hold.
    const r3 = l.reserve(5, 'r4');
    l.settle(r3.id, 99, 's4');
    expect(l.balance()).toBe(20);
  });

  it('[P2R1-014] pre-call checks refuse with a code and one sentence', () => {
    const c = defaultConfig();
    const free = planFor(c, 'free');
    const base = { config: c, plan: free, maxCredits: 5, usage: zeroUse };
    const code = (x: Partial<Parameters<typeof preCheck>[0]>) => {
      try {
        preCheck({ ...base, ...x });
        return 'ok';
      } catch (e) {
        expect((e as Error).message).toMatch(/\.$/);
        return (e as GatewayError).code;
      }
    };
    expect(code({ modelId: 'mock-balanced' })).toBe('ok');
    expect(code({ modelId: 'mock-best' })).toBe('model-plan');
    expect(code({ modelId: 'claude-best' })).toBe('model-disabled');
    expect(code({ modelId: 'zzz' })).toBe('model-unknown');
    expect(code({ toolId: 'ai-video' })).toBe('tool-plan');
    expect(code({ toolId: 'rm-rf' })).toBe('tool-unknown');
    expect(
      code({ plan: planFor(c, 'pro'), toolId: 'ai-image', maxCredits: 60 }),
    ).toBe('tool-cap');
    expect(code({ requires: ['studio-images'] })).toBe('tool-plan');
    expect(
      code({ action: 'export', usage: { ...zeroUse, exportsThisMonth: 3 } }),
    ).toBe('limit-exports');
    expect(
      code({ action: 'voice-clone', usage: { ...zeroUse, voiceClones: 1 } }),
    ).toBe('limit-voice-clones');
    expect(
      code({ action: 'project', usage: { ...zeroUse, projects: 10 } }),
    ).toBe('limit-projects');
    expect(code({ addMb: 5000 })).toBe('limit-storage');
    expect(code({ maxCredits: 61 })).toBe('budget-day');
    expect(code({ usage: { ...zeroUse, callsLastMinute: 20 } })).toBe(
      'rate-limit',
    );
    const c2 = defaultConfig();
    c2.director.budget.maxCreditsPerVideo = 100;
    expect(code({ config: c2, videoCredits: 101 })).toBe('budget-video');
  });

  it('[P2R1-015] every call leaves a usage row: ok, failed and refused', async () => {
    const { gw, ledger, usageLog } = setup();
    ledger('u').grant(100, 'g');
    const free = defaultConfig().plans[0]!;
    const ok = await gw.run({
      userId: 'u',
      plan: free,
      role: 'director-plan',
      modelId: 'mock-fast',
      request: req,
      maxCredits: 10,
      workCredits: 3,
      key: 'k1',
    });
    expect(ok.credits).toBeGreaterThanOrEqual(3);
    await expect(
      gw.run({
        userId: 'u',
        plan: free,
        role: 'director-plan',
        modelId: 'mock-best',
        request: req,
        maxCredits: 10,
        key: 'k2',
      }),
    ).rejects.toMatchObject({ code: 'model-plan' });
    const rows = usageLog.list('u');
    expect(rows.map((r) => r.outcome)).toEqual(['ok', 'refused']);
    expect(rows[0]).toMatchObject({
      modelId: 'mock-fast',
      role: 'director-plan',
      credits: ok.credits,
    });
    expect(rows[0]!.ms).toBeGreaterThanOrEqual(0);
  });

  it('[P2R1-016] gateway: refund on failure, refused bad output, shortage, limit hit', async () => {
    const plan = defaultConfig().plans[0]!;
    const run = (gw: ReturnType<typeof setup>['gw'], key: string, extra = {}) =>
      gw.run({
        userId: 'u',
        plan,
        role: 'director-plan',
        modelId: 'mock-fast',
        request: req,
        maxCredits: 20,
        key,
        ...extra,
      });
    const failing = setup({ failure: 'error' });
    failing.ledger('u').grant(50, 'g');
    await expect(run(failing.gw, 'a')).rejects.toMatchObject({
      code: 'provider-error',
    });
    expect(failing.ledger('u').balance()).toBe(50);
    expect(failing.usageLog.list('u')[0]!.outcome).toBe('failed');
    const bad = setup({ failure: 'bad-json' });
    bad.ledger('u').grant(50, 'g');
    await expect(
      run(bad.gw, 'b', {
        accept: (r: { text?: string }) => {
          try {
            JSON.parse(r.text ?? '');
            return null;
          } catch {
            return 'The plan could not be read.';
          }
        },
      }),
    ).rejects.toMatchObject({ code: 'bad-output' });
    expect(bad.ledger('u').balance()).toBe(50);
    const poor = setup();
    poor.ledger('u').grant(5, 'g');
    await expect(run(poor.gw, 'c')).rejects.toMatchObject({
      code: 'shortage',
      detail: { need: 20, have: 5 },
    });
    expect(poor.ledger('u').balance()).toBe(5);
    const limited = setup();
    limited.ledger('u').grant(500, 'g');
    await expect(
      run(limited.gw, 'd', { action: 'project' }),
    ).resolves.toBeTruthy();
    const capped = setup();
    capped.ledger('u').grant(500, 'g');
    await expect(run(capped.gw, 'e', { maxCredits: 70 })).rejects.toMatchObject(
      { code: 'budget-day' },
    );
  });
});
