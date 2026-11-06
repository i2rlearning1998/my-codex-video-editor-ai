// P2-R2 (P2B-03): where the server keeps people's data. One interface, three
// implementations: MemoryStore (tests), FileStore (offline, one JSON file)
// and SupabaseStore (server/supabase-store.ts, service-role key from env).
// The same contract tests run on all of them (tests/server/store.test.ts).
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { nextAuditRow } from './admin/audit';
import type { AuditInput } from './admin/audit';
import type { AuditRow, EmergencySwitches } from '../src/contracts/p3';
import {
  defaultEmergency,
  paymentRow,
  type P3Store,
  type SecretRecord,
  type PaymentRecord,
  type PaymentCommit,
  type AdminChange,
  type Operation,
} from './payments/records';
import type { ConfigVersion } from '../src/platform-config';
import type { LedgerEntry, UsageRow } from '../src/gateway';

export interface Profile {
  readonly id: string;
  readonly email: string;
  plan: string;
  suspended?: boolean;
  locale: 'en' | 'hi';
  brandKit: Record<string, unknown>;
  readonly createdAt: string;
}
export type CounterName = 'storageMb' | 'voiceClones' | 'projects';

/** Thrown when an append would repeat an idempotency key for a person. */
export class DuplicateKeyError extends Error {
  constructor(readonly key: string) {
    super(`duplicate key ${key}`);
    this.name = 'DuplicateKeyError';
  }
}

export interface Store extends P3Store {
  readonly kind: 'memory' | 'file' | 'supabase';
  profile(userId: string): Promise<Profile | null>;
  saveProfile(p: Profile): Promise<void>;
  ledger(userId: string): Promise<LedgerEntry[]>;
  /** Appends rows; a key already used by this person throws DuplicateKeyError and writes nothing. */
  appendLedger(userId: string, rows: readonly LedgerEntry[]): Promise<void>;
  usage(userId: string, sinceIso: string): Promise<UsageRow[]>;
  appendUsage(row: UsageRow): Promise<void>;
  /** Exports counted per person per month (YYYY-MM). */
  exportsCount(userId: string, month: string): Promise<number>;
  addExport(userId: string, month: string, kind: string): Promise<number>;
  counter(userId: string, name: CounterName): Promise<number>;
  setCounter(userId: string, name: CounterName, value: number): Promise<void>;
  configVersions(): Promise<ConfigVersion[]>;
  liveConfigVersion(): Promise<number>;
  saveConfigVersion(v: ConfigVersion): Promise<void>;
  setLiveConfig(version: number): Promise<void>;
  /** P4 security: what a person really stores, counted by the database (not the browser). */
  measureUsage?(
    userId: string,
  ): Promise<{ storageMb: number; projects: number }>;
}

interface Data {
  payments: PaymentRecord[];
  audit: AuditRow[];
  flags: Record<string, string[]>;
  emergency: EmergencySwitches;
  secrets: Record<string, SecretRecord>;
  daily: Record<string, number>;
  operations: Record<string, Operation>;
  profiles: Record<string, Profile>;
  ledger: Record<string, LedgerEntry[]>;
  usage: UsageRow[];
  exports: Record<string, { month: string; kind: string }[]>;
  counters: Record<string, Partial<Record<CounterName, number>>>;
  configs: ConfigVersion[];
  live: number;
}
const empty = (): Data => ({
  payments: [],
  audit: [],
  flags: {},
  emergency: defaultEmergency(),
  secrets: {},
  daily: {},
  operations: {},
  profiles: {},
  ledger: {},
  usage: [],
  exports: {},
  counters: {},
  configs: [],
  live: 0,
});

