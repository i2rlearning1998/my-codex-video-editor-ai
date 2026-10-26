// Phase 1 library: the editor's one catalog client. The address comes from
// `VITE_LIBRARY_CATALOG_URL` (in `npm run dev` the dev server's own local
// catalog at /__catalog/); the public key is a build-time constant
// (`__LIBRARY_PUBLIC_KEY__`). Dev and e2e builds may point a page at
// another catalog (`__AIVE_LIBRARY_CATALOG__`, `__AIVE_LIBRARY_KEY__`).
import { openMediaStore } from '../media/store';
import { openCache } from './cache';
import { LibraryClient } from './client';

export { LibraryClient } from './client';
export type { ClientStatus, RefreshResult } from './client';
export { catalogFileKey, catalogMediaKey } from './client';

export function libraryConfig(): { url: string | null; publicKey: string } {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  const page = globalThis as {
    __AIVE_LIBRARY_CATALOG__?: string;
    __AIVE_LIBRARY_KEY__?: string;
  };
  const testable = env.DEV === true || env.MODE === 'e2e';
  const fromEnv =
    typeof env.VITE_LIBRARY_CATALOG_URL === 'string' &&
    env.VITE_LIBRARY_CATALOG_URL
      ? env.VITE_LIBRARY_CATALOG_URL
      : null;
  const url =
    (testable ? page.__AIVE_LIBRARY_CATALOG__ : undefined) ??
    fromEnv ??
    (env.DEV === true ? '/__catalog/' : null);
  const publicKey =
    (testable ? page.__AIVE_LIBRARY_KEY__ : undefined) ??
    (typeof __LIBRARY_PUBLIC_KEY__ === 'string' ? __LIBRARY_PUBLIC_KEY__ : '');
  return {
    url: url
      ? new URL(url.endsWith('/') ? url : `${url}/`, location.href).href
      : null,
    publicKey,
  };
}

let client: LibraryClient | null = null;
/** The editor's catalog client (created on first use). */
export function libraryClient(): LibraryClient {
  if (!client) {
    const config = libraryConfig();
    client = new LibraryClient({
      url: config.url,
      publicKey: config.publicKey,
      cache: openCache(),
      media: openMediaStore(),
    });
  }
  return client;
}
