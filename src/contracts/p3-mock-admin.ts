// P3 mock: an in-memory AdminClient (and the admin-controlled settings store)
// so every admin screen is built and tested without Part 1's server. It keeps
// the real rules the screens must show: a reason is required for every change,
// the audit log is a SHA-256-style chain, a refund can take credits back, and
// suspended people keep their data. NEVER shipped as the real client.
import type {
  AdminClient,
  AdminMetrics,
  AdminUserRow,
  AuditRow,
  EmergencySwitches,
  Money,
  P3AdminSettings,
} from './p3';

export interface MockAdminOptions {
  readonly now?: () => Date;
}

/** Settings the owner edits on the Settings screen (a mock store). */
export interface AdminSettingsStore {
  get(): Promise<P3AdminSettings>;
  set(next: P3AdminSettings, reason: string): Promise<void>;
}

const PLANS = ['free', 'pro', 'studio'] as const;
const PRICE: Record<string, number> = { pro: 79900, studio: 199900 };

/** A small, readable hash: enough to show a chain that detects edits. */
export function chainHash(prev: string, row: Omit<AuditRow, 'hash'>): string {
  const text = prev + JSON.stringify(row);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0;
    b = (Math.imul(b + text.charCodeAt(i), 0x85ebca6b) ^ (a >>> 7)) >>> 0;
  }
  return (
    a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
  ).repeat(4);
}

interface UserState {
  row: {
    -readonly [K in keyof AdminUserRow]: AdminUserRow[K];
  };
  ledger: { key: string; delta: number; reason: string; at: string }[];
  payments: {
    paymentId: string;
    provider: 'razorpay' | 'stripe' | 'paypal' | 'mock';
    amount: Money;
    status: 'paid' | 'refunded' | 'failed';
    at: string;
    credits: number;
  }[];
}

export const DEFAULT_ADMIN_SETTINGS: P3AdminSettings = {
  chat: { enabled: true, maxMessagesPerDay: 60, maxHistoryTokens: 24000 },
  vision: { enabled: true, creditsPerImage: 2, maxImagesPerMessage: 4 },
  memory: {
    keepRecent: 8,
    summariseAboveTokens: 6000,
    maxFacts: 60,
    maxStyleRules: 12,
  },
  entitlementTtlSeconds: 900,
  webhookReplayWindowSeconds: 300,
};

