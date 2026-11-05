import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPaymentGateways } from '../../server/payments';
import { createPaymentService } from '../../server/payments/service';
import { fileStore } from '../../server/store';
import { defaultConfig } from '../../src/platform-config';
import type { PaymentEvent, P3AdminSettings } from '../../src/contracts/p3';
import { fakePayments } from '../fakes/payments';
export const p3Settings: P3AdminSettings = {
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
const time = Date.parse('2026-11-05T10:00:00.000Z'),
  t = time / 1000;
for (const provider of ['stripe', 'razorpay'] as const)
  describe(provider, () => {
    it(`[P3E-050] ${provider} hosted checkout and raw signatures reject wrong secret, tamper, stale and malformed`, async () => {
      const fake = await fakePayments(provider);
      try {
        const env =
          provider === 'stripe'
            ? {
                STRIPE_SECRET_KEY: fake.secret,
                STRIPE_WEBHOOK_SECRET: fake.secret,
              }
            : {
                RAZORPAY_KEY_ID: 'test-id',
                RAZORPAY_KEY_SECRET: fake.secret,
                RAZORPAY_WEBHOOK_SECRET: fake.secret,
              };
        const gateway = createPaymentGateways(env, {
          replayWindowSeconds: () => 60,
          bases: { [provider]: fake.url },
          now: () => time,
        })[provider];
        const metadata = { userId: 'u', itemId: 'pack', kind: 'topup' };
        const raw = JSON.stringify(
          provider === 'stripe'
            ? {
                id: 'evt-1',
                type: 'checkout.session.completed',
                created: t,
                data: {
                  object: {
                    id: 'cs-1',
                    payment_intent: 'pay-1',
                    payment_status: 'paid',
                    amount_total: 100,
                    currency: 'usd',
                    metadata,
                  },
                },
              }
            : {
                event: 'payment.captured',
                created_at: t,
                payload: {
                  payment: {
                    entity: {
                      id: 'pay-1',
                      amount: 100,
                      currency: 'USD',
                      notes: metadata,
                    },
                  },
                },
              },
        );
        const headers = fake.headers(raw, t);
        expect(
          gateway.verifyWebhook(raw, headers, new Date(time)),
        ).toMatchObject({
          provider,
          paymentId: 'pay-1',
          userId: 'u',
          amount: { amountMinor: 100, currency: 'USD' },
        });
        expect(() => gateway.verifyWebhook(raw + ' ', headers)).toThrow(
          expect.objectContaining({ reason: 'bad-signature' }),
        );
        expect(() => gateway.verifyWebhook(raw, {}, new Date(time))).toThrow(
          expect.objectContaining({ reason: 'bad-signature' }),
        );
        expect(() =>
          gateway.verifyWebhook(raw, headers, new Date(time + 61000)),
        ).toThrow(expect.objectContaining({ reason: 'stale' }));
        expect(() =>
          gateway.verifyWebhook('{', fake.headers('{', t), new Date(time)),
        ).toThrow(expect.objectContaining({ reason: 'malformed' }));
        const wrong = createPaymentGateways(
          {
            ...env,
            [provider === 'stripe'
              ? 'STRIPE_WEBHOOK_SECRET'
              : 'RAZORPAY_WEBHOOK_SECRET']: 'different',
          },
          { replayWindowSeconds: () => 60 },
        )[provider];
        expect(() => wrong.verifyWebhook(raw, headers, new Date(time))).toThrow(
          expect.objectContaining({ reason: 'bad-signature' }),
        );
        const checkout = await gateway.createCheckout({
          userId: 'u',
          kind: 'topup',
          itemId: 'pack',
          price: { currency: 'USD', amountMinor: 100 },
          idempotencyKey: 'key',
          returnUrl: 'https://editor.example/credits',
        });
        expect(checkout.url).toMatch(/^https:/);
        expect(fake.requests).toHaveLength(1);
        expect(fake.requests[0]!.authorization).not.toBe('');
        expect(JSON.stringify(checkout)).not.toContain(fake.secret);
        const absent = createPaymentGateways(
          {},
          { replayWindowSeconds: () => 60, bases: { [provider]: fake.url } },
        )[provider];
        expect(absent.connected()).toBe(false);
        await expect(
          absent.createCheckout({
            userId: 'u',
            kind: 'topup',
            itemId: 'pack',
            price: { currency: 'USD', amountMinor: 100 },
            idempotencyKey: 'key',
            returnUrl: 'https://editor.example',
          }),
        ).rejects.toThrow();
        expect(fake.requests).toHaveLength(1);
      } finally {
        await fake.close();
      }
    });
  });
it('[P3E-051] atomic credits survive restart, ten concurrent replays, mismatch, unknown user, monthly grant and refund shortfall', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'p3-pay-')),
    file = path.join(dir, 'data.json');
  try {
    const store = fileStore(file),
      config = defaultConfig();
    config.topUps = [{ id: 'pack', credits: 10, price: { usd: 1, inr: 80 } }];
    config.plans[0]!.price = { usd: 1, inr: 80 };
    config.plans[0]!.monthlyCredits = 10;
    await store.saveProfile({
      id: 'u',
      email: 'u@example.test',
      plan: config.plans[0]!.id,
      locale: 'en',
      brandKit: {},
      createdAt: new Date(time).toISOString(),
    });
    const make = (s = store) =>
      createPaymentService({
        store: s,
        config: async () => config,
        settings: () => p3Settings,
        gateways: createPaymentGateways({}),
        returnOrigins: [],
        now: () => time,
      });
    const event: PaymentEvent = {
      provider: 'stripe',
      eventId: 'evt',
      type: 'payment.succeeded',
      paymentId: 'pay',
      userId: 'u',
      kind: 'topup',
      itemId: 'pack',
      amount: { currency: 'USD', amountMinor: 100 },
      occurredAt: new Date(time).toISOString(),
    };
    const result = await Promise.all(
      Array.from({ length: 10 }, () => make().apply(event)),
    );
    expect(result.filter((r) => r.applied)).toHaveLength(1);
    expect((await store.ledger('u')).reduce((s, r) => s + r.delta, 0)).toBe(10);
    expect(await make(fileStore(file)).apply(event)).toMatchObject({
      duplicate: true,
    });
    await expect(
      make().apply({
        ...event,
        eventId: 'bad',
        amount: { currency: 'USD', amountMinor: 99 },
      }),
    ).rejects.toMatchObject({ reason: 'amount-mismatch' });
    await expect(
      make().apply({ ...event, eventId: 'unknown', userId: 'missing' }),
    ).rejects.toMatchObject({ reason: 'unknown-user' });
    await store.appendLedger('u', [
      {
        id: 'spent',
        key: 'spent',
        type: 'reserve',
        delta: -7,
        at: event.occurredAt,
        note: '',
      },
    ]);
    const refund = {
      ...event,
      eventId: 'refund',
      type: 'refund.succeeded' as const,
    };
    expect(await make().apply(refund, true)).toMatchObject({
      creditsDelta: -3,
    });
    expect((await store.payments())[1]).toMatchObject({ shortfall: 7 });
    expect(await make().apply(refund, true)).toMatchObject({ duplicate: true });
    const next = { ...event, eventId: 'next', paymentId: 'pay2' };
    await make().apply(next);
    expect(
      await make().apply(
        { ...next, eventId: 'norevoke', type: 'refund.succeeded' },
        false,
      ),
    ).toMatchObject({ creditsDelta: 0 });
    const plan = config.plans[0]!;
    await store.appendLedger('u', [
      {
        id: 'monthly',
        key: `grant:${plan.id}:2026-11`,
        type: 'grant',
        delta: 10,
        at: event.occurredAt,
        note: '',
      },
    ]);
    expect(
      await make().apply({
        ...event,
        eventId: 'renew',
        paymentId: 'sub-pay',
        kind: 'subscription',
        itemId: plan.id,
        type: 'subscription.renewed',
        periodStart: event.occurredAt,
      } as PaymentEvent),
    ).toMatchObject({ creditsDelta: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
