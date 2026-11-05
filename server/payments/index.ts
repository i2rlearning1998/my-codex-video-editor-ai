import {
  createHmac,
  timingSafeEqual,
  verify,
  X509Certificate,
} from 'node:crypto';
import { z } from 'zod';
import {
  WebhookError,
  type PaymentGateway,
  type PaymentProviderId,
  type PaymentEvent,
  type CheckoutRequest,
} from '../../src/contracts/p3';
export type PaymentEnv = Readonly<Record<string, string | undefined>>;
export interface PaymentOptions {
  fetch?: typeof fetch;
  replayWindowSeconds: () => number;
  now?: () => number;
  /** Trusted server configuration; never accepted from a request. */
  bases?: Partial<Record<PaymentProviderId, string>>;
  subscriptionPlans?: Partial<
    Record<'razorpay' | 'paypal', Record<string, string>>
  >;
  paypalCertificates?: Map<string, string>;
  subscriptionCycles?: Record<string, number>;
}
const identifier = z.string().min(1).max(250);
const meta = z.object({
  userId: identifier,
  itemId: identifier,
  kind: z.enum(['topup', 'subscription']),
});
const obj = z.record(z.string(), z.unknown());
const record = (v: unknown) => obj.parse(v);
const string = (v: unknown) => identifier.parse(v);
const int = (v: unknown) => z.number().int().nonnegative().safe().parse(v);
const currency = (v: unknown) =>
  z.enum(['INR', 'USD']).parse(typeof v === 'string' ? v.toUpperCase() : v);
const hexEqual = (expected: string, received: string) =>
  /^[a-fA-F0-9]{64}$/.test(received) &&
  timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
