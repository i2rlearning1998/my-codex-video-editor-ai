// P4 Part 4 (security round): attacks against the gateway server, run in
// process. These prove the server refuses what it should; they are NOT a
// security audit and do not make the product "unhackable".
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig, p3Settings } from '../../src/platform-config';
import { memoryStore } from '../../server/store';
import { startServer, SECRET, type Started } from '../server/helpers';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
let s: Started;

async function publish(
  server: Started,
  change: (c: ReturnType<typeof defaultConfig>) => void,
) {
  const c = defaultConfig();
  change(c);
  const admin = server.token('admin-0000', { app_metadata: { role: 'admin' } });
  const r = await server.api('/v1/config', {
    token: admin,
    body: { config: c, note: 'attack test', publish: true },
  });
  expect(r.status).toBe(200);
}

beforeAll(async () => {
  s = await startServer({
    SERVER_ORIGINS: 'http://127.0.0.1:4173',
    ENTITLEMENT_SECRET: 'entitlement-secret-for-the-attack-test',
  });
  await publish(s, (c) => {
    c.providers.find((p) => p.id === 'anthropic')!.baseUrl =
      'http://10.0.0.5:9000/private';
    // ROUND-A: small caps so the registry's refusals are reached quickly.
    for (const plan of c.plans) {
      plan.limits.projects = 2;
      plan.limits.videosPerProject = 2;
    }
    c.limitMessages.videos = { en: 'Owner: {n} videos per project.' };
  });
});
afterAll(() => s.close());

describe('[P4S-001] every signed-in route refuses a caller with no token', () => {
  const routes: [string, string][] = [
    ['GET', '/v1/me'],
    ['GET', '/v1/balance'],
    ['GET', '/v1/ledger'],
    ['GET', '/v1/usage'],
    ['GET', '/v1/models'],
    ['GET', '/v1/entitlements'],
    ['POST', '/v1/estimate'],
    ['POST', '/v1/reserve'],
    ['POST', '/v1/call'],
    ['POST', '/v1/settle'],
    ['POST', '/v1/run'],
    ['POST', '/v1/limits/check'],
    ['POST', '/v1/entitlements/check'],
    ['POST', '/v1/exports'],
    ['POST', '/v1/usage/report'],
    ['POST', '/v1/workspace/claim'],
    ['POST', '/v1/workspace/change'],
    ['POST', '/v1/workspace/sync'],
    ['POST', '/v1/plan'],
    ['POST', '/v1/topup'],
    ['POST', '/v1/config'],
    ['POST', '/v1/config/publish'],
    ['GET', '/v1/admin/users'],
    ['PUT', '/v1/admin/keys'],
  ];
  it('[P4S-001] no route answers a caller with no token', async () => {
    for (const [method, path] of routes) {
      const r = await s.api(path, {
        method,
        ...(method === 'GET' ? {} : { body: {} }),
      });
      // 401 (no token), or 404 where the user server has no such route at all.
      expect([401, 404], `${method} ${path} answered ${r.status}`).toContain(
        r.status,
      );
    }
  });
});

