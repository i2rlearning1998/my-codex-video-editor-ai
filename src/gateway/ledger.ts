// P2-12, P2-13: an append-only credits ledger. Nothing is ever edited; the
// balance is the sum of the rows. Every write carries an idempotency key, so
// a retried request never moves credits twice.
import { GatewayError } from './types';

export type LedgerType = 'grant' | 'reserve' | 'settle' | 'refund' | 'adjust';
export interface LedgerEntry {
  readonly id: string;
  readonly at: string;
  readonly type: LedgerType;
  /** Change to the available balance (reserve is negative). */
  readonly delta: number;
  /** For a settle: the credits actually used. */
  readonly used?: number;
  readonly reservationId?: string;
  readonly key: string;
  readonly note: string;
}
export interface LedgerStore {
  read(): readonly LedgerEntry[];
  append(entries: readonly LedgerEntry[]): void;
}
export const memoryLedgerStore = (): LedgerStore => {
  const rows: LedgerEntry[] = [];
  return { read: () => rows, append: (e) => void rows.push(...e) };
};
type KV = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
};
/** Browser storage: one list per user. A server store is the same interface. */
export function storageLedgerStore(storage: KV, userId: string): LedgerStore {
  const key = `aive.credits.${userId}`;
  const read = (): LedgerEntry[] => {
    try {
      const v = JSON.parse(storage.getItem(key) ?? '[]') as unknown;
      return Array.isArray(v) ? (v as LedgerEntry[]) : [];
    } catch {
      return [];
    }
  };
  return {
    read,
    append: (e) => storage.setItem(key, JSON.stringify([...read(), ...e])),
  };
}

export interface Reservation {
  readonly id: string;
  readonly amount: number;
  readonly state: 'open' | 'settled' | 'refunded';
  readonly used: number;
}

export class CreditLedger {
  constructor(
    private readonly store: LedgerStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}
  history(): readonly LedgerEntry[] {
    return this.store.read();
  }
  /** Credits that can be spent now (reservations already taken out). */
  balance(): number {
    return this.store.read().reduce((s, e) => s + e.delta, 0);
  }
  /** Credits held by open reservations. */
  held(): number {
    return [...this.reservations().values()]
      .filter((r) => r.state === 'open')
      .reduce((s, r) => s + r.amount, 0);
  }
  /** Credits used (settled) since `sinceIso`. */
  usedSince(sinceIso: string): number {
    return this.store
      .read()
      .filter((e) => e.type === 'settle' && e.at >= sinceIso)
      .reduce((s, e) => s + (e.used ?? 0), 0);
  }
  reservations(): Map<string, Reservation> {
    const map = new Map<string, Reservation>();
    for (const e of this.store.read()) {
      if (e.type === 'reserve')
        map.set(e.id, { id: e.id, amount: -e.delta, state: 'open', used: 0 });
      else if (e.reservationId && map.has(e.reservationId)) {
        const r = map.get(e.reservationId)!;
        if (e.type === 'settle')
          map.set(r.id, { ...r, state: 'settled', used: e.used ?? 0 });
        else if (e.type === 'refund' && r.state === 'open')
          map.set(r.id, { ...r, state: 'refunded' });
      }
    }
    return map;
  }
  private byKey(key: string): LedgerEntry | undefined {
    return this.store.read().find((e) => e.key === key);
  }
  private row(
    type: LedgerType,
    delta: number,
    key: string,
    note: string,
    extra: Partial<LedgerEntry> = {},
    offset = 0,
  ): LedgerEntry {
    return {
      id: `${type}-${this.store.read().length + offset + 1}-${hashKey(key)}`,
      at: this.now(),
      type,
      delta,
      key,
      note,
      ...extra,
    };
  }
  grant(amount: number, key: string, note = ''): LedgerEntry {
    const seen = this.byKey(key);
    if (seen) return seen;
    const e = this.row('grant', Math.max(0, Math.round(amount)), key, note);
    this.store.append([e]);
    return e;
  }
  adjust(delta: number, key: string, note = ''): LedgerEntry {
    const seen = this.byKey(key);
    if (seen) return seen;
    const e = this.row('adjust', Math.round(delta), key, note);
    this.store.append([e]);
    return e;
  }
  /** Hold `amount` credits. Throws `shortage` when the balance is too low. */
  reserve(amount: number, key: string, note = ''): Reservation {
    const seen = this.byKey(key);
    if (seen?.type === 'reserve') return this.reservations().get(seen.id)!;
    const need = Math.max(0, Math.ceil(amount));
    const have = this.balance();
    if (need > have)
      throw new GatewayError(
        'shortage',
        `This needs ${need} credits and you have ${have}.`,
        { need, have, short: need - have },
      );
    const e = this.row('reserve', -need, key, note);
    this.store.append([e]);
    return { id: e.id, amount: need, state: 'open', used: 0 };
  }
  /**
   * Close a reservation at what was really used (never more than was held);
   * the difference comes back. Settling twice changes nothing.
   */
  settle(reservationId: string, used: number, key: string): Reservation {
    const r = this.reservations().get(reservationId);
    if (!r) throw new Error(`No reservation ${reservationId}`);
    if (r.state !== 'open' || this.byKey(key)) return r;
    const u = Math.min(r.amount, Math.max(0, Math.ceil(used)));
    const rows = [
      this.row('settle', 0, key, 'used', { reservationId, used: u }),
    ];
    if (r.amount > u)
      rows.push(
        this.row(
          'refund',
          r.amount - u,
          `${key}:diff`,
          'unused credits back',
          { reservationId },
          1,
        ),
      );
    this.store.append(rows);
    return this.reservations().get(reservationId)!;
  }
  /** Give the whole reservation back (a failure). Twice changes nothing. */
  refund(reservationId: string, key: string, note = 'failed'): Reservation {
    const r = this.reservations().get(reservationId);
    if (!r) throw new Error(`No reservation ${reservationId}`);
    if (r.state !== 'open' || this.byKey(key)) return r;
    this.store.append([
      this.row('refund', r.amount, key, note, { reservationId }),
    ]);
    return this.reservations().get(reservationId)!;
  }
}
const hashKey = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
};