class JsonStore implements Store {
  constructor(
    readonly kind: 'memory' | 'file',
    private cache: Data,
    private persist: (d: Data) => void,
    /** A file store re-reads the file when another process (the Owner App) changed it. */
    private readonly reload?: () => Data | null,
  ) {}
  private get data(): Data {
    const fresh = this.reload?.();
    if (fresh) this.cache = fresh;
    return this.cache;
  }
  private set data(d: Data) {
    this.cache = d;
  }
  private save() {
    this.persist(this.data);
  }
  private atomic<T>(change: (draft: Data) => T): T {
    const draft = structuredClone(this.data);
    const result = change(draft);
    this.persist(draft);
    this.data = draft;
    return structuredClone(result);
  }
  async profiles() {
    return structuredClone(Object.values(this.data.profiles));
  }
  async payments(u?: string) {
    return structuredClone(
      this.data.payments.filter((p) => u === undefined || p.event.userId === u),
    );
  }
  async commitPayment(input: PaymentCommit) {
    return this.atomic((d) => {
      if (!d.profiles[input.event.userId])
        throw new Error('The payment user does not exist.');
      const u = input.event.userId;
      const out = paymentRow(input, d.payments, d.ledger[u] ?? []);
      if (!out.result.duplicate) {
        d.payments.push(out.record);
        if (out.row) (d.ledger[u] ??= []).push(out.row);
        if (input.event.type === 'subscription.renewed')
          d.profiles[u]!.plan = input.event.itemId;
      }
      return out.result;
    });
  }
  async appendAudit(input: AuditInput) {
    return this.atomic((d) => {
      const row = nextAuditRow(d.audit.at(-1) ?? null, input);
      d.audit.push(row);
      return row;
    });
  }
  async audit() {
    return structuredClone(this.data.audit);
  }
  async flags(u: string) {
    return [...(this.data.flags[u] ?? [])];
  }
  async emergency() {
    return structuredClone(this.data.emergency);
  }
  async commitAdmin(input: AdminChange) {
    return this.atomic((d) => {
      const fingerprint = JSON.stringify({
        ...input,
        audit: { ...input.audit, at: undefined },
      });
      const old = d.operations[input.key];
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new Error(
            'The request key was already used for a different change.',
          );
        return false;
      }
      const u = input.userId;
      if (u) {
        const p = d.profiles[u];
        if (!p) throw new Error('The person was not found.');
        if (input.plan !== undefined) p.plan = input.plan;
        if (input.suspended !== undefined) p.suspended = input.suspended;
        if (input.flag) {
          const flags = new Set(d.flags[u] ?? []);
          if (input.flag.on) flags.add(input.flag.name);
          else flags.delete(input.flag.name);
          d.flags[u] = [...flags].sort();
        }
        if (input.delta !== undefined) {
          const rows = (d.ledger[u] ??= []);
          if (rows.reduce((s, r) => s + r.delta, 0) + input.delta < 0)
            throw new Error('That change would spend unavailable credits.');
          rows.push({
            id: input.key,
            key: input.key,
            type: 'adjust',
            delta: input.delta,
            note: input.audit.detail.reason as string,
            at: input.audit.at,
          });
        }
      }
      if (input.emergency) d.emergency = input.emergency;
      d.audit.push(nextAuditRow(d.audit.at(-1) ?? null, input.audit));
      d.operations[input.key] = {
        key: input.key,
        fingerprint,
        result: { ok: true },
      };
      return true;
    });
  }
  async putSecret(name: string, record: SecretRecord) {
    this.atomic((d) => {
      d.secrets[name] = structuredClone(record);
    });
  }
  async getSecret(name: string) {
    return structuredClone(this.data.secrets[name] ?? null);
  }
  async listSecrets() {
    return structuredClone(this.data.secrets);
  }
  async deleteSecret(name: string) {
    this.atomic((d) => {
      delete d.secrets[name];
    });
  }
  async dailyCount(u: string, name: string, day: string) {
    return this.data.daily[JSON.stringify([u, name, day])] ?? 0;
  }
  async bumpDaily(
    u: string,
    name: string,
    day: string,
    limit = Number.MAX_SAFE_INTEGER,
  ) {
    return this.atomic((d) => {
      const k = JSON.stringify([u, name, day]),
        n = d.daily[k] ?? 0;
      if (n >= limit) return -1;
      return (d.daily[k] = n + 1);
    });
  }
  async claimOperation(key: string, fingerprint: string) {
    return this.atomic((d) => {
      const old = d.operations[key];
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new Error(
            'The request key was already used for a different operation.',
          );
        return { claimed: false, operation: old };
      }
      const operation = { key, fingerprint, result: null };
      d.operations[key] = operation;
      return { claimed: true, operation };
    });
  }
  async getOperation(key: string) {
    return structuredClone(this.data.operations[key] ?? null);
  }
  async finishOperation(
    key: string,
    result: Record<string, unknown>,
    audit?: AuditInput,
  ) {
    this.atomic((d) => {
      const op = d.operations[key];
      if (!op) throw new Error('The operation was not found.');
      if (op.result) return;
      op.result = result;
      if (audit) d.audit.push(nextAuditRow(d.audit.at(-1) ?? null, audit));
    });
  }
  async profile(u: string) {
    const p = this.data.profiles[u];
    return p ? structuredClone(p) : null;
  }
  async saveProfile(p: Profile) {
    this.data.profiles[p.id] = { ...p };
    this.save();
  }
  async ledger(u: string) {
    return structuredClone(this.data.ledger[u] ?? []);
  }
  async appendLedger(u: string, rows: readonly LedgerEntry[]) {
    this.atomic((d) => {
      const have = d.ledger[u] ?? [],
        keys = new Set(have.map((r) => r.key));
      for (const row of rows) {
        if (keys.has(row.key)) throw new DuplicateKeyError(row.key);
        keys.add(row.key);
      }
      if (
        rows.some((r) => r.delta < 0) &&
        [...have, ...rows].reduce((sum, r) => sum + r.delta, 0) < 0
      )
        throw new Error('The available credits changed; try again.');
      d.ledger[u] = [...have, ...structuredClone(rows)];
    });
  }
  async usage(u: string, since: string) {
    return this.data.usage.filter((r) => r.userId === u && r.at >= since);
  }
  async appendUsage(row: UsageRow) {
    this.data.usage.push(row);
    // Keep the file small: a few days of rows are enough for the limits.
    if (this.data.usage.length > 50_000)
      this.data.usage = this.data.usage.slice(-40_000);
    this.save();
  }
  async exportsCount(u: string, month: string) {
    return (this.data.exports[u] ?? []).filter((e) => e.month === month).length;
  }
  async addExport(u: string, month: string, kind: string) {
    (this.data.exports[u] ??= []).push({ month, kind });
    this.save();
    return this.exportsCount(u, month);
  }
  async counter(u: string, name: CounterName) {
    return this.data.counters[u]?.[name] ?? 0;
  }
  async setCounter(u: string, name: CounterName, value: number) {
    (this.data.counters[u] ??= {})[name] = Math.max(0, value);
    this.save();
  }
  async configVersions() {
    return [...this.data.configs];
  }
  async liveConfigVersion() {
    return this.data.live;
  }
  async saveConfigVersion(v: ConfigVersion) {
    if (this.data.configs.some((c) => c.version === v.version))
      throw new DuplicateKeyError(`config ${v.version}`);
    this.data.configs.push(v);
    this.save();
  }
  async setLiveConfig(version: number) {
    if (version !== 0 && !this.data.configs.some((c) => c.version === version))
      throw new Error(`No config version ${version}`);
    this.data.live = version;
    this.save();
  }
}

export const memoryStore = (): Store =>
  new JsonStore('memory', empty(), () => {});

/** One JSON file, written atomically (a temporary file, then a rename). */
export function fileStore(file: string): Store {
  mkdirSync(path.dirname(file), { recursive: true });
  const read = (): Data => ({
    ...empty(),
    ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<Data>),
  });
  const stamp = () => {
    const s = statSync(file);
    return `${s.mtimeMs}:${s.size}`;
  };
  let data = empty();
  let seen = '';
  if (existsSync(file))
    try {
      data = read();
      seen = stamp();
    } catch {
      throw new Error(`The server data file ${file} could not be read.`);
    }
  return new JsonStore(
    'file',
    data,
    (d) => {
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(d));
      renameSync(tmp, file);
      seen = stamp();
    },
    () => {
      // The gateway server and the Owner App's admin API share this file in
      // local mode; pick up the other one's changes before every operation.
      if (!existsSync(file)) return null;
      const now = stamp();
      if (now === seen) return null;
      const fresh = read();
      seen = now;
      return fresh;
    },
  );
}