describe('[P4S-002] forged, expired and wrong tokens are refused', () => {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  it('[P4S-002] alg none, wrong secret, tampered body, expired, anonymous role', async () => {
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: A, aud: 'authenticated', exp: now + 3600 })}.`;
    const wrong = s.token(A).replace(/\.[^.]+$/, '.AAAA');
    const good = s.token(A);
    const [h, , sig] = good.split('.');
    const tampered = `${h}.${b64({ sub: B, aud: 'authenticated', role: 'authenticated', exp: now + 3600 })}.${sig}`;
    const expired = s.token(A, { exp: now - 10 });
    const anon = s.token(A, { role: 'anon' });
    const otherSecret = (() => {
      const head = b64({ alg: 'HS256', typ: 'JWT' });
      const body = b64({
        sub: A,
        aud: 'authenticated',
        role: 'authenticated',
        exp: now + 3600,
      });
      const sig2 = createHmac('sha256', SECRET + 'x')
        .update(`${head}.${body}`)
        .digest('base64url');
      return `${head}.${body}.${sig2}`;
    })();
    for (const token of [none, wrong, tampered, expired, anon, otherSecret])
      expect((await s.api('/v1/me', { token })).status).toBe(401);
    expect((await s.api('/v1/me', { token: good })).status).toBe(200);
  });
  it('[P4S-002] a person cannot make themselves admin with their own claims', async () => {
    // user_metadata is the person's to edit; only app_metadata counts.
    const t = s.token(A, {
      user_metadata: { role: 'admin' },
      role: 'admin',
    } as never);
    expect(
      (
        await s.api('/v1/config', {
          token: t,
          body: { config: defaultConfig() },
        })
      ).status,
    ).toBe(403);
    const plain = s.token(A);
    expect(
      (
        await s.api('/v1/config', {
          token: plain,
          body: { config: defaultConfig() },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await s.api('/v1/config/publish', {
          token: plain,
          body: { version: 1 },
        })
      ).status,
    ).toBe(403);
  });
});

describe("[P4S-003] one person never reaches another person's data", () => {
  it('[P4S-003] a body naming another person changes nothing of theirs', async () => {
    await s.api('/v1/me', { token: s.token(B) });
    const before = (await s.api('/v1/balance', { token: s.token(B) })).body;
    await s.api('/v1/usage/report', {
      token: s.token(A),
      body: { userId: B, user_id: B, projects: 3, storageMb: 7 },
    });
    expect(await s.store.counter(B, 'projects')).toBe(0);
    expect(await s.store.counter(A, 'projects')).toBe(3);
    expect((await s.api('/v1/balance', { token: s.token(B) })).body).toEqual(
      before,
    );
  });
  it("[P4S-003] another person's job id is not found", async () => {
    const r = await s.api('/v1/settle', {
      token: s.token(B),
      body: { jobId: 'job-of-someone-else' },
    });
    expect(r.status).toBe(404);
  });
});

describe('[P4S-004] numbers and bodies that are not valid are refused', () => {
  let model = '';
  beforeAll(async () => {
    const list = (await s.api('/v1/models', { token: s.token(A) })).body
      .models as { id: string; connected: boolean }[];
    model = list.find((m) => m.connected)?.id ?? '';
    expect(model).not.toBe('');
  });
  const bad: unknown[] = [-1, 0, 1.5, 1e9, '10', null, [], {}];
  for (const v of bad)
    it(`[P4S-004] maxCredits ${JSON.stringify(v)}`, async () => {
      const r = await s.api('/v1/reserve', {
        token: s.token(A),
        body: { modelId: model, role: 'write', maxCredits: v, key: 'k1' },
      });
      expect(r.status).toBe(400);
    });
  it('[P4S-004] Infinity and huge exponents (1e999) are refused', async () => {
    const r = await s.api('/v1/reserve', {
      token: s.token(A),
      body: `{"modelId":"${model}","role":"write","maxCredits":1e999,"key":"k2"}`,
    });
    expect(r.status).toBe(400);
  });
  it('[P4S-004] a body that is too large, not JSON, or an array', async () => {
    expect(
      (
        await s.api('/v1/estimate', {
          token: s.token(A),
          body: 'x'.repeat(300_000),
        })
      ).status,
    ).toBe(413);
    expect(
      (await s.api('/v1/estimate', { token: s.token(A), body: '{nope' }))
        .status,
    ).toBe(400);
    expect(
      (await s.api('/v1/estimate', { token: s.token(A), body: '[1,2]' }))
        .status,
    ).toBe(400);
  });
  it('[P4S-004] __proto__ in a body does not change what the server does', async () => {
    const t = s.token(A);
    const r = await s.api('/v1/limits/check', {
      token: t,
      body: '{"action":"export","__proto__":{"admin":true,"plan":"studio"},"constructor":{"prototype":{"admin":true}}}',
    });
    expect([200, 403]).toContain(r.status);
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
    const config = await s.api('/v1/config', {
      token: t,
      body: '{"config":{},"__proto__":{"admin":true}}',
    });
    expect(config.status).toBe(403);
  });
});

describe('[RDA-002] the server decides the project and video limits', () => {
  it('[RDA-002] refuses one project or video more than the plan, ignores the browser, and re-checks a Restore', async () => {
    const t = s.token('cccccccc-0000-4000-8000-000000000003');
    const claim = (body: Record<string, unknown>) =>
      s.api('/v1/workspace/claim', { token: t, body });
    expect((await claim({ kind: 'project', id: 'pr-a' })).status).toBe(200);
    expect((await claim({ kind: 'project', id: 'pr-b' })).status).toBe(200);
    // The same id again is not a new project.
    expect((await claim({ kind: 'project', id: 'pr-a' })).status).toBe(200);
    const third = await claim({ kind: 'project', id: 'pr-c' });
    expect(third.status).toBe(403);
    expect((third.body as { error: { code: string } }).error.code).toBe(
      'limit-projects',
    );
    // A video of an unknown project cannot sneak a third project in.
    expect(
      (await claim({ kind: 'video', id: 'v-x', projectId: 'pr-z' })).status,
    ).toBe(403);
    expect(
      (await claim({ kind: 'video', id: 'v-1', projectId: 'pr-a' })).status,
    ).toBe(200);
    expect(
      (await claim({ kind: 'video', id: 'v-2', projectId: 'pr-a' })).status,
    ).toBe(200);
    const v3 = await claim({ kind: 'video', id: 'v-3', projectId: 'pr-a' });
    expect(v3.status).toBe(403);
    expect((v3.body as { error: { message: string } }).error.message).toBe(
      'Owner: 2 videos per project.',
    );
    // The browser's own count and a sync cannot lower what the server holds.
    await s.api('/v1/usage/report', { token: t, body: { projects: 0 } });
    await s.api('/v1/workspace/sync', {
      token: t,
      body: { projects: [{ id: 'pr-a', trashed: true, videos: [] }] },
    });
    expect((await claim({ kind: 'project', id: 'pr-c' })).status).toBe(403);
    // Trash frees a place; a Restore past the plan is refused.
    const change = (body: Record<string, unknown>) =>
      s.api('/v1/workspace/change', { token: t, body });
    expect(
      (await change({ kind: 'project', id: 'pr-b', to: 'trash' })).status,
    ).toBe(200);
    expect((await claim({ kind: 'project', id: 'pr-c' })).status).toBe(200);
    expect(
      (await change({ kind: 'project', id: 'pr-b', to: 'restore' })).status,
    ).toBe(403);
    // Bad input is refused plainly.
    expect((await claim({ kind: 'thing', id: 'x' })).status).toBe(400);
    expect((await claim({ kind: 'project', id: '../x' })).status).toBe(400);
  });
});

describe("[P4S-006] the public settings hide the owner's provider address and key name", () => {
  it('[P4S-006] a visitor and a person see no address; the owner sees it all', async () => {
    const visitor = await s.api('/v1/config');
    const person = await s.api('/v1/config', { token: s.token(A) });
    for (const r of [visitor, person]) {
      const p = r.body.config.providers.find(
        (x: { id: string }) => x.id === 'anthropic',
      );
      expect(p.baseUrl).toBeUndefined();
      expect(p.keyRef).toBe('SERVER_SECRET');
      expect(r.text).not.toContain('10.0.0.5');
      expect(r.text).not.toContain('ANTHROPIC_API_KEY');
    }
    const owner = await s.api('/v1/config', {
      token: s.token('admin-0000', { app_metadata: { role: 'admin' } }),
    });
    const p = owner.body.config.providers.find(
      (x: { id: string }) => x.id === 'anthropic',
    );
    expect(p.baseUrl).toBe('http://10.0.0.5:9000/private');
    expect(p.keyRef).toBe('ANTHROPIC_API_KEY');
  });
});

describe('[P4S-007] the offline test payment never runs on a live server', () => {
  it('[P4S-007] topup and plan are refused when AUTH_MODE is supabase', async () => {
    const live = await startServer({ AUTH_MODE: 'supabase' });
    try {
      const t = live.token(A);
      const top = await live.api('/v1/topup', {
        token: t,
        body: { packId: 'pack-small', currency: 'INR', paymentKey: 'p1' },
      });
      const plan = await live.api('/v1/plan', {
        token: t,
        body: { plan: 'pro', paymentKey: 'p2' },
      });
      expect(top.status).toBe(403);
      expect(plan.status).toBe(403);
      expect(top.body.error.code).toBe('hosted-checkout');
    } finally {
      await live.close();
    }
  });
});

describe('[P4S-008] limits on requests', () => {
  it('[P4S-008] too many requests from one address get 429', async () => {
    const t = await startServer({ SERVER_IP_PER_MINUTE: '5' });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 8; i++)
        codes.push((await t.api('/v1/health')).status);
      expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
      expect(codes.at(-1)).toBe(429);
    } finally {
      await t.close();
    }
  });
  it('[P4S-008] too many failed sign-ins lock that address for a minute, even for a good token', async () => {
    const t = await startServer({ SERVER_BAD_AUTH_PER_MINUTE: '3' });
    try {
      for (let i = 0; i < 5; i++)
        await t.api('/v1/me', { token: 'not-a-token' });
      const r = await t.api('/v1/me', { token: t.token(A) });
      expect(r.status).toBe(429);
    } finally {
      await t.close();
    }
  });
  it('[P4S-008] a site that is not allowed is refused and gets no CORS header', async () => {
    const r = await s.api('/v1/health', {
      headers: { origin: 'https://evil.example' },
    });
    expect(r.status).toBe(403);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    const ok = await s.api('/v1/health', {
      headers: { origin: 'http://127.0.0.1:4173' },
    });
    expect(ok.headers.get('access-control-allow-origin')).toBe(
      'http://127.0.0.1:4173',
    );
  });
  it('[P4S-008] every answer carries the security headers and never caches', async () => {
    const r = await s.api('/v1/health');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
  });
});

describe('[P4S-009] a payment message with no valid signature changes nothing', () => {
  it('[P4S-009] an unsigned or wrongly signed webhook is refused and no credit appears', async () => {
    const w = await startServer(
      {
        RAZORPAY_WEBHOOK_SECRET: 'whsec-test',
        STRIPE_WEBHOOK_SECRET: 'whsec-test',
      },
      memoryStore(),
      { p3Settings: () => p3Settings(defaultConfig()) },
    );
    try {
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: { id: 'pay_1', amount: 100000, notes: { userId: A } },
          },
        },
      });
      for (const provider of ['razorpay', 'stripe', 'paypal', 'nobody']) {
        const none = await w.api(`/v1/payments/webhook/${provider}`, { body });
        expect(none.status).toBeGreaterThanOrEqual(400);
        const wrong = await w.api(`/v1/payments/webhook/${provider}`, {
          body,
          headers: {
            'x-razorpay-signature': 'deadbeef',
            'stripe-signature': 't=1,v1=deadbeef',
          },
        });
        expect(wrong.status).toBeGreaterThanOrEqual(400);
      }
      expect(await w.store.payments()).toHaveLength(0);
    } finally {
      await w.close();
    }
  });
});
