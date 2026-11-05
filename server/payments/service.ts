import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  WebhookError,
  type PaymentEvent,
  type PaymentGateway,
  type PaymentProviderId,
  type P3AdminSettings,
} from '../../src/contracts/p3';
import type { PlatformConfig } from '../../src/platform-config';
import type { Store } from '../store';
import { canonicalJson } from '../entitlements';
const id = z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/);
const checkoutSchema = z
  .object({
    provider: z.enum(['stripe', 'razorpay', 'paypal']),
    kind: z.enum(['topup', 'subscription']),
    itemId: id,
    currency: z.enum(['INR', 'USD']),
    idempotencyKey: id,
    returnUrl: z.string().url(),
  })
  .strict();
export class PaymentHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface PaymentDeps {
  store: Store;
  config(): Promise<PlatformConfig>;
  settings(): P3AdminSettings;
  gateways: Record<PaymentProviderId, PaymentGateway>;
  returnOrigins: readonly string[];
  now?: () => number;
}
export function createPaymentService(d: PaymentDeps) {
  const now = d.now ?? Date.now;
  const quote = (
    c: PlatformConfig,
    kind: 'topup' | 'subscription',
    itemId: string,
    currency: 'INR' | 'USD',
  ) => {
    const item =
      kind === 'topup'
        ? c.topUps.find((p) => p.id === itemId)
        : c.plans.find((p) => p.id === itemId);
    if (!item)
      throw new PaymentHttpError(
        400,
        'item',
        'That payment item was not found.',
      );
    const price = Math.round(
      item.price[currency === 'INR' ? 'inr' : 'usd'] * 100,
    );
    if (!Number.isSafeInteger(price) || price <= 0)
      throw new PaymentHttpError(
        400,
        'price',
        'That payment item has no valid price.',
      );
    return {
      price,
      credits: 'credits' in item ? item.credits : item.monthlyCredits,
    };
  };
  return {
    async checkout(userId: string, body: unknown) {
      const req = checkoutSchema.parse(body),
        c = await d.config();
      if ((await d.store.emergency()).paymentsOff)
        throw new PaymentHttpError(
          503,
          'payments-off',
          'Payments are temporarily paused.',
        );
      const user = await d.store.profile(userId);
      if (!user || user.suspended)
        throw new PaymentHttpError(
          403,
          'user',
          'This account cannot start a payment.',
        );
      if (
        !c.payments.some(
          (p) =>
            p.kind === req.provider &&
            p.enabled &&
            p.currencies.includes(req.currency),
        )
      )
        throw new PaymentHttpError(
          503,
          'provider',
          'That payment provider is not enabled.',
        );
      const u = new URL(req.returnUrl);
      if (!d.returnOrigins.includes(u.origin) || u.username || u.password)
        throw new PaymentHttpError(
          400,
          'return-url',
          'The checkout return address is not allowed.',
        );
      if (
        req.kind === 'subscription' &&
        c.plans.find((p) => p.id === req.itemId)?.period !== 'month'
      )
        throw new PaymentHttpError(
          400,
          'period',
          'Only configured monthly subscriptions are supported.',
        );
      const { price } = quote(c, req.kind, req.itemId, req.currency);
      if (!d.gateways[req.provider].connected())
        throw new PaymentHttpError(
          503,
          'not-connected',
          'That payment provider is not connected.',
        );
      const key = `checkout:${req.provider}:${userId}:${req.idempotencyKey}`;
      const fingerprint = canonicalJson({ ...req, userId, price });
      const claim = await d.store.claimOperation(key, fingerprint);
      if (!claim.claimed) {
        if (claim.operation.result) return claim.operation.result;
        throw new PaymentHttpError(
          409,
          'pending',
          'This checkout is pending reconciliation; do not create another payment.',
        );
      }
      // Durable claim precedes provider I/O. Ambiguous failures stay pending, never blindly retried.
      const session = await d.gateways[req.provider].createCheckout({
        userId,
        kind: req.kind,
        itemId: req.itemId,
        price: { currency: req.currency, amountMinor: price },
        idempotencyKey: createHash('sha256')
          .update(key)
          .digest('hex')
          .slice(0, 36),
        returnUrl: req.returnUrl,
      });
      await d.store.finishOperation(key, { ...session });
      return session;
    },
    async apply(event: PaymentEvent, revoke = false) {
      const window = d.settings().webhookReplayWindowSeconds;
      if (
        !Number.isFinite(window) ||
        window <= 0 ||
        !Number.isFinite(Date.parse(event.occurredAt)) ||
        Math.abs(now() - Date.parse(event.occurredAt)) > window * 1000
      )
        throw new WebhookError(
          'stale',
          'The payment notification is outside the allowed time window.',
        );
      const previous = await d.store.payments();
      if (
        previous.some(
          (p) =>
            p.event.provider === event.provider &&
            p.event.eventId === event.eventId,
        )
      )
        return { applied: false, duplicate: true, creditsDelta: 0 };
      let e = event;
      if (e.type === 'refund.succeeded') {
        const original = previous.find(
          (p) =>
            p.event.provider === e.provider &&
            p.event.paymentId === e.paymentId &&
            (p.event.type === 'payment.succeeded' ||
              p.event.type === 'subscription.renewed'),
        );
        if (!original)
          throw new WebhookError(
            'malformed',
            'The refunded payment was not found.',
          );
        if (
          e.amount.currency !== original.event.amount.currency ||
          e.amount.amountMinor > original.event.amount.amountMinor
        )
          throw new WebhookError(
            'amount-mismatch',
            'The refund amount does not match the payment.',
          );
        e = {
          ...e,
          userId: original.event.userId,
          itemId: original.event.itemId,
          kind: original.event.kind,
        };
      }
      if (!(await d.store.profile(e.userId)))
        throw new WebhookError(
          'unknown-user',
          'The payment account was not found.',
        );
      const c = await d.config();
      const q =
        e.type === 'refund.succeeded' ||
        e.type === 'subscription.cancelled' ||
        e.type === 'payment.failed'
          ? { price: 0, credits: 0 }
          : quote(c, e.kind, e.itemId, e.amount.currency);
      if (
        (e.type === 'payment.succeeded' || e.type === 'subscription.renewed') &&
        q.price !== e.amount.amountMinor
      )
        throw new WebhookError(
          'amount-mismatch',
          'The payment amount does not match the configured price.',
        );
      let ledgerKey = `pay:${e.provider}:${e.eventId}`;
      if (e.type === 'subscription.renewed') {
        const period = z
          .object({ periodStart: z.string().datetime() })
          .safeParse(e);
        if (!period.success)
          throw new WebhookError(
            'malformed',
            'The subscription billing period is missing.',
          );
        ledgerKey = `grant:${e.itemId}:${period.data.periodStart.slice(0, 7)}`;
      } else if (e.kind === 'subscription' && e.type === 'payment.succeeded') {
        // Checkout is not an invoice period. Only invoice/renewal events grant subscription credits.
        return d.store.commitPayment({
          event: e,
          credits: 0,
          ledgerKey,
          revoke: false,
          at: new Date(now()).toISOString(),
        });
      }
      if (e.type === 'refund.succeeded')
        ledgerKey = `refund:${e.provider}:${e.eventId}`;
      return d.store.commitPayment({
        event: e,
        credits: q.credits,
        ledgerKey,
        revoke,
        at: new Date(now()).toISOString(),
      });
    },
    async refund(
      paymentId: string,
      amountMinor: number | null,
      reason: string,
      revokeCredits: boolean,
      requestId: string,
      actor: string,
    ) {
      const records = await d.store.payments();
      const matches = records.filter(
        (p) =>
          p.event.paymentId === paymentId &&
          (p.event.type === 'payment.succeeded' ||
            p.event.type === 'subscription.renewed'),
      );
      const payment = matches[0];
      if (!payment || new Set(matches.map((p) => p.event.provider)).size !== 1)
        throw new PaymentHttpError(
          400,
          'payment',
          'That payment was not found or is ambiguous.',
        );
      const amount = amountMinor ?? payment.event.amount.amountMinor;
      if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > payment.event.amount.amountMinor
      )
        throw new PaymentHttpError(
          400,
          'amount',
          'The refund amount is out of range.',
        );
      // A payment can have one outstanding admin refund operation; ambiguous I/O is reconciled, never resent.
      const key = `refund-request:${payment.event.provider}:${paymentId}`;
      const fingerprint = canonicalJson({
        paymentId,
        amount,
        reason,
        revokeCredits,
        requestId,
        actor,
      });
      const claim = await d.store.claimOperation(key, fingerprint);
      if (!claim.claimed) {
        if (claim.operation.result) return;
        throw new PaymentHttpError(
          409,
          'pending',
          'This refund is pending reconciliation; do not submit it again.',
        );
      }
      const out = await d.gateways[payment.event.provider].refund(
        paymentId,
        amountMinor,
        reason,
      );
      // Provider acknowledgement is not a verified settlement webhook: no credits move here.
      await d.store.finishOperation(
        key,
        { refundId: out.refundId, revokeCredits, reason, actor },
        {
          actor,
          action: 'refund.requested',
          target: paymentId,
          at: new Date(now()).toISOString(),
          detail: { reason, revokeCredits, refundId: out.refundId, requestId },
        },
      );
    },
    async revocationFor(event: PaymentEvent) {
      const op = await d.store.getOperation(
        `refund-request:${event.provider}:${event.paymentId}`,
      );
      if (!op) return false;
      const intent = z
        .object({ revokeCredits: z.boolean() })
        .safeParse(JSON.parse(op.fingerprint));
      return intent.success && intent.data.revokeCredits;
    },
  };
}
