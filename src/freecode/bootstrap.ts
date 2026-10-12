import type { FreeCodeMeta, OpenOptions } from './types';
export interface BootstrapConfig {
  token: string;
  source: string;
  meta: FreeCodeMeta;
  options: OpenOptions;
  frameTimeoutMs: number;
  librarySource: string;
  helperSource: string;
}
/** Self-contained: serialized into the opaque-origin iframe, never run on the host. */
export function sandboxBootstrap(config: BootstrapConfig): void {
  const transport = window.parent;
  const post = (data: Record<string, unknown>, transfer: Transferable[] = []) =>
    transport.postMessage({ token: config.token, ...data }, '*', transfer);
  const realNow = performance.now.bind(performance);
  const capture = createImageBitmap.bind(window);
  let time = 0,
    randomState = config.options.seed >>> 0,
    deadline = realNow() + config.frameTimeoutMs,
    ticks = 0;
  const rng = () => {
    randomState = (randomState + 0x6d2b79f5) | 0;
    let x = randomState;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const guard = () => {
    if (++ticks > 1000000 || realNow() > deadline)
      throw Error(
        'Execution budget exceeded: simplify loops or reduce particle counts.',
      );
  };
  const reset = () => {
    ticks = 0;
    deadline = realNow() + config.frameTimeoutMs;
  };
  Object.defineProperty(Math, 'random', {
    value: rng,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(Date, 'now', {
    value: () => time * 1000,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(performance, 'now', {
    value: () => time * 1000,
    writable: false,
    configurable: false,
  });
  for (const name of ['requestAnimationFrame', 'setTimeout', 'setInterval'])
    Object.defineProperty(window, name, {
      value: () => 0,
      writable: false,
      configurable: false,
    });
  for (const name of [
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
  ]) {
    try {
      Object.defineProperty(window, name, {
        get() {
          throw Error(name + ' is unavailable in Free code.');
        },
        configurable: false,
      });
    } catch {
      /* Opaque-origin storage also rejects access natively. */
    }
  }
  try {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: () => {
        throw Error('sendBeacon is unavailable.');
      },
    });
  } catch {
    /* CSP denies connections. */
  }
  HTMLFormElement.prototype.submit = () => {
    throw Error('Form submission is unavailable.');
  };
  HTMLFormElement.prototype.requestSubmit = () => {
    throw Error('Form submission is unavailable.');
  };
  const canvas = document.createElement('canvas');
  canvas.width = config.options.width;
  canvas.height = config.options.height;
  document.body.append(canvas);
  let drawing:
    | CanvasRenderingContext2D
    | WebGLRenderingContext
    | WebGL2RenderingContext
    | null = null;
  const getContext = canvas.getContext.bind(canvas);
  canvas.getContext = ((kind: string, attributes?: Record<string, unknown>) => {
    const context = getContext(kind, {
      ...attributes,
      ...(kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl'
        ? { preserveDrawingBuffer: true, alpha: true }
        : { alpha: true }),
    });
    if (
      context instanceof CanvasRenderingContext2D ||
      context instanceof WebGLRenderingContext ||
      context instanceof WebGL2RenderingContext
    )
      drawing = context;
    return context;
  }) as typeof canvas.getContext;
  const global = window as unknown as Record<string, unknown>;
  interface Animation {
    init(args: Record<string, unknown>): void | Promise<void>;
    renderFrame(args: {
      t: number;
      frame: number;
      dt: number;
    }): void | Promise<void>;
  }
  let animation: Animation;
  const fail = (id: number, e: unknown) =>
    post({
      kind: 'error',
      id,
      message: e instanceof Error ? e.message : String(e),
    });
  let busy = false;
  window.addEventListener('message', async (event: MessageEvent<unknown>) => {
    if (
      event.source !== transport ||
      !event.data ||
      typeof event.data !== 'object'
    )
      return;
    const d = event.data as Record<string, unknown>;
    if (
      d.token !== config.token ||
      d.kind !== 'render' ||
      !Number.isSafeInteger(d.frame) ||
      !Number.isSafeInteger(d.id)
    )
      return;
    const id = d.id as number;
    if (busy) {
      fail(id, Error('Concurrent frame requests are unavailable.'));
      return;
    }
    busy = true;
    try {
      reset();
      const frame = d.frame as number;
      time = frame / config.options.fps;
      if (config.meta.seekable) randomState = config.options.seed >>> 0;
      if (!config.meta.keepFrame && drawing) {
        if (drawing instanceof CanvasRenderingContext2D) {
          drawing.reset();
        } else {
          drawing.disable(drawing.SCISSOR_TEST);
          drawing.colorMask(true, true, true, true);
          drawing.clearColor(0, 0, 0, 0);
          drawing.clear(drawing.COLOR_BUFFER_BIT | drawing.DEPTH_BUFFER_BIT);
        }
      }
      await animation.renderFrame({
        t: time,
        frame,
        dt: frame === 0 ? 0 : 1 / config.options.fps,
      });
      guard();
      if (
        canvas.width !== config.options.width ||
        canvas.height !== config.options.height
      )
        throw Error('Do not resize the host canvas.');
      const bitmap = await capture(canvas);
      post({ kind: 'frame', id, bitmap }, [bitmap]);
    } catch (e) {
      fail(id, e);
    } finally {
      busy = false;
    }
  });
  void (async () => {
    try {
      // Bundles and helper code are trusted local artifacts; user code runs only here.
      new Function(config.librarySource)();
      const helpers: unknown = new Function(config.helperSource)();
      new Function('helpers', '__fcGuard', config.source)(helpers, guard);
      animation = global.__block as Animation;
      const libs = {
        three: global.THREE,
        PIXI: global.PIXI,
        lottie: global.lottie,
      };
      reset();
      await animation.init({
        canvas,
        get ctx() {
          return canvas.getContext('2d');
        },
        get gl() {
          return canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        },
        params: Object.freeze(config.options.params),
        size: Object.freeze({ width: canvas.width, height: canvas.height }),
        fps: config.options.fps,
        duration: config.options.duration,
        seed: config.options.seed,
        libs,
        rng,
        helpers,
      });
      guard();
      post({ kind: 'ready', id: 0 });
    } catch (e) {
      fail(0, e);
    }
  })();
}
