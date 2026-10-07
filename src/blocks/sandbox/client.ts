import type { FrameRequest } from './runtime';
export interface FrameReply {
  kind: 'frame';
  id: number;
  ok: boolean;
  error?: string;
  ms?: number;
  width?: number;
  height?: number;
  pixels?: Uint8ClampedArray;
}
export interface WorkerPort {
  postMessage(value: unknown): void;
  terminate(): unknown;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror:
    ((event: { message?: string; preventDefault?: () => void }) => void) | null;
}
export class SandboxClient {
  private sequence = 0;
  private dead = false;
  private pending: ((reply: FrameReply) => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ready: Promise<boolean>;
  private settleReady: (ok: boolean) => void = () => {};
  constructor(
    private worker: WorkerPort,
    private budgetMs = 250,
    startupMs = 5000,
  ) {
    let readyResolve: (ok: boolean) => void = () => {};
    this.ready = new Promise((resolve) => {
      readyResolve = resolve;
      this.settleReady = resolve;
    });
    this.timer = setTimeout(() => {
      readyResolve(false);
      this.stop('Worker startup timed out');
    }, startupMs);
    worker.onmessage = ({ data }) => {
      const reply = data as
        FrameReply | { kind: 'ready' } | { kind: 'fatal'; error: string };
      if (reply.kind === 'ready') {
        clearTimeout(this.timer);
        readyResolve(true);
      } else if (reply.kind === 'fatal') {
        readyResolve(false);
        this.stop(reply.error);
      } else if (reply.kind === 'frame' && reply.id === this.sequence) {
        clearTimeout(this.timer);
        const finish = this.pending;
        this.pending = undefined;
        finish?.(reply);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      readyResolve(false);
      this.stop(event.message ?? 'Worker failed');
    };
  }
  private stop(error: string) {
    this.dead = true;
    this.settleReady(false);
    clearTimeout(this.timer);
    this.worker.terminate();
    const finish = this.pending;
    this.pending = undefined;
    finish?.({ kind: 'frame', id: this.sequence, ok: false, error });
  }
  async render(
    request: Omit<FrameRequest, 'id' | 'kind'>,
  ): Promise<FrameReply> {
    if (!(await this.ready) || this.dead)
      return {
        kind: 'frame',
        id: 0,
        ok: false,
        error: 'Sandbox unavailable; create a new worker',
      };
    if (this.pending)
      return {
        kind: 'frame',
        id: 0,
        ok: false,
        error: 'Sandbox busy; one frame at a time',
      };
    const id = ++this.sequence;
    return new Promise((resolve) => {
      this.pending = resolve;
      this.timer = setTimeout(
        () =>
          this.stop(
            'Frame exceeded ' + this.budgetMs + ' ms; worker terminated',
          ),
        this.budgetMs,
      );
      try {
        this.worker.postMessage({ ...request, id, kind: 'frame' });
      } catch (e) {
        this.stop('Cannot send frame: ' + String(e));
      }
    });
  }
  dispose(): void {
    this.stop('Sandbox disposed');
  }
}
export function createSandbox(budgetMs = 250): SandboxClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });
  const port: WorkerPort = {
    postMessage: (value) => worker.postMessage(value),
    terminate: () => worker.terminate(),
    onmessage: null,
    onerror: null,
  };
  worker.onmessage = (event) => port.onmessage?.({ data: event.data });
  worker.onerror = (event) => port.onerror?.(event);
  return new SandboxClient(port, budgetMs);
}