export function createMockAdmin(opts: MockAdminOptions = {}): AdminClient & {
  readonly settings: AdminSettingsStore;
  /** Test helper: change a stored row without the chain (to prove detection). */
  tamperAudit(seq: number): void;
} {
  const now = () => (opts.now ?? (() => new Date()))();
  const iso = (daysAgo = 0, hours = 0) =>
    new Date(now().getTime() - daysAgo * 864e5 - hours * 36e5).toISOString();

  const names = [
    'asha.verma',
    'rohit.k',
    'meera.s',
    'dev.patel',
    'sana.sheikh',
    'kabir.m',
    'isha.rao',
    'arjun.n',
    'tara.j',
    'vikram.d',
    'nisha.b',
    'omar.f',
    'lata.g',
    'yash.t',
    'zoya.a',
    'ravi.p',
  ];
  const users = new Map<string, UserState>();
  names.forEach((n, i) => {
    const planId = i % 5 === 0 ? 'studio' : i % 2 === 0 ? 'pro' : 'free';
    const userId = `u-${100 + i}`;
    const credits = planId === 'free' ? 40 + i * 3 : 400 + i * 25;
    const st: UserState = {
      row: {
        userId,
        email: `${n}@example.test`,
        planId,
        credits,
        flags: i === 3 ? ['beta-chat'] : i === 6 ? ['beta-chat', 'vip'] : [],
        suspended: i === 11,
        createdAt: iso(60 - i * 3),
        lastSeenAt: i === 14 ? null : iso(i % 7, i),
      },
      ledger: [
        {
          key: `grant:${planId}:m`,
          delta: credits + 120,
          reason: 'Monthly credits',
          at: iso(20),
        },
        {
          key: `spend:${i}:a`,
          delta: -(60 + i),
          reason: 'Video build',
          at: iso(8),
        },
        {
          key: `spend:${i}:b`,
          delta: -(60 + i),
          reason: 'Studio image',
          at: iso(3),
        },
      ],
      payments:
        planId === 'free'
          ? []
          : [
              {
                paymentId: `pay-${userId}`,
                provider: i % 3 === 0 ? 'stripe' : 'razorpay',
                amount: {
                  currency: i % 3 === 0 ? 'USD' : 'INR',
                  amountMinor: i % 3 === 0 ? 1099 : (PRICE[planId] ?? 79900),
                },
                status: 'paid',
                at: iso(12),
                credits: 500,
              },
            ],
    };
    users.set(userId, st);
  });

  const flagInfo: Record<string, string> = {
    'beta-chat': 'Sees the editor chat before everyone else',
    vip: 'Skips the daily message cap',
    'no-watermark': 'Exports without the watermark',
  };

  let emergency: EmergencySwitches = {
    aiOff: false,
    signupsOff: false,
    paymentsOff: false,
    message: { en: 'We are fixing something. Please try again soon.' },
  };
  let settings: P3AdminSettings = DEFAULT_ADMIN_SETTINGS;

  const audit: AuditRow[] = [];
  const log = (
    action: string,
    target: string,
    detail: AuditRow['detail'],
    actor = 'owner@example.test',
    at = now().toISOString(),
  ) => {
    const prev = audit[audit.length - 1]?.hash ?? '0'.repeat(64);
    const base = { seq: audit.length + 1, at, actor, action, target, detail };
    audit.push({ ...base, hash: chainHash(prev, base) });
  };
  log(
    'user.plan',
    'u-100',
    { from: 'free', to: 'studio', reason: 'Launch seed' },
    'owner@example.test',
    iso(30),
  );
  log(
    'credits.adjust',
    'u-103',
    { delta: 50, reason: 'Support goodwill' },
    'owner@example.test',
    iso(9),
  );
  log(
    'flag.set',
    'u-103',
    { flag: 'beta-chat', on: true },
    'owner@example.test',
    iso(5),
  );

  const need = (reason: string) => {
    if (!reason.trim()) throw new Error('A reason is required.');
  };
  const get = (id: string) => {
    const u = users.get(id);
    if (!u) throw new Error('That person does not exist.');
    return u;
  };
  const wait = () => new Promise<void>((r) => setTimeout(r, 0));

  const client: AdminClient = {
    async users(q) {
      await wait();
      const search = (q.search ?? '').trim().toLowerCase();
      const all = [...users.values()]
        .map((u) => u.row)
        .filter(
          (r) =>
            (!search || r.email.toLowerCase().includes(search)) &&
            (!q.planId || r.planId === q.planId) &&
            (!q.flag || r.flags.includes(q.flag)),
        );
      const start = Number(q.cursor ?? 0);
      const page = all.slice(start, start + 10);
      return {
        rows: page.map((r) => ({ ...r, flags: [...r.flags] })),
        next: start + 10 < all.length ? String(start + 10) : null,
      };
    },
    async user(id) {
      await wait();
      const u = get(id);
      return {
        ...u.row,
        flags: [...u.row.flags],
        ledger: u.ledger.map((l) => ({ ...l })),
        payments: u.payments.map(({ credits: _c, ...p }) => ({ ...p })),
      };
    },
    async adjustCredits(id, delta, reason) {
      need(reason);
      if (!Number.isInteger(delta) || delta === 0)
        throw new Error('Enter a whole number of credits, not zero.');
      const u = get(id);
      if (u.row.credits + delta < 0)
        throw new Error('That would take the balance below zero.');
      u.row.credits += delta;
      u.ledger.unshift({
        key: `admin:${audit.length + 1}`,
        delta,
        reason,
        at: now().toISOString(),
      });
      log('credits.adjust', id, { delta, reason });
    },
    async setPlan(id, planId, reason) {
      need(reason);
      if (!PLANS.includes(planId as (typeof PLANS)[number]))
        throw new Error('That plan does not exist.');
      const u = get(id);
      const from = u.row.planId;
      u.row.planId = planId;
      log('user.plan', id, { from, to: planId, reason });
    },
    async setSuspended(id, suspended, reason) {
      need(reason);
      get(id).row.suspended = suspended;
      log(suspended ? 'user.suspend' : 'user.unsuspend', id, { reason });
    },
    async setFlag(id, flag, on) {
      const u = get(id);
      const set = new Set(u.row.flags);
      if (on) set.add(flag);
      else set.delete(flag);
      u.row.flags = [...set];
      log('flag.set', id, { flag, on });
    },
    async refund(paymentId, amountMinor, reason, revokeCredits) {
      need(reason);
      for (const u of users.values()) {
        const p = u.payments.find((x) => x.paymentId === paymentId);
        if (!p) continue;
        if (p.status !== 'paid') throw new Error('That payment is not paid.');
        if (amountMinor !== null && amountMinor > p.amount.amountMinor)
          throw new Error('The refund is more than the payment.');
        p.status = 'refunded';
        if (revokeCredits) {
          u.row.credits = Math.max(0, u.row.credits - p.credits);
          u.ledger.unshift({
            key: `refund:${paymentId}`,
            delta: -p.credits,
            reason: `Refund: ${reason}`,
            at: now().toISOString(),
          });
        }
        log('payment.refund', u.row.userId, {
          paymentId,
          amountMinor: amountMinor ?? p.amount.amountMinor,
          revokeCredits,
          reason,
        });
        return;
      }
      throw new Error('That payment does not exist.');
    },
    async flags() {
      await wait();
      return Object.entries(flagInfo).map(([flag, description]) => ({
        flag,
        description,
        users: [...users.values()].filter((u) => u.row.flags.includes(flag))
          .length,
      }));
    },
    async audit(q) {
      await wait();
      const rows = audit
        .filter(
          (r) =>
            (!q.actor || r.actor === q.actor) &&
            (!q.action || r.action.startsWith(q.action)),
        )
        .slice()
        .reverse();
      const start = Number(q.cursor ?? 0);
      let prev = '0'.repeat(64);
      let ok = true;
      for (const r of audit) {
        const { hash, ...base } = r;
        if (chainHash(prev, base) !== hash) ok = false;
        prev = hash;
      }
      return {
        rows: rows.slice(start, start + 15),
        next: start + 15 < rows.length ? String(start + 15) : null,
        chainOk: ok,
      };
    },
    async emergency() {
      await wait();
      return { ...emergency };
    },
    async setEmergency(next, reason) {
      need(reason);
      const before = emergency;
      emergency = { ...next };
      log('emergency.set', 'platform', {
        aiOff: next.aiOff,
        signupsOff: next.signupsOff,
        paymentsOff: next.paymentsOff,
        wasAiOff: before.aiOff,
        reason,
      });
    },
    async metrics(range) {
      await wait();
      const from = new Date(range.from).getTime();
      const to = new Date(range.to).getTime();
      const days = Math.max(1, Math.min(90, Math.round((to - from) / 864e5)));
      const series = Array.from({ length: days }, (_, i) => {
        const d = new Date(from + i * 864e5);
        const wave = 1 + Math.sin(i / 2.2) * 0.35 + (i % 5) * 0.04;
        return {
          day: d.toISOString().slice(0, 10),
          credits: Math.round(420 * wave),
          costUsd:
            Math.round(4.2 * (1 + Math.sin(i / 2.2 + 1.1) * 0.3) * 100) / 100,
        };
      });
      const creditsSpent = series.reduce((a, s) => a + s.credits, 0);
      const providerCostUsd =
        Math.round(series.reduce((a, s) => a + s.costUsd, 0) * 100) / 100;
      const m: AdminMetrics = {
        revenue: [
          { currency: 'INR', amountMinor: 79900 * 6 + 199900 * 2 },
          { currency: 'USD', amountMinor: 1099 * 4 },
        ],
        creditsSold: Math.round(creditsSpent * 1.15),
        creditsSpent,
        providerCostUsd,
        newUsers: Math.round(days * 1.4),
        activeUsers: Math.round(users.size * 0.7),
        byModel: [
          {
            modelId: 'claude-sonnet',
            calls: 412,
            costUsd: providerCostUsd * 0.46,
            credits: Math.round(creditsSpent * 0.4),
          },
          {
            modelId: 'images-pro',
            calls: 188,
            costUsd: providerCostUsd * 0.31,
            credits: Math.round(creditsSpent * 0.34),
          },
          {
            modelId: 'voice-natural',
            calls: 96,
            costUsd: providerCostUsd * 0.14,
            credits: Math.round(creditsSpent * 0.16),
          },
          {
            modelId: 'mock',
            calls: 640,
            costUsd: 0,
            credits: Math.round(creditsSpent * 0.1),
          },
        ].map((x) => ({ ...x, costUsd: Math.round(x.costUsd * 100) / 100 })),
        series,
      };
      return m;
    },
  };

  return Object.assign(client, {
    settings: {
      async get() {
        await wait();
        return settings;
      },
      async set(next: P3AdminSettings, reason: string) {
        need(reason);
        if (next.chat.maxMessagesPerDay < 0 || next.vision.creditsPerImage < 0)
          throw new Error('Numbers cannot be negative.');
        settings = next;
        log('settings.set', 'platform', { reason });
      },
    },
    tamperAudit(seq: number) {
      const i = audit.findIndex((r) => r.seq === seq);
      const r = audit[i];
      if (r) audit[i] = { ...r, detail: { ...r.detail, reason: 'edited' } };
    },
  });
}
