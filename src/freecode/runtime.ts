import { validateParams } from '../blocks/params';
import { sandboxBootstrap } from './bootstrap';
import { instrument } from './instrument';
import { loadLibraries, helperSource } from './libraries';
import { assertFrame, isReply } from './protocol';
import type { FreeCodeRuntime, FreeCodeSession, OpenOptions } from './types';
import { validate } from './validate';
export const CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
export interface RuntimeLimits {
  frameTimeoutMs?: number;
  totalTimeoutMs?: number;
}
export function createFreeCodeRuntime(
  limits: RuntimeLimits = {},
): FreeCodeRuntime {
  const frameTimeoutMs = limits.frameTimeoutMs ?? 5000,
    totalTimeoutMs = limits.totalTimeoutMs ?? 120000;
  if (
    ![frameTimeoutMs, totalTimeoutMs].every((n) => Number.isFinite(n) && n > 0)
  )
    throw Error('Timeout budgets must be positive finite milliseconds.');
  return {
    validate,
    async open(source, options) {
      const result = validate(source);
      if (!result.ok)
        throw Error(
          result.errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n'),
        );
      const meta = result.meta;
      if (
        ![options.width, options.height].every(
          (v) => Number.isInteger(v) && v > 0 && v <= 4096,
        ) ||
        options.width * options.height > 8388608 ||
        !Number.isFinite(options.fps) ||
        options.fps < 1 ||
        options.fps > 120 ||
        !Number.isFinite(options.duration) ||
        options.duration < 0.1 ||
        options.duration > 120 ||
        !Number.isSafeInteger(options.seed)
      )
        throw Error(
          'Invalid canvas, fps, duration or seed. Maximum canvas is 4096 per axis / 8 megapixels; duration 120 seconds.',
        );
      const opts: OpenOptions = {
        ...options,
        params: validateParams(meta.params, options.params),
      };
      const librarySource = await loadLibraries(meta.libs);
      const token = crypto.randomUUID();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText =
        'position:fixed;width:1px;height:1px;left:-10000px;border:0;pointer-events:none';
      const config = {
        token,
        source: instrument(source),
        meta,
        options: opts,
        frameTimeoutMs,
        librarySource,
        helperSource,
      };
      const script =
        `(${sandboxBootstrap.toString()})(${JSON.stringify(config)})`.replace(
          /<\/script/gi,
          '<\\/script',
        );
      iframe.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html,body{margin:0;overflow:hidden}canvas{display:block}</style><body><script>${script}</script></body>`;
      let disposed = false,
        next = 0,
        sequence = 0;
      type Pending = {
        resolve: (bitmap: ImageBitmap | null) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      };
      const pending = new Map<number, Pending>();
      const children = new Set<FreeCodeSession>();
      const close = (message = 'Session disposed.') => {
        if (disposed) return;
        disposed = true;
        for (const child of children) child.dispose();
        children.clear();
        iframe.remove();
        window.removeEventListener('message', receive);
        clearTimeout(total);
        for (const p of pending.values()) {
          clearTimeout(p.timer);
          p.reject(Error(message));
        }
        pending.clear();
      };
      const receive = (event: MessageEvent<unknown>) => {
        if (
          event.source !== iframe.contentWindow ||
          !isReply(event.data, token)
        )
          return;
        const d = event.data,
          p = pending.get(d.id);
        if (!p) {
          if (d.bitmap instanceof ImageBitmap) d.bitmap.close();
          return;
        }
        if (d.kind === 'error') {
          close(d.message ?? 'Sandbox failed.');
          return;
        }
        if (
          (d.id === 0 && d.kind !== 'ready') ||
          (d.id !== 0 &&
            (d.kind !== 'frame' || !(d.bitmap instanceof ImageBitmap)))
        ) {
          close('Invalid sandbox protocol reply.');
          return;
        }
        clearTimeout(p.timer);
        pending.delete(d.id);
        p.resolve(d.bitmap ?? null);
      };
      const total = setTimeout(
        () => close('Total session timeout exceeded; sandbox removed.'),
        totalTimeoutMs,
      );
      const wait = (id: number) =>
        new Promise<ImageBitmap | null>((resolve, reject) => {
          pending.set(id, {
            resolve,
            reject,
            timer: setTimeout(
              () => close('Frame timeout exceeded; sandbox removed.'),
              frameTimeoutMs,
            ),
          });
        });
      window.addEventListener('message', receive);
      const ready = wait(0);
      document.body.append(iframe);
      await ready;
      const session: FreeCodeSession = {
        meta,
        async renderFrame(frame) {
          if (disposed) throw Error('Session is disposed.');
          if (pending.size)
            throw Error(
              'Wait for the previous frame before requesting another.',
            );
          assertFrame(
            frame,
            Math.ceil(opts.duration * opts.fps),
            meta.seekable,
            next,
          );
          const id = ++sequence,
            reply = wait(id);
          iframe.contentWindow!.postMessage(
            { kind: 'render', token, id, frame },
            '*',
          );
          const bitmap = await reply;
          if (!bitmap) throw Error('Frame reply has no bitmap.');
          next = frame + 1;
          return bitmap;
        },
        async thumbnail() {
          if (disposed) throw Error('Session is disposed.');
          const fresh = await createFreeCodeRuntime(limits).open(source, opts);
          if (disposed) {
            fresh.dispose();
            throw Error('Session is disposed.');
          }
          children.add(fresh);
          try {
            const target = Math.min(
              Math.ceil(opts.duration * opts.fps) - 1,
              Math.floor(meta.thumbnailTime * opts.fps),
            );
            if (meta.seekable) return await fresh.renderFrame(target);
            for (let f = 0; f < target; f++)
              (await fresh.renderFrame(f)).close();
            return await fresh.renderFrame(target);
          } finally {
            fresh.dispose();
            children.delete(fresh);
          }
        },
        dispose() {
          close();
        },
      };
      return session;
    },
  };
}
export const freeCodeRuntime = createFreeCodeRuntime();
