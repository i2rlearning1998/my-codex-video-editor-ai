// X1: the code runtimes. Tier B blocks render through the `src/blocks`
// sandbox worker; Tier C free code through a FreeCodeRuntime. Both are
// opened as a FreeCodeSession, so the bake path is one.
import { blockMeta, setCodeLibraryVersions } from './meta';
import libraryManifest from '../freecode/vendor/manifest.json';
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

/**
 * X5: Codex's sandboxed runtime (`src/freecode`), loaded on first use (its
 * validator carries the TypeScript parser and its libraries load per
 * `meta.libs`). Its types match runtime-types.ts structurally. A bake keeps
 * one session open for every frame, so the total budget is generous (20
 * minutes); each frame still has the runtime's 5 s watchdog.
 */
let loaded: Promise<FreeCodeRuntime> | null = null;
const sandboxed = () =>
  (loaded ??= import('../freecode/runtime').then((module): FreeCodeRuntime =>
    module.createFreeCodeRuntime({ totalTimeoutMs: 20 * 60 * 1000 }),
  ));
let realRuntime: (() => Promise<FreeCodeRuntime>) | null = sandboxed;
/** X5 connects the real sandboxed runtime here. */
export function setFreeCodeRuntime(
  load: (() => Promise<FreeCodeRuntime>) | null,
): void {
  realRuntime = load;
}
// The bundled library versions are part of every bake key (D-219).
setCodeLibraryVersions(
  libraryManifest.map((lib) => `${lib.name}@${lib.version}`).join(','),
);
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
  // A registered block is our own trusted code: draw it right here, with no
  // worker round trip and no pixel copy (several times faster to bake).
  if (starterId) {
    const { getBlock } = await import('../blocks/starters');
    const block = getBlock(starterId)!;
    const canvas = new OffscreenCanvas(opts.width, opts.height);
    const ctx = canvas.getContext('2d')!;
    const direct = async (index: number) => {
      ctx.clearRect(0, 0, opts.width, opts.height);
      block.render(
        ctx as unknown as Parameters<typeof block.render>[0],
        index / opts.fps,
        { width: opts.width, height: opts.height },
        opts.params,
        opts.seed,
      );
      return createImageBitmap(canvas);
    };
    return {
      meta,
      renderFrame: direct,
      thumbnail: () =>
        direct(
          Math.min(
            Math.ceil(opts.duration * opts.fps) - 1,
            Math.floor(meta.thumbnailTime * opts.fps),
          ),
        ),
      dispose: () => {},
    };
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
