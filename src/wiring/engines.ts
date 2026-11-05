// P3-WIRING: the ONE place Part 1's browser engines (memory, Studio) are wired in.
// P3-INTEGRATION: the entitlement service is server code (node:crypto) and is
// imported by the server directly; it must never be reachable from here. They are loaded
// lazily with import(), so this part compiles and runs its tests before Part 1
// is merged; a missing module gives a clear error instead of a crash.
import type { MemoryEngine, StudioEngine } from '../contracts/p3';

export interface Engines {
  readonly memory: MemoryEngine;
  readonly studio: StudioEngine;
}
type Loader = (path: string) => Promise<Record<string, unknown>>;
// import.meta.glob is resolved by Vite (browser build, dev server, the server's
// runner and Vitest): a file that does not exist yet is simply absent from the
// map, so this compiles and builds before Part 1 is merged.
const PART1 = import.meta.glob([
  '../memory/index.ts',
  '../studio-engine/index.ts',
]);
const load: Loader = async (path) => {
  const get = PART1[path];
  if (!get) throw new Error(`missing ${path}`);
  return (await get()) as Record<string, unknown>;
};

export class EngineMissingError extends Error {
  constructor(readonly module: string) {
    super(
      `${module} is not built yet (Part 1, codex/p3-engine). Merge Part 1 before using the real services.`,
    );
    this.name = 'EngineMissingError';
  }
}
async function pick<T>(loader: Loader, path: string, name: string): Promise<T> {
  let mod: Record<string, unknown>;
  try {
    mod = await loader(path);
  } catch {
    throw new EngineMissingError(path);
  }
  const f = mod[name];
  if (typeof f !== 'function')
    throw new EngineMissingError(`${path} (${name})`);
  return (f as () => T)();
}
/** Part 1's memory and Studio engines (browser and server). */
export async function loadEngines(loader: Loader = load): Promise<Engines> {
  const [memory, studio] = await Promise.all([
    pick<MemoryEngine>(loader, '../memory/index.ts', 'createMemoryEngine'),
    pick<StudioEngine>(
      loader,
      '../studio-engine/index.ts',
      'createStudioEngine',
    ),
  ]);
  return { memory, studio };
}