export function crc32(raw: string): number {
  let c = 0xffffffff;
  for (const b of Buffer.from(raw)) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export const certCache = new Map<string, string>();
/** Network preparation is outside the synchronous frozen verifyWebhook contract. */
export async function preparePayPalCertificate(
  headers: Readonly<Record<string, string>>,
  fetcher: typeof fetch = fetch,
  cache = certCache,
) {
  const url = headers['paypal-cert-url'] ?? '';
  if (
    !/^https:\/\/(?:api|api-m|api-m\.sandbox)\.paypal\.com\/v1\/notifications\/certs\/[A-Za-z0-9_-]+$/.test(
      url,
    )
  )
    throw new WebhookError(
      'bad-signature',
      'The payment signature is not valid.',
    );
  if (cache.has(url)) return;
  try {
    const r = await fetcher(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error();
    const pem = await r.text();
    if (pem.length > 16000) throw new Error();
    new X509Certificate(pem);
    if (cache.size >= 16) cache.delete(cache.keys().next().value!);
    cache.set(url, pem);
  } catch {
    throw new WebhookError(
      'bad-signature',
      'The payment certificate could not be checked.',
    );
  }
}
export function createPaymentGateways(
  env: PaymentEnv,
  options?: PaymentOptions,
): Record<PaymentProviderId, PaymentGateway> {
  const optionsOrNull = options;
  const f = options?.fetch ?? fetch,
    now = options?.now ?? Date.now;
  const certs = options?.paypalCertificates ?? certCache;
  const bases = {
    stripe: 'https://api.stripe.com',
    razorpay: 'https://api.razorpay.com',
    paypal: 'https://api-m.paypal.com',
    ...options?.bases,
  };
  const required = {
    stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    razorpay: [
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
    ],
    paypal: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID'],
    mock: [],
  };
  const connected = (id: PaymentProviderId) =>
    id !== 'mock' && required[id].every((k) => !!env[k]);
  const need = (id: PaymentProviderId) => {
    if (!connected(id))
      throw new Error('That payment provider is not connected.');
  };
  const age = (stamp: number, t: number) => {
    const window = optionsOrNull?.replayWindowSeconds();
    if (!window || !Number.isFinite(window) || window <= 0)
      throw new WebhookError(
        'stale',
        'The payment replay window is not configured.',
      );
    if (!Number.isFinite(stamp) || Math.abs(t - stamp) > window * 1000)
      throw new WebhookError(
        'stale',
        'The payment notification is too old or in the future.',
      );
  };
  async function call(
    id: 'stripe' | 'razorpay' | 'paypal',
    path: string,
    body: object | URLSearchParams,
    idem?: string,
    method = 'POST',
  ): Promise<Record<string, unknown>> {
    need(id);
    try {
      let authorization =
        id === 'stripe'
          ? `Bearer ${env.STRIPE_SECRET_KEY}`
          : `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
      if (id === 'paypal') {
        const r = await f(bases.paypal + '/v1/oauth2/token', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: {
            authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        if (!r.ok) throw new Error();
        authorization = `Bearer ${string(record(await r.json()).access_token)}`;
      }
      const headers: Record<string, string> = {
        authorization,
        'content-type':
          body instanceof URLSearchParams
            ? 'application/x-www-form-urlencoded'
            : 'application/json',
      };
      if (id === 'stripe') headers['Stripe-Version'] = '2024-06-20';
      if (idem && id !== 'razorpay')
        headers[id === 'stripe' ? 'Idempotency-Key' : 'PayPal-Request-Id'] =
          idem;
      const r = await f(bases[id] + path, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers,
        ...(method === 'DELETE' || method === 'GET'
          ? {}
          : {
              body:
                body instanceof URLSearchParams
                  ? body.toString()
                  : JSON.stringify(body),
            }),
      });
      if (!r.ok) throw new Error();
      if (r.status === 204) return {};
      return record(await r.json());
    } catch {
      throw new Error('The payment provider could not finish the request.');
    }
  }
  const make = (id: 'stripe' | 'razorpay' | 'paypal'): PaymentGateway => ({
    id,
    connected: () => connected(id),
    async createCheckout(req: CheckoutRequest) {
      need(id);
      if (
        !Number.isSafeInteger(req.price.amountMinor) ||
        req.price.amountMinor <= 0
      )
        throw new Error('The checkout price is not valid.');
      const m = { userId: req.userId, itemId: req.itemId, kind: req.kind };
      let r: Record<string, unknown> = {};
      let url: unknown;
      if (id === 'stripe') {
        const b = new URLSearchParams({
          mode: req.kind === 'subscription' ? 'subscription' : 'payment',
          success_url: req.returnUrl,
          cancel_url: req.returnUrl,
          'line_items[0][quantity]': '1',
          'line_items[0][price_data][currency]':
            req.price.currency.toLowerCase(),
          'line_items[0][price_data][unit_amount]': String(
            req.price.amountMinor,
          ),
          'line_items[0][price_data][product_data][name]': req.itemId,
        });
        for (const [k, v] of Object.entries(m)) {
          b.set(`metadata[${k}]`, v);
          b.set(
            `${req.kind === 'subscription' ? 'subscription_data' : 'payment_intent_data'}[metadata][${k}]`,
            v,
          );
        }
        if (req.kind === 'subscription')
          b.set('line_items[0][price_data][recurring][interval]', 'month');
        r = await call(id, '/v1/checkout/sessions', b, req.idempotencyKey);
        url = r.url;
      } else if (id === 'razorpay') {
        if (req.kind === 'subscription') {
          const plan = options?.subscriptionPlans?.razorpay?.[req.itemId];
          if (!plan)
            throw new Error(
              'That subscription needs a configured provider plan.',
            );
          const cycles = options?.subscriptionCycles?.[req.itemId];
          if (!cycles || !Number.isSafeInteger(cycles) || cycles < 1)
            throw new Error(
              'That subscription needs a configured billing duration.',
            );
          r = await call(id, '/v1/subscriptions', {
            plan_id: plan,
            total_count: cycles,
            notes: m,
            customer_notify: 1,
          });
          url = r.short_url;
        }
        if (req.kind === 'topup')
          r = await call(id, '/v1/payment_links', {
            amount: req.price.amountMinor,
            currency: req.price.currency,
            accept_partial: false,
            reference_id: req.idempotencyKey,
            description: req.itemId,
            notes: m,
            callback_url: req.returnUrl,
            callback_method: 'get',
          });
        url = r!.short_url;
      } else {
        if (req.kind === 'subscription') {
          const plan = options?.subscriptionPlans?.paypal?.[req.itemId];
          if (!plan)
            throw new Error(
              'That subscription needs a configured provider plan.',
            );
          r = await call(
            id,
            '/v1/billing/subscriptions',
            {
              plan_id: plan,
              custom_id: JSON.stringify(m),
              application_context: {
                return_url: req.returnUrl,
                cancel_url: req.returnUrl,
              },
            },
            req.idempotencyKey,
          );
        } else
          r = await call(
            id,
            '/v2/checkout/orders',
            {
              intent: 'CAPTURE',
              purchase_units: [
                {
                  custom_id: JSON.stringify(m),
                  amount: {
                    currency_code: req.price.currency,
                    value: (req.price.amountMinor / 100).toFixed(2),
                  },
                },
              ],
              payment_source: {
                paypal: {
                  experience_context: {
                    return_url: req.returnUrl,
                    cancel_url: req.returnUrl,
                    user_action: 'PAY_NOW',
                  },
                },
              },
            },
            req.idempotencyKey,
          );
        url = z
          .array(obj)
          .parse(r.links)
          .find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href;
      }
      const hosted = z.string().url().parse(url);
      if (new URL(hosted).protocol !== 'https:')
        throw new Error('The provider returned an unsafe checkout address.');
      return {
        provider: id,
        sessionId: string(r.id),
        url: hosted,
        expiresAt: new Date(
          typeof r.expires_at === 'number'
            ? r.expires_at * 1000
            : now() + 86400000,
        ).toISOString(),
      };
    },
    verifyWebhook(raw, headers, date = new Date(now())) {
      try {
        need(id);
        let data: Record<string, unknown>;
        if (id === 'stripe') {
          const parts = (headers['stripe-signature'] ?? '')
            .split(',')
            .map((s) => s.split('='));
          const t = parts.find((p) => p[0] === 't')?.[1] ?? '';
          const expected = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET!)
            .update(`${t}.${raw}`)
            .digest('hex');
          if (
            !parts.some((p) => p[0] === 'v1' && hexEqual(expected, p[1] ?? ''))
          )
            throw new WebhookError(
              'bad-signature',
              'The payment signature is not valid.',
            );
          age(Number(t) * 1000, date.getTime());
        } else if (id === 'razorpay') {
          if (
            !hexEqual(
              createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET!)
                .update(raw)
                .digest('hex'),
              headers['x-razorpay-signature'] ?? '',
            )
          )
            throw new WebhookError(
              'bad-signature',
              'The payment signature is not valid.',
            );
        } else {
          const cert = certs.get(headers['paypal-cert-url'] ?? '');
          if (!cert || headers['paypal-auth-algo'] !== 'SHA256withRSA')
            throw new WebhookError(
              'bad-signature',
              'The payment signature is not valid.',
            );
          const x = new X509Certificate(cert);
          if (
            date.getTime() < Date.parse(x.validFrom) ||
            date.getTime() > Date.parse(x.validTo)
          )
            throw new WebhookError(
              'bad-signature',
              'The payment certificate has expired.',
            );
          const signed = `${headers['paypal-transmission-id']}|${headers['paypal-transmission-time']}|${env.PAYPAL_WEBHOOK_ID}|${crc32(raw)}`;
          if (
            !verify(
              'RSA-SHA256',
              Buffer.from(signed),
              x.publicKey,
              Buffer.from(headers['paypal-transmission-sig'] ?? '', 'base64'),
            )
          )
            throw new WebhookError(
              'bad-signature',
              'The payment signature is not valid.',
            );
          age(
            Date.parse(headers['paypal-transmission-time'] ?? ''),
            date.getTime(),
          );
        }
        data = record(JSON.parse(raw));
        let resource: Record<string, unknown>;
        let metadata: unknown;
        let type: PaymentEvent['type'];
        let paymentId: string;
        let amount: number;
        let cur: unknown;
        let occurred: number;
        let periodStart: string | undefined;
        if (id === 'stripe') {
          resource = record(record(data.data).object);
          metadata = resource.metadata;
          const typeMap: Record<string, PaymentEvent['type']> = {
            'checkout.session.completed': 'payment.succeeded',
            'checkout.session.async_payment_succeeded': 'payment.succeeded',
            'invoice.paid': 'subscription.renewed',
            'payment_intent.payment_failed': 'payment.failed',
            'refund.created': 'refund.succeeded',
            'customer.subscription.deleted': 'subscription.cancelled',
          };
          type = typeMap[string(data.type)]!;
          if (!type) throw new Error();
          if (
            type === 'payment.succeeded' &&
            resource.payment_status !== 'paid'
          )
            throw new Error();
          if (type === 'refund.succeeded' && resource.status !== 'succeeded')
            throw new Error();
          if (type === 'subscription.renewed') {
            metadata = record(resource.subscription_details).metadata;
            const line = record(
              z.array(obj).parse(record(resource.lines).data)[0],
            );
            periodStart = new Date(
              int(record(line.period).start) * 1000,
            ).toISOString();
          }
          paymentId = string(resource.payment_intent ?? resource.id);
          amount = int(
            resource.amount_total ??
              resource.amount_paid ??
              resource.amount ??
              0,
          );
          cur = resource.currency ?? 'usd';
          occurred = int(data.created) * 1000;
        } else if (id === 'razorpay') {
          const payload = record(data.payload);
          resource = record(
            record(payload.payment ?? payload.refund ?? payload.subscription)
              .entity,
          );
          metadata = payload.payment_link
            ? record(record(payload.payment_link).entity).notes
            : resource.notes;
          const types: Record<string, PaymentEvent['type']> = {
            'payment.captured': 'payment.succeeded',
            'payment_link.paid': 'payment.succeeded',
            'payment.failed': 'payment.failed',
            'refund.processed': 'refund.succeeded',
            'subscription.charged': 'subscription.renewed',
            'subscription.cancelled': 'subscription.cancelled',
          };
          type = types[string(data.event)]!;
          if (!type) throw new Error();
          if (type === 'subscription.renewed') {
            const sub = record(record(payload.subscription).entity);
            metadata = sub.notes;
            periodStart = new Date(int(sub.current_start) * 1000).toISOString();
          }
          paymentId = string(resource.payment_id ?? resource.id);
          amount = int(resource.amount ?? 0);
          cur = resource.currency ?? 'INR';
          occurred = int(data.created_at) * 1000;
        } else {
          resource = record(data.resource);
          metadata = resource.custom_id
            ? JSON.parse(string(resource.custom_id))
            : {};
          const types: Record<string, PaymentEvent['type']> = {
            'PAYMENT.CAPTURE.COMPLETED': 'payment.succeeded',
            'PAYMENT.CAPTURE.DENIED': 'payment.failed',
            'PAYMENT.CAPTURE.REFUNDED': 'refund.succeeded',
            'PAYMENT.SALE.COMPLETED': 'subscription.renewed',
            'BILLING.SUBSCRIPTION.CANCELLED': 'subscription.cancelled',
          };
          type = types[string(data.event_type)]!;
          if (!type) throw new Error();
          const money = record(resource.amount);
          const value = string(money.value ?? money.total);
          if (!/^\d+\.\d{2}$/.test(value)) throw new Error();
          amount = int(Math.round(Number(value) * 100));
          cur = money.currency_code ?? money.currency;
          occurred = Date.parse(string(data.create_time));
          paymentId =
            type === 'refund.succeeded'
              ? string(
                  record(record(resource.supplementary_data).related_ids)
                    .capture_id,
                )
              : string(resource.id);
        }
        age(occurred, date.getTime());
        const m =
          type === 'refund.succeeded'
            ? { userId: '', itemId: '', kind: 'topup' as const }
            : meta.parse(metadata);
        const event: PaymentEvent & { periodStart?: string } = {
          provider: id,
          eventId: string(
            id === 'razorpay' ? headers['x-razorpay-event-id'] : data.id,
          ),
          type,
          paymentId,
          ...m,
          amount: { currency: currency(cur), amountMinor: amount },
          occurredAt: new Date(occurred).toISOString(),
          ...(periodStart ? { periodStart } : {}),
        };
        return event;
      } catch (e) {
        if (e instanceof WebhookError) throw e;
        throw new WebhookError(
          'malformed',
          'The payment notification is not valid.',
        );
      }
    },
    async refund(paymentId, amountMinor, reason) {
      const amount = amountMinor === null ? {} : { amount: amountMinor };
      let r;
      if (id === 'stripe')
        r = await call(
          id,
          '/v1/refunds',
          new URLSearchParams({
            payment_intent: paymentId,
            ...(amountMinor === null ? {} : { amount: String(amountMinor) }),
            'metadata[reason]': reason,
          }),
        );
      else if (id === 'razorpay')
        r = await call(
          id,
          `/v1/payments/${encodeURIComponent(paymentId)}/refund`,
          { ...amount, notes: { reason } },
        );
      else {
        const capture =
          amountMinor === null
            ? null
            : await call(
                id,
                `/v2/payments/captures/${encodeURIComponent(paymentId)}`,
                {},
                undefined,
                'GET',
              );
        const amount = capture
          ? {
              amount: {
                currency_code: currency(record(capture.amount).currency_code),
                value: (amountMinor! / 100).toFixed(2),
              },
            }
          : {};
        r = await call(
          id,
          `/v2/payments/captures/${encodeURIComponent(paymentId)}/refund`,
          { note_to_payer: reason, ...amount },
        );
      }
      return { refundId: string(r.id) };
    },
    async cancelSubscription(subscriptionId) {
      if (id === 'stripe')
        await call(
          id,
          `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
          {},
          undefined,
          'DELETE',
        );
      else
        await call(
          id,
          id === 'razorpay'
            ? `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`
            : `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
          { reason: 'Cancelled by account owner' },
        );
    },
  });
  const unavailable = () => {
    throw new Error('Mock payments are not available on the server.');
  };
  return {
    stripe: make('stripe'),
    razorpay: make('razorpay'),
    paypal: make('paypal'),
    mock: {
      id: 'mock',
      connected: () => false,
      createCheckout: async () => unavailable(),
      verifyWebhook: unavailable,
      refund: async () => unavailable(),
      cancelSubscription: async () => unavailable(),
    },
  };
}
