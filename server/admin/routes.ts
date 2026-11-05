import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Caller } from '../auth';
import type { Store, Profile } from '../store';
import type { PlatformConfig } from '../../src/platform-config';
import type {
  AdminMetrics,
  AdminUserRow,
  EmergencySwitches,
} from '../../src/contracts/p3';
import type { AdminChange } from '../payments/records';
import type { createPaymentService } from '../payments/service';
import { PaymentHttpError } from '../payments/service';
import { routeError, type RouteReply } from '../payments/routes';
import { verifyAuditChain } from './audit';
export const ADMIN_REFUSAL = 'Only the owner can change the settings.';
const key = z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/);
const reason = z.string().trim().min(1).max(1000);
const emergencySchema = z.object({
  aiOff: z.boolean(),
  signupsOff: z.boolean(),
  paymentsOff: z.boolean(),
  message: z.object({
    en: z.string().min(1).max(1000),
    hi: z.string().max(1000).optional(),
  }),
});
export function ownsAdminPath(path: string): boolean {
  return /^\/v1\/admin\/(?:users(?:\/[^/]+(?:\/(?:credits|plan|suspension|flags))?)?|refunds|flags|audit|emergency|metrics)$/.test(
    path,
  );
}
export interface AdminDeps {
  store: Store;
  config(): Promise<PlatformConfig>;
  payments: ReturnType<typeof createPaymentService>;
  now?: () => number;
}
export function createAdminRoutes(d: AdminDeps) {
  const now = d.now ?? Date.now;
  const at = () => new Date(now()).toISOString();
  async function user(p: Profile): Promise<AdminUserRow> {
    const usage = await d.store.usage(p.id, '');
    return {
      userId: p.id,
      email: p.email,
      planId: p.plan,
      credits: (await d.store.ledger(p.id)).reduce((s, r) => s + r.delta, 0),
      flags: await d.store.flags(p.id),
      suspended: p.suspended ?? false,
      createdAt: p.createdAt,
      lastSeenAt:
        usage
          .map((r) => r.at)
          .sort()
          .at(-1) ?? null,
    };
  }
  const page = <T>(
    rows: T[],
    cursor: string | null,
    identity: (r: T) => string,
  ) => {
    const start = cursor
      ? rows.findIndex((r) => identity(r) === cursor) + 1
      : 0;
    if (cursor && start === 0)
      throw new PaymentHttpError(
        400,
        'cursor',
        'The page cursor is not valid.',
      );
    const selected = rows.slice(start, start + 50);
    return {
      rows: selected,
      next: start + 50 < rows.length ? identity(selected.at(-1)!) : null,
    };
  };
  return async (
    path: string,
    method: string,
    body: unknown,
    caller: Caller,
    query: URLSearchParams,
  ): Promise<RouteReply | null> => {
    if (!ownsAdminPath(path)) return null;
    const target = path.split('/')[4] ?? '';
    const auditBase = {
      actor: caller.userId,
      at: at(),
      action: `${method} ${path.replace(/\/users\/[^/]+/, '/users/:id')}`,
      target,
    };
    try {
      if (!caller.admin)
        throw new PaymentHttpError(403, 'admin', ADMIN_REFUSAL);
      if (method === 'GET') {
        if (path === '/v1/admin/users') {
          let rows = await Promise.all(
            (await d.store.profiles())
              .sort((a, b) => a.id.localeCompare(b.id))
              .map(user),
          );
          const search = query.get('search')?.toLocaleLowerCase(),
            plan = query.get('planId'),
            flag = query.get('flag');
          rows = rows.filter(
            (r) =>
              (!search ||
                r.email.toLowerCase().includes(search) ||
                r.userId.includes(search)) &&
              (!plan || r.planId === plan) &&
              (!flag || r.flags.includes(flag)),
          );
          return {
            status: 200,
            body: page(rows, query.get('cursor'), (r) => r.userId),
          };
        }
        if (/^\/v1\/admin\/users\/[^/]+$/.test(path)) {
          const p = await d.store.profile(decodeURIComponent(target));
          if (!p)
            throw new PaymentHttpError(
              404,
              'user',
              'The person was not found.',
            );
          const payments = await d.store.payments(p.id);
          return {
            status: 200,
            body: {
              ...(await user(p)),
              ledger: (await d.store.ledger(p.id)).map((r) => ({
                key: r.key,
                delta: r.delta,
                reason: r.note,
                at: r.at,
              })),
              payments: payments
                .filter((r) => r.event.type !== 'refund.succeeded')
                .map((r) => ({
                  paymentId: r.event.paymentId,
                  provider: r.event.provider,
                  amount: r.event.amount,
                  status: payments.some(
                    (x) =>
                      x.event.paymentId === r.event.paymentId &&
                      x.event.type === 'refund.succeeded',
                  )
                    ? 'refunded'
                    : r.event.type === 'payment.failed'
                      ? 'failed'
                      : 'paid',
                  at: r.at,
                })),
            },
          };
        }
        if (path === '/v1/admin/flags') {
          const counts = new Map<string, number>();
          for (const p of await d.store.profiles())
            for (const flag of await d.store.flags(p.id))
              counts.set(flag, (counts.get(flag) ?? 0) + 1);
          return {
            status: 200,
            body: [...counts]
              .sort()
              .map(([flag, users]) => ({ flag, description: flag, users })),
          };
        }
        if (path === '/v1/admin/audit') {
          const rows = await d.store.audit(),
            actor = query.get('actor'),
            action = query.get('action');
          return {
            status: 200,
            body: {
              ...page(
                rows.filter(
                  (r) =>
                    (!actor || r.actor === actor) &&
                    (!action || r.action === action),
                ),
                query.get('cursor'),
                (r) => String(r.seq),
              ),
              chainOk: verifyAuditChain(rows),
            },
          };
        }
        if (path === '/v1/admin/emergency')
          return { status: 200, body: await d.store.emergency() };
        if (path === '/v1/admin/metrics') {
          const from = z.string().datetime().parse(query.get('from')),
            to = z.string().datetime().parse(query.get('to'));
          if (from > to)
            throw new PaymentHttpError(
              400,
              'range',
              'The date range is not valid.',
            );
          const profiles = await d.store.profiles(),
            usage = (
              await Promise.all(profiles.map((p) => d.store.usage(p.id, from)))
            )
              .flat()
              .filter((r) => r.at <= to),
            payments = (await d.store.payments()).filter(
              (r) => r.at >= from && r.at <= to,
            );
          const revenue = new Map<'INR' | 'USD', number>();
          const counted = new Set<string>();
          for (const p of payments) {
            if (
              ![
                'payment.succeeded',
                'subscription.renewed',
                'refund.succeeded',
              ].includes(p.event.type)
            )
              continue;
            if (
              p.event.kind === 'subscription' &&
              p.event.type === 'payment.succeeded'
            )
              continue;
            const chargeKey = `${p.event.provider}:${p.event.paymentId}`;
            if (p.event.type !== 'refund.succeeded') {
              if (counted.has(chargeKey)) continue;
              counted.add(chargeKey);
            }
            const sign = p.event.type === 'refund.succeeded' ? -1 : 1;
            revenue.set(
              p.event.amount.currency,
              (revenue.get(p.event.amount.currency) ?? 0) +
                sign * p.event.amount.amountMinor,
            );
          }
          const byModel = new Map<
              string,
              {
                modelId: string;
                calls: number;
                costUsd: number;
                credits: number;
              }
            >(),
            series = new Map<
              string,
              { day: string; credits: number; costUsd: number }
            >();
          for (const r of usage) {
            const m = byModel.get(r.modelId) ?? {
              modelId: r.modelId,
              calls: 0,
              costUsd: 0,
              credits: 0,
            };
            m.calls++;
            m.credits += r.credits;
            m.costUsd += r.costUsd ?? 0;
            byModel.set(r.modelId, m);
            const day = r.at.slice(0, 10),
              s = series.get(day) ?? { day, credits: 0, costUsd: 0 };
            s.credits += r.credits;
            s.costUsd += r.costUsd ?? 0;
            series.set(day, s);
          }
          const metrics: AdminMetrics = {
            revenue: [...revenue].map(([currency, amountMinor]) => ({
              currency,
              amountMinor,
            })),
            creditsSold: payments.reduce(
              (s, p) => s + Math.max(0, p.creditsDelta),
              0,
            ),
            creditsSpent: usage.reduce((s, r) => s + r.credits, 0),
            providerCostUsd: usage.reduce((s, r) => s + (r.costUsd ?? 0), 0),
            newUsers: profiles.filter(
              (p) => p.createdAt >= from && p.createdAt <= to,
            ).length,
            activeUsers: new Set(usage.map((r) => r.userId)).size,
            byModel: [...byModel.values()],
            series: [...series.values()].sort((a, b) =>
              a.day.localeCompare(b.day),
            ),
          };
          // Rows written before cost was recorded cannot give a true margin.
          if (!usage.some((r) => r.outcome === 'ok' && r.costUsd === undefined))
            return { status: 200, body: metrics };
          return {
            status: 503,
            body: {
              error: {
                code: 'metrics-cost-unavailable',
                message:
                  'Provider cost is not recorded yet; financial metrics are unavailable.',
              },
              partial: {
                ...metrics,
                providerCostUsd: null,
                byModel: metrics.byModel.map((r) => ({ ...r, costUsd: null })),
                series: metrics.series.map((r) => ({ ...r, costUsd: null })),
              },
            },
          };
        }
      }
      if (method === 'POST') {
        if (path === '/v1/admin/refunds') {
          const v = z
            .object({
              paymentId: key,
              amountMinor: z.number().int().positive().nullable(),
              reason,
              revokeCredits: z.boolean(),
              requestId: key,
            })
            .strict()
            .parse(body);
          await d.payments.refund(
            v.paymentId,
            v.amountMinor,
            v.reason,
            v.revokeCredits,
            v.requestId,
            caller.userId,
          );
          return { status: 204, body: null };
        }
        let change: AdminChange | null = null;
        if (path === '/v1/admin/emergency') {
          const v = emergencySchema
            .extend({ reason, requestId: key.optional() })
            .strict()
            .parse(body);
          const emergency: EmergencySwitches = {
            aiOff: v.aiOff,
            signupsOff: v.signupsOff,
            paymentsOff: v.paymentsOff,
            message: {
              en: v.message.en,
              ...(v.message.hi === undefined ? {} : { hi: v.message.hi }),
            },
          };
          change = {
            key: `admin:${caller.userId}:${v.requestId ?? randomUUID()}`,
            emergency,
            audit: { ...auditBase, detail: { reason: v.reason } },
          };
        }
        const match =
          /^\/v1\/admin\/users\/([^/]+)\/(credits|plan|suspension|flags)$/.exec(
            path,
          );
        if (match) {
          const userId = decodeURIComponent(match[1]!);
          if (!(await d.store.profile(userId)))
            throw new PaymentHttpError(
              404,
              'user',
              'The person was not found.',
            );
          const base = {
            userId,
            audit: {
              ...auditBase,
              target: userId,
              detail: {} as Record<string, string | number | boolean>,
            },
          };
          if (match[2] === 'credits') {
            const v = z
              .object({
                delta: z.number().int().safe(),
                reason,
                requestId: key,
              })
              .strict()
              .parse(body);
            change = {
              ...base,
              key: `admin:${caller.userId}:${v.requestId}`,
              delta: v.delta,
              audit: {
                ...base.audit,
                detail: { reason: v.reason, delta: v.delta },
              },
            };
          }
          if (match[2] === 'plan') {
            const v = z
              .object({ planId: key, reason, requestId: key.optional() })
              .strict()
              .parse(body);
            if (!(await d.config()).plans.some((p) => p.id === v.planId))
              throw new PaymentHttpError(
                400,
                'plan',
                'That plan was not found.',
              );
            change = {
              ...base,
              key: `admin:${caller.userId}:${v.requestId ?? randomUUID()}`,
              plan: v.planId,
              audit: {
                ...base.audit,
                detail: { reason: v.reason, plan: v.planId },
              },
            };
          }
          if (match[2] === 'suspension') {
            const v = z
              .object({
                suspended: z.boolean(),
                reason,
                requestId: key.optional(),
              })
              .strict()
              .parse(body);
            change = {
              ...base,
              key: `admin:${caller.userId}:${v.requestId ?? randomUUID()}`,
              suspended: v.suspended,
              audit: {
                ...base.audit,
                detail: { reason: v.reason, suspended: v.suspended },
              },
            };
          }
          if (match[2] === 'flags') {
            const v = z
              .object({ flag: key, on: z.boolean(), requestId: key.optional() })
              .strict()
              .parse(body);
            change = {
              ...base,
              key: `admin:${caller.userId}:${v.requestId ?? randomUUID()}`,
              flag: { name: v.flag, on: v.on },
              audit: { ...base.audit, detail: { flag: v.flag, on: v.on } },
            };
          }
        }
        if (change) {
          await d.store.commitAdmin(change);
          return { status: 204, body: null };
        }
      }
      throw new PaymentHttpError(
        405,
        'method',
        'This action does not support that request method.',
      );
    } catch (e) {
      // Never persist submitted bodies, tokens or provider errors in the audit trail.
      await d.store.appendAudit({
        ...auditBase,
        action: 'admin.refused',
        detail: {
          method,
          code:
            e instanceof PaymentHttpError ? e.code : 'invalid-or-unavailable',
        },
      });
      return routeError(e);
    }
  };
}
