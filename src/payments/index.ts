// P2-06: payment providers from config. Only the mock moves (fake) money in
// this round; Razorpay and Stripe say they are not connected.
import type { PlatformConfig } from '../platform-config';

type PaymentConfig = PlatformConfig['payments'][number];
export interface Checkout {
  readonly credits: number;
  readonly amount: number;
  readonly currency: 'INR' | 'USD';
  /** Idempotency: the same key never pays twice. */
  readonly key: string;
}
export type PaymentResult =
  { ok: true; paymentId: string } | { ok: false; message: string };
export interface PaymentProvider {
  readonly id: string;
  readonly kind: PaymentConfig['kind'];
  readonly name: string;
  pay(c: Checkout): Promise<PaymentResult>;
}

export function mockPayment(cfg: PaymentConfig): PaymentProvider {
  const paid = new Map<string, string>();
  return {
    id: cfg.id,
    kind: 'mock',
    name: cfg.name,
    async pay(c) {
      if (!cfg.currencies.includes(c.currency))
        return {
          ok: false,
          message: `${cfg.name} does not take ${c.currency}.`,
        };
      if (!(c.amount >= 0) || !(c.credits > 0))
        return { ok: false, message: 'The amount is not valid.' };
      const id = paid.get(c.key) ?? `mockpay-${c.key}`;
      paid.set(c.key, id);
      return { ok: true, paymentId: id };
    },
  };
}
const notConnected = (cfg: PaymentConfig): PaymentProvider => ({
  id: cfg.id,
  kind: cfg.kind,
  name: cfg.name,
  pay: async () => ({
    ok: false,
    message: `${cfg.name} is not connected yet.`,
  }),
});
/** Enabled payment providers for a currency (and country, when known). */
export function paymentProviders(
  c: PlatformConfig,
  currency: 'INR' | 'USD',
  country?: string,
): PaymentProvider[] {
  return c.payments
    .filter(
      (p) =>
        p.enabled &&
        p.currencies.includes(currency) &&
        (!country || !p.countries.length || p.countries.includes(country)),
    )
    .map((p) => (p.kind === 'mock' ? mockPayment(p) : notConnected(p)));
}
