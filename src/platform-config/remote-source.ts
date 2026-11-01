// P2-R2 (P2B-14): the Platform Config from the cloud. `supabaseConfigSource`
// reads and writes the `config_versions` table through Supabase's REST API
// (row-level security: everyone reads the live row, an admin writes);
// `serverConfigSource` reads the gateway server's `/v1/config`. Both keep the
// last good copy in this browser (by version) and fall back to it, then to
// the built-in default, so a bad or unreachable live config never stops the
// panel.
import { defaultConfig } from './defaults';
import { parseConfig, type ConfigSource } from './source';
import type { ConfigVersion } from './schema';

type KV = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
};
export const CONFIG_CACHE_KEY = 'aive.platformConfig.cache';

/** Keeps the last good live version; answers it when the cloud cannot. */
export function lastGood(
  storage: KV | null,
  now: () => string = () => new Date().toISOString(),
) {
  const read = (): ConfigVersion | null => {
    try {
      const v = JSON.parse(
        storage?.getItem(CONFIG_CACHE_KEY) ?? 'null',
      ) as ConfigVersion | null;
      const p = v ? parseConfig(v.config) : null;
      return v && p?.ok ? { ...v, config: p.config } : null;
    } catch {
      return null;
    }
  };
  return {
    read,
    /** A fresh live version: kept when valid; else the last good one, else the default. */
    accept(
      raw: {
        version: number;
        config: unknown;
        savedAt?: string;
        note?: string;
      } | null,
    ): ConfigVersion {
      if (raw) {
        const p = parseConfig(raw.config);
        if (p.ok) {
          const v: ConfigVersion = {
            version: raw.version,
            savedAt: raw.savedAt ?? now(),
            note: raw.note ?? '',
            config: p.config,
          };
          try {
            storage?.setItem(CONFIG_CACHE_KEY, JSON.stringify(v));
          } catch {
            /* storage full: the copy in memory is still used */
          }
          return v;
        }
      }
      return (
        read() ?? {
          version: 0,
          savedAt: now(),
          note: 'built-in default',
          config: defaultConfig(),
        }
      );
    },
  };
}

interface Row {
  version: number;
  config: unknown;
  note?: string;
  saved_at?: string;
  live?: boolean;
}
/** Supabase REST (PostgREST) source; `token` is a signed-in admin's JWT for writes. */
export function supabaseConfigSource(o: {
  url: string;
  anonKey: string;
  token?: () => Promise<string | null>;
  storage: KV | null;
  fetch?: typeof fetch;
}): ConfigSource {
  const f = o.fetch ?? fetch;
  const cache = lastGood(o.storage);
  const rest = `${o.url.replace(/\/$/, '')}/rest/v1`;
  const headers = async () => ({
    apikey: o.anonKey,
    authorization: `Bearer ${(await o.token?.()) ?? o.anonKey}`,
    'content-type': 'application/json',
  });
  const rows = async (query: string): Promise<Row[]> => {
    const res = await f(`${rest}/config_versions?${query}`, {
      headers: await headers(),
    });
    if (!res.ok) throw new Error('The settings could not be read.');
    return (await res.json()) as Row[];
  };
  const asVersion = (r: Row): ConfigVersion => ({
    version: r.version,
    savedAt: r.saved_at ?? '',
    note: r.note ?? '',
    config: r.config as ConfigVersion['config'],
  });
  return {
    async getLive() {
      try {
        const [live] = await rows('select=*&live=eq.true');
        return cache.accept(
          live
            ? {
                version: live.version,
                config: live.config,
                ...(live.note ? { note: live.note } : {}),
                ...(live.saved_at ? { savedAt: live.saved_at } : {}),
              }
            : null,
        );
      } catch {
        return cache.accept(null);
      }
    },
    async list() {
      return (await rows('select=*&order=version')).map(asVersion);
    },
    async save(draft, note) {
      const p = parseConfig(draft);
      if (!p.ok) throw new Error(`Config refused: ${p.errors.join('; ')}`);
      const all = await rows('select=version&order=version.desc&limit=1');
      const version = (all[0]?.version ?? 0) + 1;
      const res = await f(`${rest}/config_versions`, {
        method: 'POST',
        headers: { ...(await headers()), prefer: 'return=minimal' },
        body: JSON.stringify({ version, config: p.config, note, live: false }),
      });
      if (!res.ok) throw new Error('Only the owner can change the settings.');
      return {
        version,
        savedAt: new Date().toISOString(),
        note,
        config: p.config,
      };
    },
    async publish(version) {
      const res = await f(`${rest}/rpc/set_live_config`, {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({ target: version }),
      });
      if (!res.ok) throw new Error('Only the owner can publish the settings.');
      return this.getLive();
    },
    async rollback(version) {
      return this.publish(version);
    },
  };
}

/** The gateway server's public `/v1/config` (read only: Admin writes through the server). */
export function serverConfigSource(o: {
  base: string;
  storage: KV | null;
  fetch?: typeof fetch;
}): Pick<ConfigSource, 'getLive'> {
  const cache = lastGood(o.storage);
  return {
    async getLive() {
      try {
        const res = await (o.fetch ?? fetch)(
          `${o.base.replace(/\/$/, '')}/v1/config`,
        );
        if (!res.ok) throw new Error('unreadable');
        const body = (await res.json()) as { version: number; config: unknown };
        return cache.accept(body.version > 0 ? body : null);
      } catch {
        return cache.accept(null);
      }
    },
  };
}
