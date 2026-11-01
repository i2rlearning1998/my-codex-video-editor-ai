// Where the config comes from. Readers depend on `ConfigSource` only: a local
// one now, a Supabase one in P2-C. Saved versions are immutable; Publish makes
// one live and Rollback makes an older one live again.
import { defaultConfig } from './defaults';
import { migrateConfig } from './migrate';
import {
  platformConfigSchema,
  type ConfigVersion,
  type PlatformConfig,
} from './schema';

export interface ConfigSource {
  /** The live config. Never throws: falls back to the built-in default. */
  getLive(): Promise<ConfigVersion>;
  list(): Promise<ConfigVersion[]>;
  save(draft: unknown, note: string): Promise<ConfigVersion>;
  publish(version: number): Promise<ConfigVersion>;
  rollback(version: number): Promise<ConfigVersion>;
}

export type ParseResult =
  { ok: true; config: PlatformConfig } | { ok: false; errors: string[] };
export function parseConfig(input: unknown): ParseResult {
  const r = platformConfigSchema.safeParse(migrateConfig(input));
  return r.success
    ? { ok: true, config: r.data }
    : {
        ok: false,
        errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      };
}

interface Stored {
  versions: ConfigVersion[];
  live: number;
}
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const KEY = 'aive.platformConfig';

/** Browser/local source. Same interface as the cloud one. */
export function localConfigSource(
  storage: Storage | null,
  now: () => string = () => new Date().toISOString(),
): ConfigSource {
  const builtIn = (): ConfigVersion => ({
    version: 0,
    savedAt: now(),
    note: 'built-in default',
    config: defaultConfig(),
  });
  const read = (): Stored => {
    try {
      const s = JSON.parse(storage?.getItem(KEY) ?? 'null') as Stored | null;
      if (s && Array.isArray(s.versions) && typeof s.live === 'number')
        return s;
    } catch {
      // unreadable: start again from the built-in default
    }
    return { versions: [], live: 0 };
  };
  const write = (s: Stored) => {
    try {
      storage?.setItem(KEY, JSON.stringify(s));
    } catch {
      // storage full: the previous good copy stays
    }
  };
  const find = (s: Stored, v: number) =>
    s.versions.find((x) => x.version === v);
  return {
    async getLive() {
      const s = read();
      const v = find(s, s.live);
      if (v) {
        const p = parseConfig(v.config);
        if (p.ok) return { ...v, config: p.config };
      }
      return builtIn();
    },
    async list() {
      return read().versions;
    },
    async save(draft, note) {
      const p = parseConfig(draft);
      if (!p.ok) throw new Error(`Config refused: ${p.errors.join('; ')}`);
      const s = read();
      const version = (s.versions.at(-1)?.version ?? 0) + 1;
      const v: ConfigVersion = {
        version,
        savedAt: now(),
        note,
        config: p.config,
      };
      write({ ...s, versions: [...s.versions, v] });
      return v;
    },
    async publish(version) {
      const s = read();
      const v = find(s, version);
      if (!v) throw new Error(`No config version ${version}`);
      write({ ...s, live: version });
      return v;
    },
    async rollback(version) {
      return this.publish(version);
    },
  };
}
