// P1 (CREATOR-PACK-SPEC 5.2): live settings. While a control of a code layer
// is dragged, the frame at the playhead is rendered directly with the
// dragged values at Draft quality (half size) by its own session; only
// Blocks and seekable code can render one frame out of order, so a
// stateful animation keeps showing its baked frames until the release
// re-bakes it. One render runs per layer at a time; the newest request
// waits and replaces any older waiting one.
import type { BakeSpec, SessionOpener } from './baker';

interface Live {
  image: ImageBitmap | null;
  /** The drag ended: the image stays until the new bake has a frame. */
  released: boolean;
  busy: boolean;
  /** The bake the layer had when the drag started. */
  base: string | null;
  next: { spec: BakeSpec; frame: number } | null;
}

export class CodeLive {
  readonly #live = new Map<string, Live>();
  constructor(
    private readonly open: SessionOpener,
    private readonly changed: () => void,
  ) {}

  /** True when a layer's code can render one frame on its own. */
  static canRender(tier: 'B' | 'C', seekable: boolean): boolean {
    return tier === 'B' || seekable;
  }

  /** Renders `frame` of `spec` (a Draft spec with the dragged values). */
  request(layerId: string, spec: BakeSpec, frame: number): void {
    const live = this.#live.get(layerId) ?? {
      image: null,
      released: false,
      busy: false,
      base: null,
      next: null,
    };
    live.released = false;
    live.next = { spec, frame };
    this.#live.set(layerId, live);
    if (!live.busy) void this.#run(layerId, live);
  }

  async #run(layerId: string, live: Live) {
    live.busy = true;
    while (live.next) {
      const { spec, frame } = live.next;
      live.next = null;
      try {
        const session = await this.open(spec.tier, spec.source, spec);
        try {
          const image = await session.renderFrame(frame);
          if (this.#live.get(layerId) !== live) {
            image.close();
            break;
          }
          live.image?.close();
          live.image = image;
          this.changed();
        } finally {
          session.dispose();
        }
      } catch {
        // A failing value shows the last good frame; the release reports it.
      }
    }
    live.busy = false;
  }

  /** The live frame of a layer, while dragging or until the bake catches up. */
  get(layerId: string): ImageBitmap | null {
    return this.#live.get(layerId)?.image ?? null;
  }
  /**
   * True when the live frame can go: the drag ended and the layer now draws
   * a bake other than the one it had when the drag started (the re-bake).
   */
  done(layerId: string, cacheKey: string): boolean {
    const live = this.#live.get(layerId);
    if (!live) return true;
    live.base ??= cacheKey;
    return live.released && live.base !== cacheKey;
  }
  /** The drag ended (the change is applied and re-baked). */
  release(layerId: string): void {
    const live = this.#live.get(layerId);
    if (live) live.released = true;
  }
  /** Drops a layer's live frame (its new bake has a frame to show). */
  clear(layerId: string): void {
    const live = this.#live.get(layerId);
    if (!live) return;
    this.#live.delete(layerId);
    live.next = null;
    live.image?.close();
    this.changed();
  }
}
