// X1: the code runtimes. Tier B blocks render through the `src/blocks`
// sandbox worker; Tier C free code through a FreeCodeRuntime. Both are
// opened as a FreeCodeSession, so the bake path is one.
import { blockMeta } from './meta';
import { createSandbox } from '../blocks/sandbox/client';
import { FakeRuntime } from './fake-runtime';
import { STARTER_PREFIX } from './tier-a';
import type { CompiledBlock } from '../blocks/sandbox/compile';
import type {
  FreeCodeOpenOptions,
  FreeCodeRuntime,
  FreeCodeSession,
} from './runtime-types';
import type { CodeTier } from './meta';

let realRuntime: (() => Promise<FreeCodeRuntime>) | null = null;
/** X5 connects the real sandboxed runtime here. */
export function setFreeCodeRuntime(
  load: (() => Promise<FreeCodeRuntime>) | null,
): void {
  realRuntime = load;
}
const fake = new FakeRuntime();
/** The Tier C runtime, or null when none is available. */
export async function freeCodeRuntime(): Promise<FreeCodeRuntime | null> {
  if (
    typeof window !== 'undefined' &&
    (window as { __AIVE_E2E_FREECODE__?: string }).__AIVE_E2E_FREECODE__ ===
      'fake'
  )
    return fake;
  return realRuntime ? realRuntime() : null;
}

/** A Tier B block as a session: each frame is drawn by the sandbox worker. */
export async function openBlockSession(
  source: string,
  opts: FreeCodeOpenOptions,
): Promise<FreeCodeSession> {
  // A starter block named by a Composition Spec (`@block:<id>`).
  const starterId = source.startsWith(STARTER_PREFIX)
    ? source.slice(STARTER_PREFIX.length)
    : null;
  let request: { compiled: CompiledBlock } | { blockId: string };
  let meta: ReturnType<typeof blockMeta>;
  if (starterId) {
    const { getBlock } = await import('../blocks/starters');
    const block = getBlock(starterId);
    if (!block) throw new Error(`The block "${starterId}" is not available.`);
    request = { blockId: starterId };
    meta = blockMeta(block);
  } else {
    // The compiler carries the TypeScript parser: loaded on first use only.
    const { compileBlock } = await import('../blocks/sandbox/compile');
    const compiled = compileBlock(source);
    if (!compiled.ok) throw new Error(compiled.error);
    request = { compiled: compiled.value };
    meta = blockMeta(compiled.value.info);
  }
  const client = createSandbox(2000);
  const frame = async (index: number) => {
    const reply = await client.render({
      ...request,
      t: index / opts.fps,
      size: { width: opts.width, height: opts.height },
      params: opts.params,
      seed: opts.seed,
      pixels: true,
    });
    if (!reply.ok || !reply.pixels)
      throw new Error(reply.error ?? 'The block drew no frame.');
    return createImageBitmap(
      new ImageData(
        new Uint8ClampedArray(reply.pixels),
        reply.width!,
        reply.height!,
      ),
    );
  };
  return {
    meta,
    renderFrame: frame,
    thumbnail: () =>
      frame(
        Math.min(
          Math.ceil(opts.duration * opts.fps) - 1,
          Math.floor(meta.thumbnailTime * opts.fps),
        ),
      ),
    dispose: () => client.dispose(),
  };
}

/** Opens either tier. */
export async function openCodeSession(
  tier: CodeTier,
  source: string,
  opts: FreeCodeOpenOptions,
): Promise<FreeCodeSession> {
  if (tier === 'B') return openBlockSession(source, opts);
  const runtime = await freeCodeRuntime();
  if (!runtime)
    throw new Error(
      'Full mode code cannot run here: the sandboxed runtime is not available.',
    );
  return runtime.open(source, opts);
}
