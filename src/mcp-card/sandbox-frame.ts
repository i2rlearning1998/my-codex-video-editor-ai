// ROUND-C3 (0.2): the nested sandbox of the export card. It runs in a child
// frame with sandbox="allow-scripts" only (an opaque origin, no storage) and
// under its own CSP with connect-src 'none' (server/mcp/card.ts), so the code
// of a graphic can draw and nothing else: no network, no storage, no access
// to the card or its bridge. It answers only its parent (the card), by
// postMessage: { type: 'open' } starts a session, { type: 'frame' } returns
// an ImageBitmap (transferred), { type: 'close' } ends it.
//
// Tier B blocks run here directly (a sandboxed frame cannot start a worker):
// their compiled body is instrumented with the free-code runtime's loop
// guard, and every name that reaches outside the drawing is shadowed.
// Tier C free code runs through the free-code runtime as in the editor (its
// own srcdoc child, its own guards and watchdog).
import type {
  FreeCodeOpenOptions,
  FreeCodeSession,
} from '../code-layer/runtime-types';
import type { CodeTier } from '../code-layer/meta';

type Request =
  | {
      type: 'open';
      id: number;
      tier: CodeTier;
      source: string;
      opts: FreeCodeOpenOptions;
    }
  | { type: 'frame'; id: number; index: number }
  | { type: 'close'; id: number };

const STARTER_PREFIX = '@block:';
/** One frame of a block may take this long before the guard stops it. */
const FRAME_BUDGET_MS = 2000;
const parentWindow = window.parent;
const reply = (value: unknown, transfer: Transferable[] = []) =>
  parentWindow.postMessage(value, '*', transfer);
let session: FreeCodeSession | null = null;

/** Names a block's code may not reach; passed as `undefined` parameters. */
const SHADOWED = [
  'window',
  'self',
  'globalThis',
  'parent',
  'top',
  'opener',
  'frames',
  'document',
  'location',
  'navigator',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
  'importScripts',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'postMessage',
  'BroadcastChannel',
  'MessageChannel',
  // `eval` cannot be a parameter name in strict code; the block checks
  // refuse it, and this frame cannot reach the network anyway.
  'Function',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
] as const;

async function openBlock(
  source: string,
  opts: FreeCodeOpenOptions,
): Promise<FreeCodeSession> {
  const [
    { blockMeta },
    { helpers },
    { frame: framed },
    params,
    { drawingFacade },
  ] = await Promise.all([
    import('../code-layer/meta'),
    import('../blocks/helpers'),
    import('../blocks/render'),
    import('../blocks/params'),
    import('../blocks/sandbox/facade'),
  ]);
  const canvas = new OffscreenCanvas(opts.width, opts.height);
  const ctx = canvas.getContext('2d')!;
  const size = Object.freeze({ width: opts.width, height: opts.height });
  let draw: (t: number) => void;
  let meta: FreeCodeSession['meta'];
  if (source.startsWith(STARTER_PREFIX)) {
    const { getBlock } = await import('../blocks/starters');
    const block = getBlock(source.slice(STARTER_PREFIX.length));
    if (!block) throw new Error('This drawing block is not available.');
    meta = blockMeta(block) as FreeCodeSession['meta'];
    draw = (t) =>
      block.render(
        ctx as unknown as Parameters<typeof block.render>[0],
        t,
        size,
        opts.params,
        opts.seed,
      );
  } else {
    const [{ compileBlock }, { instrument }] = await Promise.all([
      import('../blocks/sandbox/compile'),
      import('../freecode/instrument'),
    ]);
    const compiled = compileBlock(source);
    if (!compiled.ok) throw new Error(compiled.error);
    params.validateInfo(compiled.value.info);
    meta = blockMeta(compiled.value.info) as FreeCodeSession['meta'];
    const p = params.validateParams(compiled.value.info.params, opts.params);
    let deadline = 0;
    const guard = () => {
      if (performance.now() > deadline)
        throw new Error(
          'A code graphic took too long to draw one frame (more than 2 seconds).',
        );
    };
    const allocate = (n: unknown) => {
      if (typeof n === 'number' && n > 64 * 1024 * 1024)
        throw new Error('The graphic asked for too much memory.');
    };
    // Built once, with every outside name shadowed by an undefined parameter.
    const run = new Function(
      'ctx',
      't',
      'size',
      'params',
      'seed',
      'helpers',
      '__fcGuard',
      '__fcAllocate',
      ...SHADOWED,
      '"use strict";\n' + instrument(compiled.value.body),
    ) as (...args: unknown[]) => void;
    draw = (t) => {
      deadline = performance.now() + FRAME_BUDGET_MS;
      const drawing = drawingFacade(ctx as never);
      framed(ctx as never, size, () => {
        try {
          run(drawing.ctx, t, size, p, opts.seed, helpers, guard, allocate);
        } finally {
          drawing.finish();
        }
      });
    };
  }
  const render = async (index: number) => {
    ctx.clearRect(0, 0, opts.width, opts.height);
    draw(index / opts.fps);
    return canvas.transferToImageBitmap();
  };
  return {
    meta,
    renderFrame: render,
    thumbnail: () => render(0),
    dispose: () => {},
  };
}

async function openFree(
  source: string,
  opts: FreeCodeOpenOptions,
): Promise<FreeCodeSession> {
  const { createFreeCodeRuntime } = await import('../freecode/runtime');
  return createFreeCodeRuntime({ totalTimeoutMs: 20 * 60 * 1000 }).open(
    source,
    opts,
  );
}

window.addEventListener('message', (event: MessageEvent<Request>) => {
  // Only the card that made this frame may ask; everything else is ignored.
  if (event.source !== parentWindow) return;
  const request = event.data;
  if (!request || typeof request !== 'object') return;
  void (async () => {
    try {
      if (request.type === 'open') {
        session?.dispose();
        session =
          request.tier === 'B'
            ? await openBlock(request.source, request.opts)
            : await openFree(request.source, request.opts);
        reply({ type: 'opened', id: request.id, meta: session.meta });
      } else if (request.type === 'frame') {
        if (!session) throw new Error('No graphic is open.');
        const image = await session.renderFrame(request.index);
        reply({ type: 'frame', id: request.id, image }, [image]);
      } else if (request.type === 'close') {
        session?.dispose();
        session = null;
        reply({ type: 'closed', id: request.id });
      }
    } catch (error) {
      reply({
        type: 'error',
        id: request.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
reply({ type: 'ready' });
