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

import { gatewayBase } from '../usage-report';

type KV = Pick<Storage, 'getItem' | 'setItem'>;
export { gatewayBase };
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
