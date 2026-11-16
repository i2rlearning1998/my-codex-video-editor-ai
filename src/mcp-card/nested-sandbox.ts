// ROUND-C3 (0.2): the card's side of the nested sandbox. Code graphics are
// baked frame by frame in a child frame (sandbox="allow-scripts", our
// server's sandbox page with connect-src 'none'). The card keeps its bridge
// to the chat; the child only gets frame requests and sends pixels back. A
// frame that does not come back in time ends the child and the export says
// so in one sentence.
import type { SessionOpener } from '../code-layer/baker';
import type { FreeCodeSession } from '../code-layer/runtime-types';

/** One frame may take this long (the block guard inside stops at 2 s). */
export const FRAME_LIMIT_MS = 8000;
/** The fallback when the chat does not allow the nested frame at all. */
export const NO_SANDBOX =
  'This chat does not let the card draw code graphics, so the export stopped. Open the video in the panel and export it from the editor.';
export const TOO_SLOW =
  'A code graphic in this video took too long to draw, so the export stopped. Simplify that graphic, or export from the editor.';

interface Reply {
  type: 'ready' | 'opened' | 'frame' | 'error' | 'closed';
  id?: number;
  image?: ImageBitmap;
  meta?: FreeCodeSession['meta'];
  message?: string;
}

export function nestedSandboxOpener(
  origin: string,
  limitMs = FRAME_LIMIT_MS,
): SessionOpener {
  return async (tier, source, opts) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('data-code-sandbox', '');
    frame.style.cssText =
      'position:fixed;width:1px;height:1px;left:-10000px;border:0;pointer-events:none';
    let next = 0;
    let dead: string | null = null;
    const waiting = new Map<
      number,
      { resolve(r: Reply): void; reject(e: Error): void; timer: number }
    >();
    let ready!: () => void;
    const readyNow = new Promise<void>((r) => (ready = r));
    const end = (message: string) => {
      if (dead) return;
      dead = message;
      window.removeEventListener('message', receive);
      frame.remove();
      for (const w of waiting.values()) {
        clearTimeout(w.timer);
        w.reject(new Error(message));
      }
      waiting.clear();
    };
    const receive = (event: MessageEvent<Reply>) => {
      // Only our own child frame is heard.
      if (event.source !== frame.contentWindow) return;
      const r = event.data;
      if (!r || typeof r !== 'object') return;
      if (r.type === 'ready') return ready();
      const w = r.id === undefined ? undefined : waiting.get(r.id);
      if (!w) return;
      waiting.delete(r.id!);
      clearTimeout(w.timer);
      if (r.type === 'error') w.reject(new Error(r.message ?? 'Failed.'));
      else w.resolve(r);
    };
    const ask = (msg: Record<string, unknown>) =>
      new Promise<Reply>((resolve, reject) => {
        if (dead) return reject(new Error(dead));
        const id = ++next;
        const timer = window.setTimeout(() => end(TOO_SLOW), limitMs);
        waiting.set(id, { resolve, reject, timer });
        frame.contentWindow!.postMessage({ ...msg, id }, '*');
      });
    window.addEventListener('message', receive);
    frame.src = `${origin}/mcp/card/sandbox.html`;
    document.body.append(frame);
    const start = window.setTimeout(() => end(NO_SANDBOX), limitMs * 2);
    await Promise.race([
      readyNow,
      new Promise<void>((_, reject) => {
        frame.addEventListener('error', () => reject(new Error(NO_SANDBOX)));
        const stop = setInterval(() => {
          if (dead) {
            clearInterval(stop);
            reject(new Error(dead));
          }
        }, 100);
        void readyNow.then(() => clearInterval(stop));
      }),
    ]);
    clearTimeout(start);
    if (dead) throw new Error(dead);
    const opened = await ask({ type: 'open', tier, source, opts });
    return {
      meta: opened.meta!,
      renderFrame: async (index) =>
        (await ask({ type: 'frame', index })).image!,
      thumbnail: async () => (await ask({ type: 'frame', index: 0 })).image!,
      dispose: () => end('The graphic was closed.'),
    };
  };
}
