// The editor and the panel use one account and one cloud. With Supabase's
// public settings it is Supabase; without them it is the local account backend
// the panel signs in to (same storage entry), so both always see one store.
import { cloudConfig, type CloudBackend } from './backend';

export async function makeCloudBackend(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): Promise<CloudBackend> {
  const config = cloudConfig();
  if (config) {
    const { createSupabaseBackend } = await import('./supabase');
    return createSupabaseBackend(config);
  }
  const { localAccountBackend, indexedBlobStore } = await import('./local');
  return localAccountBackend({ storage, blobs: indexedBlobStore() });
}
