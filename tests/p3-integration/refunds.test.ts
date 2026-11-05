// P3 integration (integrator): refunds revoke credits in proportion to the
// money refunded, never twice, and never more than the payment.
import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPaymentGateways } from '../../server/payments';
import { createPaymentService } from '../../server/payments/service';
import { fileStore } from '../../server/store';
import { defaultConfig } from '../../src/platform-config';
import type { P3AdminSettings, PaymentEvent } from '../../src/contracts/p3';

const p3Settings: P3AdminSettings = {
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

const time = Date.parse('2026-11-05T10:00:00.000Z');

it('[P3I-003] partial refunds revoke credits in proportion, add up to the grant, and together cannot exceed the payment', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'p3-refund-'));
  try {
    const store = fileStore(path.join(dir, 'data.json'));
    const config = defaultConfig();
    config.topUps = [{ id: 'big', credits: 100, price: { usd: 10, inr: 800 } }];
    await store.saveProfile({
      id: 'u',
      email: 'u@example.test',
      plan: config.plans[0]!.id,
      locale: 'en',
      brandKit: {},
      createdAt: new Date(time).toISOString(),
    });
    const service = () =>
      createPaymentService({
        store,
        config: async () => config,
        settings: () => p3Settings,
        gateways: createPaymentGateways({}),
        returnOrigins: [],
        now: () => time,
      });
    const balance = async () =>
      (await store.ledger('u')).reduce((s, r) => s + r.delta, 0);
    const pay: PaymentEvent = {
      provider: 'stripe',
      eventId: 'pay-evt',
      type: 'payment.succeeded',
      paymentId: 'p1',
      userId: 'u',
      kind: 'topup',
      itemId: 'big',
      amount: { currency: 'USD', amountMinor: 1000 },
      occurredAt: new Date(time).toISOString(),
    };
    const refund = (eventId: string, amountMinor: number): PaymentEvent => ({
      ...pay,
      eventId,
      type: 'refund.succeeded',
      amount: { currency: 'USD', amountMinor },
    });
    await service().apply(pay);
    expect(await balance()).toBe(100);
    // A quarter of the money back: a quarter of the credits.
    expect(await service().apply(refund('r1', 250), true)).toMatchObject({
      creditsDelta: -25,
    });
    expect(await balance()).toBe(75);
    // The same event again changes nothing.
    expect(await service().apply(refund('r1', 250), true)).toMatchObject({
      duplicate: true,
    });
    // Without "revoke credits" the money goes back and the credits stay.
    expect(await service().apply(refund('r2', 250), false)).toMatchObject({
      creditsDelta: 0,
    });
    expect(await balance()).toBe(75);
    // The rest of the money: only the rest of the credits not yet taken.
    expect(await service().apply(refund('r3', 500), true)).toMatchObject({
      creditsDelta: -50,
    });
    expect(await balance()).toBe(25);
    // The payment is fully refunded; one more cent is refused.
    await expect(service().apply(refund('r4', 1), true)).rejects.toMatchObject({
      reason: 'amount-mismatch',
    });
    expect(await balance()).toBe(25);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
