import type { Library } from './types';
/** F2 supplies pinned local bundles; never resolve arbitrary names or URLs. */
export async function loadLibraries(libs: readonly Library[]): Promise<string> {
  if (libs.length) throw Error('Library bundles are not installed yet.');
  return '';
}
export const helperSource = 'return Object.freeze({});';
