import { z } from 'zod';
import type { AdminClient, P3Text } from '../contracts/p3';
const text = z
  .object({ en: z.string(), hi: z.string().optional() })
  .transform(({ en, hi }): P3Text => ({
    en,
    ...(hi === undefined ? {} : { hi }),
  }));
const money = z.object({
  currency: z.enum(['INR', 'USD']),
  amountMinor: z.number().int().nonnegative(),
});
const user = z.object({
  userId: z.string(),
  email: z.string(),
  planId: z.string(),
  credits: z.number().finite(),
  flags: z.array(z.string()),
  suspended: z.boolean(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
});
const emergency = z.object({
  aiOff: z.boolean(),
  signupsOff: z.boolean(),
  paymentsOff: z.boolean(),
  message: text,
});
const audit = z.object({
  seq: z.number().int(),
  at: z.string(),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  detail: z.record(
    z.string(),
    z.union([z.string(), z.number().finite(), z.boolean()]),
  ),
  hash: z.string(),
});
const metrics = z.object({
  revenue: z.array(money),
  creditsSold: z.number(),
  creditsSpent: z.number(),
  providerCostUsd: z.number(),
  newUsers: z.number(),
  activeUsers: z.number(),
  byModel: z.array(
    z.object({
      modelId: z.string(),
      calls: z.number(),
      costUsd: z.number(),
      credits: z.number(),
    }),
  ),
  series: z.array(
    z.object({ day: z.string(), credits: z.number(), costUsd: z.number() }),
  ),
});
/** base is the server origin (optionally ending in /v1); no token is put in a URL. */
export function createHttpAdminClient(
  base: string,
  token: () => string,
): AdminClient {
  const root = base.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1/admin';
  const query = (values: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(values))
      if (value !== undefined) q.set(key, value);
    return q.size ? `?${q}` : '';
  };
  const request = async (path: string, body?: unknown): Promise<unknown> => {
    let response: Response;
    try {
      const bearer = token();
      if (!bearer) throw new Error();
      response = await fetch(root + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
      });
    } catch {
      throw new Error('The admin server could not be reached.');
    }
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? 'Only an administrator may do that.'
          : response.status === 401
            ? 'Please log in again.'
            : 'The admin request could not be completed.',
      );
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new Error('The admin server returned an unreadable answer.');
    }
  };
  const read = async <T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> => {
    const result = schema.safeParse(await request(path));
    if (!result.success)
      throw new Error('The admin server returned an invalid answer.');
    return result.data;
  };
  const write = async (path: string, body: object) => {
    await request(path, body);
  };
  const at = (id: string) => `/users/${encodeURIComponent(id)}`;
  return {
    users: (q) =>
      read(
        '/users' + query(q),
        z.object({ rows: z.array(user), next: z.string().nullable() }),
      ),
    user: (id) =>
      read(
        at(id),
        user.extend({
          ledger: z.array(
            z.object({
              key: z.string(),
              delta: z.number(),
              reason: z.string(),
              at: z.string(),
            }),
          ),
          payments: z.array(
            z.object({
              paymentId: z.string(),
              provider: z.enum(['razorpay', 'stripe', 'paypal', 'mock']),
              amount: money,
              status: z.enum(['paid', 'refunded', 'failed']),
              at: z.string(),
            }),
          ),
        }),
      ),
    adjustCredits: (id, delta, reason) =>
      write(at(id) + '/credits', {
        delta,
        reason,
        requestId: crypto.randomUUID(),
      }),
    setPlan: (id, planId, reason) =>
      write(at(id) + '/plan', { planId, reason }),
    setSuspended: (id, suspended, reason) =>
      write(at(id) + '/suspension', { suspended, reason }),
    setFlag: (id, flag, on) => write(at(id) + '/flags', { flag, on }),
    refund: (paymentId, amountMinor, reason, revokeCredits) =>
      write('/refunds', {
        paymentId,
        amountMinor,
        reason,
        revokeCredits,
        requestId: crypto.randomUUID(),
      }),
    flags: () =>
      read(
        '/flags',
        z.array(
          z.object({
            flag: z.string(),
            description: z.string(),
            users: z.number(),
          }),
        ),
      ),
    audit: (q) =>
      read(
        '/audit' + query(q),
        z.object({
          rows: z.array(audit),
          next: z.string().nullable(),
          chainOk: z.boolean(),
        }),
      ),
    emergency: () => read('/emergency', emergency),
    setEmergency: (next, reason) => write('/emergency', { ...next, reason }),
    metrics: (range) => read('/metrics' + query(range), metrics),
  };
}
