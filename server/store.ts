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
} from 'node:fs';
import path from 'node:path';
import type { ConfigVersion } from '../src/platform-config';
import type { LedgerEntry, UsageRow } from '../src/gateway';

export interface Profile {
  readonly id: string;
  readonly email: string;
  plan: string;
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

export interface Store {
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
}

interface Data {
  profiles: Record<string, Profile>;
  ledger: Record<string, LedgerEntry[]>;
  usage: UsageRow[];
  exports: Record<string, { month: string; kind: string }[]>;
  counters: Record<string, Partial<Record<CounterName, number>>>;
  configs: ConfigVersion[];
  live: number;
}
const empty = (): Data => ({
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
    private data: Data,
    private persist: (d: Data) => void,
  ) {}
  private save() {
    this.persist(this.data);
  }
  async profile(u: string) {
    const p = this.data.profiles[u];
    return p ? { ...p } : null;
  }
  async saveProfile(p: Profile) {
    this.data.profiles[p.id] = { ...p };
    this.save();
  }
  async ledger(u: string) {
    return [...(this.data.ledger[u] ?? [])];
  }
  async appendLedger(u: string, rows: readonly LedgerEntry[]) {
    const have = this.data.ledger[u] ?? [];
    const keys = new Set(have.map((r) => r.key));
    for (const r of rows) {
      if (keys.has(r.key)) throw new DuplicateKeyError(r.key);
      keys.add(r.key);
    }
    this.data.ledger[u] = [...have, ...rows];
    this.save();
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
  let data = empty();
  if (existsSync(file))
    try {
      data = {
        ...empty(),
        ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<Data>),
      };
    } catch {
      throw new Error(`The server data file ${file} could not be read.`);
    }
  return new JsonStore('file', data, (d) => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(d));
    renameSync(tmp, file);
  });
}
