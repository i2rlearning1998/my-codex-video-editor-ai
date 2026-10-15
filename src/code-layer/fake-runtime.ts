// X1: a stand-in for the Tier C runtime, for tests only (the dev/test hook
// `window.__AIVE_E2E_FREECODE__ = 'fake'`, and unit tests). It evaluates the
// module on the page with no sandbox, so it must never run user code in
// production; the real runtime (X5, `src/freecode`) runs it in a sandboxed
// iframe. It keeps the contract: meta, init, renderFrame, a transparent
// canvas cleared before each frame unless `keepFrame`, frames in order
// unless `seekable`, and a seeded `rng`.
import type {
  FreeCodeError,
  FreeCodeMeta,
  FreeCodeOpenOptions,
  FreeCodeRuntime,
  FreeCodeSession,
  FreeCodeValidation,
} from './runtime-types';

interface Module {
  meta: Partial<FreeCodeMeta> & Record<string, unknown>;
  init?: (context: Record<string, unknown>) => unknown;
  renderFrame: (frame: { t: number; frame: number; dt: number }) => void;
}

function evaluate(source: string): Module {
  const holder: { __block?: unknown } = {};
  const body = source.replace(/export\s+default\s+/, 'window.__block = ');
  new Function('window', `"use strict";\n${body}\n`)(holder);
  return holder.__block as Module;
}

function check(source: string): FreeCodeValidation {
  let module: Module;
  try {
    module = evaluate(source);
  } catch (error) {
    const match = /<anonymous>:(\d+)/.exec(String((error as Error).stack));
    return {
      ok: false,
      errors: [
        {
          line: match ? Math.max(1, Number(match[1]) - 3) : 1,
          message: (error as Error).message,
        },
      ],
    };
  }
  const errors: FreeCodeError[] = [];
  const meta = module?.meta;
  if (!module || typeof module !== 'object' || !meta)
    errors.push({ line: 1, message: 'The module defines no `meta`.' });
  else {
    if (typeof meta.id !== 'string' || !meta.id)
      errors.push({ line: 1, message: '`meta.id` must be a text id.' });
    if (
      typeof meta.duration !== 'number' ||
      !(meta.duration > 0) ||
      meta.duration > 120
    )
      errors.push({
        line: 1,
        message: '`meta.duration` must be between 0 and 120 seconds.',
      });
    if (typeof module.renderFrame !== 'function')
      errors.push({ line: 1, message: 'The module has no `renderFrame`.' });
  }
  if (errors.length) return { ok: false, errors };
  const duration = meta.duration as number;
  return {
    ok: true,
    meta: {
      id: String(meta.id),
      name: typeof meta.name === 'string' ? meta.name : String(meta.id),
      version: typeof meta.version === 'string' ? meta.version : '1.0.0',
      category: typeof meta.category === 'string' ? meta.category : '',
      duration,
      ...(typeof meta.fps === 'number' ? { fps: meta.fps } : {}),
      seekable: meta.seekable === true,
      keepFrame: meta.keepFrame === true,
      thumbnailTime:
        typeof meta.thumbnailTime === 'number'
          ? meta.thumbnailTime
          : duration / 2,
      libs: [],
      params: Array.isArray(meta.params) ? meta.params : [],
    },
  };
}

/** mulberry32 */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FakeRuntime implements FreeCodeRuntime {
  /** Sessions opened so far (tests read it). */
  opened = 0;
  validate(source: string): FreeCodeValidation {
    return check(source);
  }
  async open(
    source: string,
    opts: FreeCodeOpenOptions,
  ): Promise<FreeCodeSession> {
    const result = check(source);
    if (!result.ok)
      throw new Error(
        result.errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n'),
      );
    this.opened++;
    const meta = result.meta;
    const module = evaluate(source);
    const canvas = new OffscreenCanvas(opts.width, opts.height);
    const ctx = canvas.getContext('2d')!;
    const rng = seeded(opts.seed);
    await module.init?.({
      canvas,
      ctx,
      gl: null,
      params: opts.params,
      size: { width: opts.width, height: opts.height },
      fps: opts.fps,
      duration: opts.duration,
      seed: opts.seed,
      libs: {},
      rng,
    });
    let next = 0;
    let disposed = false;
    const count = Math.max(1, Math.ceil(opts.duration * opts.fps - 1e-6));
    const draw = async (frame: number) => {
      if (disposed) throw new Error('Session is disposed.');
      if (!Number.isInteger(frame) || frame < 0 || frame >= count)
        throw new Error(`Frame must be an integer in 0..${count - 1}.`);
      if (!meta.seekable && frame !== next)
        throw new Error(`Stateful animation needs frame ${next}.`);
      if (!meta.keepFrame) ctx.clearRect(0, 0, opts.width, opts.height);
      module.renderFrame({
        t: frame / opts.fps,
        frame,
        dt: 1 / opts.fps,
      });
      next = frame + 1;
      return createImageBitmap(canvas);
    };
    return {
      meta,
      renderFrame: draw,
      async thumbnail() {
        const fresh = await new FakeRuntime().open(source, opts);
        const target = Math.min(
          count - 1,
          Math.floor(meta.thumbnailTime * opts.fps),
        );
        try {
          if (!meta.seekable)
            for (let f = 0; f < target; f++)
              (await fresh.renderFrame(f)).close();
          return await fresh.renderFrame(target);
        } finally {
          fresh.dispose();
        }
      },
      dispose() {
        disposed = true;
      },
    };
  }
}
