import { expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createServerApp, listen } from '../../server/app';
import { AuthError } from '../../server/auth';
import { memoryStore } from '../../server/store';
import { defaultConfig } from '../../src/platform-config';
import { verifyAuditChain } from '../../server/admin/audit';
import { ownsAdminPath } from '../../server/admin/routes';
import { fakePayments } from '../fakes/payments';
import type { P3AdminSettings } from '../../src/contracts/p3';
const settings: P3AdminSettings = {
  chat: { enabled: true, maxMessagesPerDay: 2, maxHistoryTokens: 100 },
  vision: { enabled: true, creditsPerImage: 2, maxImagesPerMessage: 2 },
  memory: {
    keepRecent: 2,
    summariseAboveTokens: 100,
    maxFacts: 5,
    maxStyleRules: 5,
  },
  entitlementTtlSeconds: 60,
  webhookReplayWindowSeconds: 60,
};
it('[P3E-053] every admin route gates non-admin; atomic changes audit once, refund uses gateway, keys fall through and logs omit secrets', async () => {
  const store = memoryStore(),
    config = defaultConfig(),
    fake = await fakePayments('stripe'),
    token = randomBytes(24).toString('hex'),
    userToken = randomBytes(24).toString('hex'),
    logs: string[] = [],
    bodies: string[] = [];
  const now = () => Date.parse('2026-11-05T10:00:00.000Z');
  config.payments = [
    {
      id: 'stripe',
      name: 'Stripe',
      kind: 'stripe',
      enabled: true,
      currencies: ['USD'],
      countries: [],
    },
  ];
  config.topUps = [{ id: 'pack', credits: 10, price: { usd: 1, inr: 80 } }];
  await store.saveConfigVersion({
    version: 1,
    config,
    note: 'fake',
    savedAt: new Date(now()).toISOString(),
  });
  await store.setLiveConfig(1);
  await store.saveProfile({
    id: 'u',
    email: 'u@example.test',
    plan: config.plans[0]!.id,
    locale: 'en',
    brandKit: {},
    createdAt: new Date(now()).toISOString(),
  });
  const app = createServerApp({
    store,
    env: {
      STRIPE_SECRET_KEY: fake.secret,
      STRIPE_WEBHOOK_SECRET: fake.secret,
      SERVER_ORIGINS: 'https://editor.example',
    },
    now,
    log: (l) => logs.push(l),
    p3Settings: () => settings,
    paymentOptions: { bases: { stripe: fake.url } },
    authenticate: async (h) => {
      if (h === `Bearer ${token}`)
        return { userId: 'admin', email: 'admin@example.test', admin: true };
      if (h === `Bearer ${userToken}`)
        return { userId: 'u', email: 'u@example.test', admin: false };
      throw new AuthError('Please log in first.');
    },
  });
  const server = await listen(app.handler, 0),
    address = server.address();
  if (!address || typeof address === 'string') throw new Error();
  const base = `http://127.0.0.1:${address.port}`;
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    credential = token,
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        authorization: `Bearer ${credential}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await r.text();
    bodies.push(text);
    return {
      status: r.status,
      value: text ? (JSON.parse(text) as Record<string, unknown>) : null,
    };
  }
  try {
    const routes: [string, string][] = [
      ['users', 'GET'],
      ['users/u', 'GET'],
      ['users/u/credits', 'POST'],
      ['users/u/plan', 'POST'],
      ['users/u/suspension', 'POST'],
      ['users/u/flags', 'POST'],
      ['refunds', 'POST'],
      ['flags', 'GET'],
      ['audit', 'GET'],
      ['emergency', 'GET'],
      ['emergency', 'POST'],
      ['metrics', 'GET'],
    ];
    for (const [path, method] of routes)
      expect(
        (
          await request(
            '/v1/admin/' + path,
            method,
            method === 'POST' ? {} : undefined,
            userToken,
          )
        ).status,
      ).toBe(403);
    expect(await store.audit()).toHaveLength(routes.length);
    expect(ownsAdminPath('/v1/admin/keys')).toBe(false);
    // The path falls through Part 1's routes. Since the merge (D-398) Part 2's
    // key vault answers it, so it is no longer a 404 (the vault list is admin only).
    expect((await request('/v1/admin/keys')).status).toBe(200);
    const checkout = {
      provider: 'stripe',
      kind: 'topup',
      itemId: 'pack',
      currency: 'USD',
      idempotencyKey: 'checkout-1',
      returnUrl: 'https://editor.example/credits',
    };
    expect(
      (await request('/v1/payments/checkout', 'POST', checkout, userToken))
        .status,
    ).toBe(200);
    expect(
      (await request('/v1/payments/checkout', 'POST', checkout, userToken))
        .status,
    ).toBe(200);
    expect(
      fake.requests.filter((r) => r.path === '/v1/checkout/sessions'),
    ).toHaveLength(1);
    expect(
      (
        await request(
          '/v1/payments/checkout',
          'POST',
          { ...checkout, price: 1 },
          userToken,
        )
      ).status,
    ).toBe(400);
    const adjust = {
      delta: 20,
      reason: 'Support credit',
      requestId: 'adjust-1',
    };
    expect(
      (await request('/v1/admin/users/u/credits', 'POST', adjust)).status,
    ).toBe(204);
    expect(
      (await request('/v1/admin/users/u/credits', 'POST', adjust)).status,
    ).toBe(204);
    expect((await store.ledger('u')).reduce((s, r) => s + r.delta, 0)).toBe(20);
    expect(await store.audit()).toHaveLength(routes.length + 1);
    expect(
      (
        await request('/v1/admin/users/u/suspension', 'POST', {
          suspended: true,
          reason: 'Support',
        })
      ).status,
    ).toBe(204);
    expect((await store.profile('u'))?.suspended).toBe(true);
    expect(
      (
        await request('/v1/admin/users/u/flags', 'POST', {
          flag: 'beta',
          on: true,
        })
      ).status,
    ).toBe(204);
    expect(await store.flags('u')).toEqual(['beta']);
    expect(
      (
        await request('/v1/admin/users/u/plan', 'POST', {
          planId: config.plans[0]!.id,
          reason: 'Support',
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await request('/v1/admin/emergency', 'POST', {
          aiOff: true,
          paymentsOff: false,
          signupsOff: false,
          message: { en: 'Maintenance' },
          reason: 'Test',
        })
      ).status,
    ).toBe(204);
    expect(
      (await request('/v1/admin/users?search=u%40example&flag=beta')).value
        ?.rows,
    ).toHaveLength(1);
    const raw = JSON.stringify({
      id: 'evt',
      type: 'checkout.session.completed',
      created: now() / 1000,
      data: {
        object: {
          id: 'cs',
          payment_intent: 'pay',
          payment_status: 'paid',
          amount_total: 100,
          currency: 'USD',
          metadata: { userId: 'u', itemId: 'pack', kind: 'topup' },
        },
      },
    });
    const webhook = await fetch(base + '/v1/payments/webhook/stripe', {
      method: 'POST',
      headers: fake.headers(raw, now() / 1000),
      body: raw,
    });
    bodies.push(await webhook.text());
    expect(webhook.status).toBe(200);
    expect(
      (await request('/v1/payments/me', 'GET', undefined, userToken)).value,
    ).toHaveLength(1);
    const refund = {
      paymentId: 'pay',
      amountMinor: null,
      reason: 'Support refund',
      revokeCredits: true,
      requestId: 'refund-1',
    };
    expect((await request('/v1/admin/refunds', 'POST', refund)).status).toBe(
      204,
    );
    expect((await request('/v1/admin/refunds', 'POST', refund)).status).toBe(
      204,
    );
    expect(fake.requests.filter((r) => r.path === '/v1/refunds')).toHaveLength(
      1,
    );
    expect(verifyAuditChain(await store.audit())).toBe(true);
    expect(
      (
        await request(
          '/v1/admin/metrics?from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z',
        )
      ).status,
    ).toBe(200); // no usage yet: real zeros (cost is recorded per call, P3I-005)
    for (const value of [...logs, ...bodies])
      for (const secret of [token, userToken, fake.secret])
        expect(value).not.toContain(secret);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    await fake.close();
  }
});
