// P2-R2 (P2B-04): per-person state on the server. Each person has one lock;
// every change to their credits runs inside it, so parallel requests can
// never spend the same credits twice. The gateway's CreditLedger (src/gateway,
// unchanged) works on an in-memory copy of the person's rows that is loaded
// from the Store once and written back after every change.
import {
  CreditLedger,
  type LedgerEntry,
  type LedgerStore,
  type UsageLog,
  type UsageRow,
} from '../src/gateway';
import type { Store } from './store';

class Lock {
  private tail: Promise<void> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

interface Person {
  rows: LedgerEntry[];
  pending: LedgerEntry[];
  usage: UsageRow[];
  pendingUsage: UsageRow[];
  ledger: CreditLedger;
  lock: Lock;
}

export class People {
  private people = new Map<string, Promise<Person>>();
  constructor(
    private readonly store: Store,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private load(userId: string): Promise<Person> {
    let p = this.people.get(userId);
    if (!p) {
      p = (async () => {
        const rows = await this.store.ledger(userId);
        const usage = await this.store.usage(
          userId,
          new Date(this.now() - 2 * 864e5).toISOString(),
        );
        const person = {
          rows,
          pending: [],
          usage,
          pendingUsage: [],
          lock: new Lock(),
        } as unknown as Person;
        const ledgerStore: LedgerStore = {
          read: () => person.rows,
          append: (entries) => {
            person.rows.push(...entries);
            person.pending.push(...entries);
          },
        };
        person.ledger = new CreditLedger(ledgerStore, () =>
          new Date(this.now()).toISOString(),
        );
        return person;
      })();
      this.people.set(userId, p);
      p.catch(() => this.people.delete(userId));
    }
    return p;
  }

  /** Runs `fn` with the person's ledger under their lock, then writes the new rows. */
  async withLedger<T>(
    userId: string,
    fn: (l: CreditLedger) => T | Promise<T>,
  ): Promise<T> {
    const person = await this.load(userId);
    return person.lock.run(async () => {
      try {
        const out = await fn(person.ledger);
        await this.flush(userId, person);
        return out;
      } catch (e) {
        await this.flush(userId, person).catch(() => undefined);
        throw e;
      }
    });
  }

  private async flush(userId: string, person: Person) {
    if (person.pending.length) {
      const rows = person.pending.splice(0);
      try {
        await this.store.appendLedger(userId, rows);
      } catch (e) {
        // The store refused: forget the copy so the next request reads the truth.
        this.people.delete(userId);
        throw e;
      }
    }
    if (person.pendingUsage.length)
      for (const row of person.pendingUsage.splice(0))
        await this.store.appendUsage(row);
  }

  /** The gateway's synchronous view of a person (only valid after `ready`). */
  ledgerNow(userId: string): CreditLedger {
    const p = this.loaded.get(userId);
    if (!p) throw new Error(`State for ${userId} is not loaded`);
    return p.ledger;
  }
  private loaded = new Map<string, Person>();
  async ready(userId: string) {
    this.loaded.set(userId, await this.load(userId));
  }
  usageLog(): UsageLog {
    return {
      append: (row) => {
        const p = this.loaded.get(row.userId);
        if (!p) return void this.store.appendUsage(row);
        p.usage.push(row);
        p.pendingUsage.push(row);
      },
      list: (u) =>
        u
          ? (this.loaded.get(u)?.usage ?? [])
          : [...this.loaded.values()].flatMap((p) => p.usage),
    };
  }
  /** Writes usage rows a call made outside a ledger change. */
  async flushUsage(userId: string) {
    const p = this.loaded.get(userId);
    if (p) await p.lock.run(() => this.flush(userId, p));
  }
}
