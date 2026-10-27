// H5: the library the panels read. Phase 1 (P1-22): it comes from the
// signed catalog through the library client (cached in this browser, the
// tiny fallback pack when there is neither a cache nor a catalog), in the
// same `LibraryManifest` shape as before, so the panels hardly change.
// A failure is reported, never thrown at start-up.
import type { LibraryManifest } from './schema';
import { libraryClient } from '../library-client';

export function loadLibrary(): Promise<LibraryManifest> {
  const client = libraryClient();
  return client.ready.then(() => client.manifest());
}

/** Called after the catalog changed (a refresh found a new version). */
export function onLibraryChange(listener: () => void): () => void {
  return libraryClient().onChange(listener);
}
