// P2-R2 (P2B-14): the live Platform Config on the server, read from the Store
// (config_versions in Supabase), cached by version. A bad or unreadable live
// version falls back to the last good copy, then to the built-in default.
import {
  defaultConfig,
  parseConfig,
  type ConfigVersion,
  type PlatformConfig,
} from '../src/platform-config';
import type { Store } from './store';

export interface LiveConfig {
  readonly config: PlatformConfig;
  readonly version: number;
}
export function storeConfig(
  store: Store,
  now: () => number = () => Date.now(),
  ttlMs = 30_000,
) {
  let good: LiveConfig = { config: defaultConfig(), version: 0 };
  let checkedAt = -Infinity;
  const refresh = async (): Promise<LiveConfig> => {
    checkedAt = now();
    try {
      const live = await store.liveConfigVersion();
      if (live === good.version) return good;
      if (live === 0) return (good = { config: defaultConfig(), version: 0 });
      const v = (await store.configVersions()).find((c) => c.version === live);
      const r = v ? parseConfig(v.config) : null;
      if (r?.ok) good = { config: r.config, version: live };
    } catch {
      /* keep the last good copy */
    }
    return good;
  };
  return {
    /** The cached live config (refreshed in the background after `ttlMs`). */
    current: () => good,
    async get(): Promise<LiveConfig> {
      return now() - checkedAt > ttlMs ? refresh() : good;
    },
    refresh,
    /** Saves a new version (refused when invalid); optionally makes it live. */
    async save(
      draft: unknown,
      note: string,
      publish: boolean,
    ): Promise<ConfigVersion> {
      const r = parseConfig(draft);
      if (!r.ok)
        throw new Error(
          `The config was refused: ${r.errors.slice(0, 5).join('; ')}`,
        );
      const versions = await store.configVersions();
      const v: ConfigVersion = {
        version: Math.max(0, ...versions.map((x) => x.version)) + 1,
        savedAt: new Date(now()).toISOString(),
        note: note.slice(0, 200),
        config: r.config,
      };
      await store.saveConfigVersion(v);
      if (publish) await store.setLiveConfig(v.version);
      await refresh();
      return v;
    },
    async publish(version: number) {
      await store.setLiveConfig(version);
      return refresh();
    },
  };
}
export type ServerConfig = ReturnType<typeof storeConfig>;
