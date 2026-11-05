import {
  CreditLedger,
  type LedgerEntry,
  type UsageRow,
  type UsageLog,
} from '../../src/gateway';
import type { Store } from '../store';
/** Refresh the canonical ledger under the lock: payments/admin may have changed it. */
export class PaymentAwarePeople {
  private states = new Map<
    string,
    {
      rows: LedgerEntry[];
      pending: LedgerEntry[];
      usage: UsageRow[];
      pendingUsage: UsageRow[];
      ledger: CreditLedger;
    }
  >();
  private tails = new Map<string, Promise<unknown>>();
  constructor(
    private store: Store,
    private now: () => number,
  ) {}
  private state(u: string) {
    let s = this.states.get(u);
    if (!s) {
      const rows: LedgerEntry[] = [],
        pending: LedgerEntry[] = [];
      s = {
        rows,
        pending,
        usage: [],
        pendingUsage: [],
        ledger: new CreditLedger(
          {
            read: () => rows,
            append: (e) => {
              rows.push(...e);
              pending.push(...e);
            },
          },
          () => new Date(this.now()).toISOString(),
        ),
      };
      this.states.set(u, s);
    }
    return s;
  }
  private lock<T>(u: string, fn: () => Promise<T>): Promise<T> {
    const next = (this.tails.get(u) ?? Promise.resolve())
      .catch(() => undefined)
      .then(fn);
    this.tails.set(u, next);
    void next
      .finally(() => {
        if (this.tails.get(u) === next) this.tails.delete(u);
      })
      .catch(() => undefined);
    return next;
  }
  async ready(u: string) {
    await this.lock(u, async () => {
      const s = this.state(u);
      s.rows.splice(0, s.rows.length, ...(await this.store.ledger(u)));
      s.usage = await this.store.usage(
        u,
        new Date(this.now() - 2 * 86400000).toISOString(),
      );
    });
  }
  ledgerNow(u: string) {
    return this.state(u).ledger;
  }
  async withLedger<T>(
    u: string,
    fn: (l: CreditLedger) => T | Promise<T>,
  ): Promise<T> {
    return this.lock(u, async () => {
      const s = this.state(u);
      s.rows.splice(0, s.rows.length, ...(await this.store.ledger(u)));
      try {
        const out = await fn(s.ledger);
        if (s.pending.length) await this.store.appendLedger(u, s.pending);
        await this.flush(u);
        return out;
      } finally {
        s.pending.length = 0;
        s.rows.splice(0, s.rows.length, ...(await this.store.ledger(u)));
      }
    });
  }
  private async flush(u: string) {
    const s = this.state(u);
    while (s.pendingUsage.length) {
      await this.store.appendUsage(s.pendingUsage[0]!);
      s.pendingUsage.shift();
    }
  }
  async flushUsage(u: string) {
    await this.lock(u, () => this.flush(u));
  }
  usageLog(): UsageLog {
    return {
      append: (r) => {
        const s = this.state(r.userId);
        s.usage.push(r);
        s.pendingUsage.push(r);
      },
      list: (u) =>
        u
          ? this.state(u).usage
          : [...this.states.values()].flatMap((s) => s.usage),
    };
  }
}
