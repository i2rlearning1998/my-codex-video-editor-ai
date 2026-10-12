import { helpers } from '../helpers';
import { frame, validateFrame } from '../render';
import { validateInfo, validateParams } from '../params';
import { getBlock } from '../starters';
import type { CompiledBlock } from './compile';
import type { DrawContext, Params, Size } from '../types';
import { drawingFacade } from './facade';
export interface FrameRequest {
  id: number;
  kind: 'frame';
  blockId?: string;
  compiled?: CompiledBlock;
  t: number;
  size: Size;
  params: Params;
  seed: number;
  pixels?: boolean;
}
export interface CanvasPort {
  width: number;
  height: number;
  getContext(type: '2d'): DrawContext | null;
}
export interface RuntimeHost {
  send(value: unknown, transfer?: Transferable[]): void;
  listen(callback: (request: FrameRequest) => void): void;
  createCanvas(size: Size): CanvasPort;
  clock(): number;
  read(canvas: CanvasPort): Uint8ClampedArray;
}
const Factory = Function;
/** Defense in depth, only called in a dedicated worker after host hooks are captured. */
export function scrubGlobals(): void {
  const blocked = [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'importScripts',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'caches',
    'navigator',
    'location',
    'Worker',
    'SharedWorker',
    'BroadcastChannel',
    'MessageChannel',
    'SharedArrayBuffer',
    'Atomics',
    'WebAssembly',
    'crypto',
    'Date',
    'performance',
    'eval',
    'Function',
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'document',
    'window',
    'self',
    'globalThis',
    'process',
    'require',
    'Buffer',
  ];
  const root = globalThis;
  for (const name of blocked) {
    try {
      Object.defineProperty(root, name, {
        value: undefined,
        writable: false,
        configurable: false,
      });
    } catch {
      if (Reflect.get(root, name) !== undefined)
        throw new Error('Cannot remove worker capability: ' + name);
    }
  }
  Object.defineProperty(Math, 'random', {
    value: () => {
      throw new Error('Nondeterministic randomness denied');
    },
    writable: false,
    configurable: false,
  });
}
export function installRuntime(host: RuntimeHost): void {
  let stopped = false;
  try {
    scrubGlobals();
  } catch (e) {
    stopped = true;
    host.send({ kind: 'fatal', error: String(e) });
  }
  if (stopped) return;
  host.listen((request) => {
    try {
      validateFrame(request.t, request.size, request.seed);
      const canvas = host.createCanvas(request.size),
        ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');
      const start = host.clock();
      if (request.compiled) {
        validateInfo(request.compiled.info);
        const p = validateParams(request.compiled.info.params, request.params),
          drawing = drawingFacade(ctx),
          run = Factory(
            'ctx',
            't',
            'size',
            'params',
            'seed',
            'helpers',
            '"use strict";\n' + request.compiled.body,
          ) as (
            ctx: unknown,
            t: number,
            size: Size,
            p: Params,
            seed: number,
            h: typeof helpers,
          ) => void;
        frame(ctx, request.size, () => {
          try {
            run(
              drawing.ctx,
              request.t,
              Object.freeze({ ...request.size }),
              p,
              request.seed,
              helpers,
            );
          } finally {
            drawing.finish();
          }
        });
      } else {
        const block = getBlock(request.blockId ?? '');
        if (!block) throw new Error('Unknown starter block');
        block.render(
          ctx,
          request.t,
          request.size,
          request.params,
          request.seed,
        );
      }
      const ms = host.clock() - start;
      if (request.pixels === false) {
        host.send({ kind: 'frame', id: request.id, ok: true, ms });
        return;
      }
      const pixels = host.read(canvas);
      host.send(
        {
          kind: 'frame',
          id: request.id,
          ok: true,
          ms,
          width: request.size.width,
          height: request.size.height,
          pixels,
        },
        [pixels.buffer as ArrayBuffer],
      );
    } catch (error) {
      host.send({
        kind: 'frame',
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  host.send({ kind: 'ready' });
}
