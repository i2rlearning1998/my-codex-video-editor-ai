// P2-R2 Part A: the gateway server's HTTP API (P2B-01, P2B-02, P2B-04, P2B-07)
// and its security pass (P2B-36), on a memory store with local auth.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signLocalToken } from '../../server/auth';
import {
  fakeBase,
  startFakeProviders,
  type FakeProviders,
} from '../fakes/providers';
import { SECRET, startServer, type Started } from './helpers';
import { defaultConfig } from '../../src/platform-config';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';
const req = { messages: [{ role: 'user', content: 'Eratosthenes' }] };

let s: Started;
let fake: FakeProviders;
beforeAll(async () => {
  fake = await startFakeProviders();
  s = await startServer({
    ANTHROPIC_API_KEY: fake.key,
    SERVER_ORIGINS: 'http://127.0.0.1:4173',
  });
  // The owner points Anthropic at the fake server through the config (Admin later).
  const c = defaultConfig();
  c.providers.find((p) => p.id === 'anthropic')!.baseUrl = fakeBase(
    fake.url,
  ).anthropic;
  const admin = s.token('admin-0000', { app_metadata: { role: 'admin' } });
  const r = await s.api('/v1/config', {
    token: admin,
    body: { config: c, note: 'fake anthropic', publish: true },
  });
  expect(r.status).toBe(200);
});
afterAll(async () => {
  await s.close();
  await fake.close();
});

