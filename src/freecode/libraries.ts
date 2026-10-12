import type { Library } from './types';
import helperSource from './vendor/helpers.txt?raw';
export { helperSource };
const loaders = {
  three: () => import('./vendor/three.txt?raw'),
  pixi: () => import('./vendor/pixi.txt?raw'),
  lottie: () => import('./vendor/lottie.txt?raw'),
};
const cache = new Map<Library, Promise<string>>();
async function decode(value: string): Promise<string> {
  const bytes = Uint8Array.from(atob(value.trim()), (c) => c.charCodeAt(0));
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).text();
}
export async function loadLibraries(libs: readonly Library[]): Promise<string> {
  return (
    await Promise.all(
      libs.map((name) => {
        let promise = cache.get(name);
        if (!promise) {
          promise = loaders[name]().then((m) => decode(m.default));
          cache.set(name, promise);
          promise.catch(() => cache.delete(name));
        }
        return promise;
      }),
    )
  ).join('\n;\n');
}
