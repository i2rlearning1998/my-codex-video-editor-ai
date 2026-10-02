// H5: loads and validates the library manifest once per session. The file is
// static (public/library/index.json); a failure is reported, never thrown at
// start-up, so the editor works without the library.
import { parseLibrary, type LibraryManifest } from './schema';

let loading: Promise<LibraryManifest> | null = null;
export function loadLibrary(
  url = new URL('library/index.json', document.baseURI).href,
): Promise<LibraryManifest> {
  loading ??= fetch(url)
    .then((response) => {
      if (!response.ok)
        throw new Error(`Library not found (${response.status})`);
      return response.json() as Promise<unknown>;
    })
    .then(parseLibrary)
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}