describe('P2-R2 gateway server', () => {
  it('[P2R2-001] the API: health, live config, me, models for the plan, estimate, reserve, call, settle, balance, ledger', async () => {
    expect((await s.api('/v1/health')).body).toEqual({ ok: true, api: 'v1' });
    const cfg = await s.api('/v1/config');
    expect(cfg.body.version).toBe(1);
    expect(cfg.text).not.toContain(fake.key);
    const t = s.token(A);
    const me = await s.api('/v1/me', { token: t });
    expect(me.body).toMatchObject({ plan: 'free', balance: 60 });
    const models = (await s.api('/v1/models', { token: t })).body.models as {
      id: string;
      connected: boolean;
    }[];
    expect(models.find((m) => m.id === 'claude-balanced')).toMatchObject({
      connected: true,
    });
    expect(models.find((m) => m.id === 'openai-balanced')).toMatchObject({
      connected: false,
    });
    expect(models.some((m) => m.id === 'claude-best')).toBe(false); // not on Free
    const est = await s.api('/v1/estimate', {
      token: t,
      body: {
        modelId: 'claude-balanced',
        briefChars: 400,
        methods: ['library', 'motion-graphics', 'library'],
      },
    });
    expect(est.body.max).toBeGreaterThan(est.body.min);
    const r = await s.api('/v1/reserve', {
      token: t,
      body: {
        key: 'build-1',
        role: 'write',
        modelId: 'claude-balanced',
        maxCredits: est.body.max,
        tools: [{ id: 'library', maxCredits: 10 }],
      },
    });
    expect(r.status).toBe(200);
    expect((await s.api('/v1/balance', { token: t })).body).toEqual({
      balance: 60 - est.body.max,
      held: est.body.max,
    });
    const call = await s.api('/v1/call', {
      token: t,
      body: {
        jobId: r.body.jobId,
        role: 'write',
        modelId: 'claude-balanced',
        request: req,
      },
    });
    expect(call.body.result.text).toBe('echo: Eratosthenes');
    const settled = await s.api('/v1/settle', {
      token: t,
      body: { jobId: r.body.jobId, workCredits: 4 },
    });
    expect(settled.body.credits).toBeGreaterThanOrEqual(4);
    expect(settled.body.credits + settled.body.refunded).toBe(est.body.max);
    expect((await s.api('/v1/balance', { token: t })).body.balance).toBe(
      60 - settled.body.credits,
    );
    const ledger = (await s.api('/v1/ledger', { token: t })).body.rows as {
      type: string;
    }[];
    expect(ledger.map((x) => x.type)).toEqual([
      'grant',
      'reserve',
      'settle',
      'refund',
    ]);
    // The store has the rows (they outlive the process).
    expect((await s.store.ledger(A)).length).toBe(4);
  });

  it('[P2R2-002] [P2R2-037] no token, a bad signature, a tampered or expired token are refused with one sentence', async () => {
    const plain = (await s.api('/v1/me')).body.error;
    expect(plain).toMatchObject({
      code: 'auth',
      message: 'Please log in first.',
    });
    const good = s.token(A);
    const [h, p] = good.split('.');
    const tampered = `${h}.${Buffer.from(JSON.stringify({ sub: B, exp: 9e9 })).toString('base64url')}.${good.split('.')[2]}`;
    const forged = signLocalToken('another-secret-of-enough-length-000', {
      sub: A,
    });
    const expired = signLocalToken(SECRET, {
      sub: A,
      exp: Math.floor(Date.now() / 1000) - 5,
    });
    const none = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${p}.x`;
    for (const tok of [tampered, forged, expired, none, 'abc.def']) {
      const r = await s.api('/v1/me', { token: tok });
      expect(r.status).toBe(401);
      expect(r.body.error.message).toMatch(/log in|expired|not valid/i);
    }
    expect((await s.api('/v1/me', { token: expired })).body.error.message).toBe(
      'Your sign-in has expired. Please log in again.',
    );
  });

  it('[P2R2-004] [P2R2-037] limits on the server: parallel reserves never overspend, a replayed key reserves once, plan, tools, rate', async () => {
    const t = s.token(B);
    await s.api('/v1/me', { token: t });
    // Ten parallel holds of 25 credits on a 60-credit balance: exactly two win.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        s.api('/v1/reserve', {
          token: t,
          body: {
            key: `p-${i}`,
            role: 'write',
            modelId: 'mock-balanced',
            maxCredits: 25,
          },
        }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(
      results
        .filter((r) => r.status === 402)
        .every((r) => r.body.error.code === 'shortage'),
    ).toBe(true);
    expect((await s.api('/v1/balance', { token: t })).body).toEqual({
      balance: 10,
      held: 50,
    });
    // Replaying a key returns the same hold.
    const ok = results.find((r) => r.status === 200)!;
    const again = await s.api('/v1/reserve', {
      token: t,
      body: {
        key: results.indexOf(ok) === 0 ? 'p-0' : `p-${results.indexOf(ok)}`,
        role: 'write',
        modelId: 'mock-balanced',
        maxCredits: 25,
      },
    });
    expect(again.body.jobId).toBe(ok.body.jobId);
    expect((await s.api('/v1/balance', { token: t })).body.balance).toBe(10);
    // Plan, tool and connection rules.
    expect(
      (
        await s.api('/v1/reserve', {
          token: t,
          body: {
            key: 'x1',
            role: 'write',
            modelId: 'mock-best',
            maxCredits: 1,
          },
        })
      ).body.error.code,
    ).toBe('model-plan');
    expect(
      (
        await s.api('/v1/reserve', {
          token: t,
          body: {
            key: 'x2',
            role: 'write',
            modelId: 'mock-balanced',
            maxCredits: 1,
            tools: [{ id: 'ai-video', maxCredits: 1 }],
          },
        })
      ).body.error.code,
    ).toBe('tool-plan');
    const nc = await s.api('/v1/reserve', {
      token: t,
      body: { key: 'x3', role: 'write', modelId: 'gemini-fast', maxCredits: 1 },
    });
    expect(nc.status).toBe(503);
    expect(nc.body.error).toMatchObject({
      code: 'not-connected',
      message: 'Google Gemini is not connected yet.',
    });
    // Settling twice changes nothing.
    await s.api('/v1/settle', {
      token: t,
      body: { jobId: ok.body.jobId, fail: true },
    });
    expect(
      (
        await s.api('/v1/settle', {
          token: t,
          body: { jobId: ok.body.jobId, fail: true },
        })
      ).status,
    ).toBe(404);
    expect((await s.api('/v1/balance', { token: t })).body.balance).toBe(35);
  });

  it('[P2R2-007] [P2R2-037] a provider failure refunds in full, says one sentence, and the key appears nowhere', async () => {
    const t = s.token('cccccccc-0000-0000-0000-000000000003');
    for (const mode of ['401', '500', 'malformed'] as const) {
      fake.mode(mode);
      const r = await s.api('/v1/run', {
        token: t,
        body: {
          key: `run-${mode}`,
          role: 'write',
          modelId: 'claude-balanced',
          maxCredits: 5,
          request: req,
        },
      });
      expect(r.status).toBeGreaterThanOrEqual(500);
      expect(r.text).not.toContain(fake.key);
      expect(r.body.error.message).toMatch(/\.$/);
    }
    fake.mode('ok');
    expect((await s.api('/v1/balance', { token: t })).body.balance).toBe(60);
    expect(s.logs.join('\n')).not.toContain(fake.key);
    expect(s.logs.join('\n')).not.toContain(SECRET);
  });

  it('[P2R2-037] security: oversized bodies, bad numbers, CORS only for set origins, security headers, admin-only config writes', async () => {
    const t = s.token(A);
    const big = await s.api('/v1/estimate', {
      token: t,
      body: JSON.stringify({ x: 'a'.repeat(300_000) }),
    });
    expect(big.status).toBe(413);
    for (const maxCredits of [-5, 1.5, 1e12, 'ten'])
      expect(
        (
          await s.api('/v1/reserve', {
            token: t,
            body: {
              key: 'n1',
              role: 'write',
              modelId: 'mock-balanced',
              maxCredits,
            },
          })
        ).status,
      ).toBe(400);
    expect(
      (await s.api('/v1/reserve', { token: t, body: '{not json' })).status,
    ).toBe(400);
    const allowed = await s.api('/v1/health', {
      headers: { origin: 'http://127.0.0.1:4173' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'http://127.0.0.1:4173',
    );
    const other = await s.api('/v1/health', {
      headers: { origin: 'https://evil.example' },
    });
    expect(other.status).toBe(403);
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    for (const h of [
      'x-content-type-options',
      'content-security-policy',
      'x-frame-options',
      'referrer-policy',
    ])
      expect(allowed.headers.get(h)).toBeTruthy();
    expect(allowed.headers.get('cache-control')).toBe('no-store');
    const noAdmin = await s.api('/v1/config', {
      token: t,
      body: { config: defaultConfig(), publish: true },
    });
    expect(noAdmin.status).toBe(403);
    const admin = s.token('admin-0000', { app_metadata: { role: 'admin' } });
    const broken = await s.api('/v1/config', {
      token: admin,
      body: { config: { nope: 1 } },
    });
    expect(broken.status).toBe(400);
    expect(broken.body.error.message).toMatch(/^The config was refused/);
  });
});
