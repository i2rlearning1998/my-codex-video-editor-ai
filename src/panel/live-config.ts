// P2-R2 (P2B-14): where the panel and the website read the live Platform
// Config: the gateway server, else Supabase, else this browser's local
// source. Each falls back to its last good copy, then the built-in default.
import { cloudConfig } from '../cloud/backend';
import {
  localConfigSource,
  serverConfigSource,
  supabaseConfigSource,
  type ConfigVersion,
} from '../platform-config';

type KV = Pick<Storage, 'getItem' | 'setItem'>;
/** VITE_GATEWAY_URL, or in dev and e2e builds a page-provided value. */
export function gatewayBase(): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const page = (globalThis as { __AIVE_GATEWAY_URL__?: string })
    .__AIVE_GATEWAY_URL__;
  return (
    ((env.DEV || env.MODE === 'e2e') && page) || env.VITE_GATEWAY_URL || null
  );
}
export function liveConfig(storage: KV | null): Promise<ConfigVersion> {
  const gateway = gatewayBase();
  const cloud = cloudConfig();
  return (
    gateway
      ? serverConfigSource({ base: gateway, storage })
      : cloud
        ? supabaseConfigSource({
            url: cloud.url,
            anonKey: cloud.anonKey,
            storage,
          })
        : localConfigSource(storage)
  ).getLive();
}
