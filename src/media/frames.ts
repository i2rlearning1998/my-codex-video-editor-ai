import { mediaSeekTime } from '../media-probe/timing';
import type { FrameProvider, MediaFrameRequest } from '../render/adapter';
import { assetFingerprint, mediaKey } from './import';
import type { PreviewAsset } from './previews';
import type { MediaStore } from './store';

/** Forward playback re-seeks only when the video drifts this far from the clock. */
const DRIFT_SECONDS = 0.25;
/** A seek longer than this during playback counts as buffering. */
const SLOW_SEEK_MS = 250;
/** Seek just inside the wanted frame so rounding never lands on its neighbour. */
const NUDGE = 0.001;
const MAX_DECODERS = 16;
/** PB-010: steer playing videos toward the clock when they drift past half a frame. */
const STEER_SECONDS = 1 / 60;
const MAX_STEER = 0.2;

interface VideoDecoder {
  element: HTMLVideoElement;
  assetId: string;
  /** Phase 1 library: the bytes it plays (the proxy, then the full file). */
  url: string;
  /** The seek target still to issue once the current seek completes. */
  wanted: number | null;
  seekStarted: number;
  used: number;
  /** U2: small frames already shown, by source time (ms), for scrubbing. */
  cache: Map<number, HTMLCanvasElement>;
}
/** U2: frames kept per video while scrubbing, and their width. */
const CACHE_FRAMES = 90;
const CACHE_WIDTH = 480;

/**
 * W4-B frame provider: one HTMLVideoElement per video layer and one decoded image
 * per image asset, fed from the media store (D-005: HTMLVideoElement preview).
 * Paused, each video seeks to its exact frame. Playing, forward clips play natively
 * at their speed and are only re-seeked on drift, so late frames drop instead of
 * slowing down (PB-009). Reversed and frozen clips seek. The renderer only asks.
 */
export class MediaFrames implements FrameProvider {
  readonly #urls = new Map<string, Promise<string | null> | string | null>();
  readonly #images = new Map<string, HTMLImageElement | 'loading' | null>();
  readonly #pendingImages = new Set<string>();
  readonly #videos = new Map<string, VideoDecoder>();
  /** Phase 1 library: the full file's decoder while it gets its first frame. */
  readonly #next = new Map<string, VideoDecoder>();
  /** Assets drawn from their catalog proxy until the full file arrives. */
  readonly #provisional = new Set<string>();
  /** Old object URLs kept until their replacement draws. */
  readonly #stale = new Map<string, string>();
  /**
   * Phase 1 library (P1-25): a picture to draw while an asset has no frame
   * yet (a catalog poster, decoded in memory). Set by the shell.
   */
  posterOf: ((assetId: string) => CanvasImageSource | null) | null = null;
  #requested = new Set<string>();
  #buffering = false;
  #disposed = false;
  #frame = 0;
  /** Continuous clock minus the frame-quantised time being drawn (0 when paused). */
  #clockOffset = 0;

  constructor(
    private readonly store: Promise<MediaStore | null>,
    private readonly assets: () => readonly PreviewAsset[],
    /** Called when a new frame became available and the canvas should redraw. */
    private readonly changed: () => void,
    private readonly now = () => performance.now(),
  ) {}

  /** True while playing and a visible video has no current frame or seeks slowly. */
  get buffering(): boolean {
    return this.#buffering;
  }

  beginFrame(clockOffset = 0): void {
    this.#clockOffset = clockOffset;
    this.#frame++;
    this.#requested = new Set();
    this.#buffering = false;
  }

  /** X1: code animations answer from their frame cache (set by the shell). */
  code: FrameProvider | null = null;

  frame(
    request: MediaFrameRequest,
    playing: boolean,
  ): CanvasImageSource | null {
    if (this.#disposed) return null;
    if (request.kind === 'code')
      return this.code?.frame(request, playing) ?? null;
    const url = this.#url(request.assetId);
    const drawn = url
      ? request.kind === 'image'
        ? this.#image(request.assetId, url)
        : this.#video(request, url, playing)
      : null;
    return drawn ?? this.posterOf?.(request.assetId) ?? null;
  }

  /**
   * Phase 1 library (P1-25): the full file of an asset drawn from its proxy
   * has arrived. The next frames read it; the proxy keeps drawing until the
   * full file has its first frame, so nothing blinks or moves.
   */
  upgrade(assetId: string): void {
    if (!this.#provisional.delete(assetId)) return this.retry();
    const old = this.#urls.get(assetId);
    if (typeof old === 'string') this.#stale.set(assetId, old);
    this.#urls.delete(assetId);
    this.changed();
  }

  /** Bytes may have arrived (an import): look again for media that had none. */
  retry(): void {
    for (const [assetId, url] of this.#urls)
      if (url === null) this.#urls.delete(assetId);
    for (const [assetId, image] of this.#images)
      if (image === null) this.#images.delete(assetId);
    this.changed();
  }

  /** Pauses videos that are no longer drawn. */
  endFrame(): void {
    for (const [key, decoder] of this.#videos)
      if (!this.#requested.has(key) && !decoder.element.paused)
        decoder.element.pause();
  }

  /** Read-only snapshot for the dev/test hook (PB-010 sync proof). */
  get debug() {
    return [...this.#videos.entries()].map(([key, decoder]) => ({
      key,
      currentTime: decoder.element.currentTime,
      playbackRate: decoder.element.playbackRate,
      paused: decoder.element.paused,
    }));
  }

  dispose(): void {
    this.#disposed = true;
    for (const decoder of [...this.#videos.values(), ...this.#next.values()])
      this.#release(decoder);
    this.#videos.clear();
    this.#next.clear();
    for (const url of this.#urls.values())
      if (typeof url === 'string') URL.revokeObjectURL(url);
    this.#urls.clear();
    this.#images.clear();
  }

  #url(assetId: string): string | null {
    const known = this.#urls.get(assetId);
    if (typeof known === 'string' || known === null) return known;
    if (known) return null; // Still loading.
    const asset = this.assets().find((item) => item.id === assetId);
    const fingerprint = asset && assetFingerprint(asset);
    if (!asset || !fingerprint) {
      this.#urls.set(assetId, null);
      return null;
    }
    const loading = (async () => {
      const store = await this.store;
      let stored = store ? await store.read(mediaKey(fingerprint)) : null;
      // Phase 1 library: a catalog item plays its small proxy until the full
      // file is here (P1-25).
      const proxy = (asset.metadata as Record<string, unknown>).catalogProxy;
      if (!stored && store && typeof proxy === 'string') {
        stored = await store.read(proxy).catch(() => null);
        if (stored) this.#provisional.add(assetId);
      }
      if (!stored || this.#disposed) return null;
      // Stored files can lose their MIME type (OPFS); SVG needs it to decode.
      const typed =
        !stored.type && typeof asset.metadata.mimeType === 'string'
          ? stored.slice(0, stored.size, asset.metadata.mimeType)
          : stored;
      return URL.createObjectURL(typed);
    })().then(
      (url) => {
        if (this.#disposed) {
          if (url) URL.revokeObjectURL(url);
          return null;
        }
        this.#urls.set(assetId, url);
        if (url) this.changed();
        return url;
      },
      () => {
        if (this.#disposed) return null;
        this.#urls.set(assetId, null);
        return null;
      },
    );
    this.#urls.set(assetId, loading);
    return null;
  }

  #image(assetId: string, url: string): HTMLImageElement | null {
    const known = this.#images.get(assetId);
    if (known instanceof HTMLImageElement && known.src === url) return known;
    if (known === 'loading' || known === null) return null;
    // Phase 1 library: a new file for the same asset (the full one after the
    // proxy): the old picture stays until the new one is decoded.
    const previous = known instanceof HTMLImageElement ? known : null;
    if (!previous) this.#images.set(assetId, 'loading');
    const image = new Image();
    image.src = url;
    if (previous) {
      if (!this.#pendingImages.has(assetId)) {
        this.#pendingImages.add(assetId);
        image.decode().then(
          () => {
            this.#pendingImages.delete(assetId);
            if (this.#disposed) return;
            this.#images.set(assetId, image);
            this.#revokeStale(assetId);
            this.changed();
          },
          () => this.#pendingImages.delete(assetId),
        );
      }
      return previous;
    }
    image.decode().then(
      () => {
        if (this.#disposed) return;
        this.#images.set(assetId, image);
        this.changed();
      },
      () => {
        if (!this.#disposed) this.#images.set(assetId, null);
      },
    );
    return null;
  }

  #video(
    request: MediaFrameRequest,
    url: string,
    playing: boolean,
  ): CanvasImageSource | null {
    let decoder = this.#videos.get(request.key);
    if (decoder && decoder.assetId !== request.assetId) {
      this.#release(decoder);
      this.#videos.delete(request.key);
      decoder = undefined;
    }
    // Phase 1 library: the full file replaces the proxy only once it has a
    // frame at the wanted time; until then the proxy keeps drawing.
    if (decoder && decoder.url !== url) {
      let next = this.#next.get(request.key);
      if (!next || next.url !== url) {
        if (next) this.#release(next);
        next = this.#make(request, url);
        this.#next.set(request.key, next);
      }
      next.used = this.#frame;
      const element = next.element;
      if (element.readyState >= HTMLMediaElement.HAVE_METADATA) {
        const target = mediaSeekTime(request.sourceTime, {
          end: Math.max(0, element.duration - NUDGE),
          reverse: request.reversed,
          nudge: NUDGE,
        });
        if (Math.abs(element.currentTime - target) > NUDGE / 2 && !element.seeking)
          this.#seek(next, target);
        if (
          element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          !element.seeking &&
          Math.abs(element.currentTime - target) <= NUDGE
        ) {
          this.#release(decoder);
          this.#videos.set(request.key, next);
          this.#next.delete(request.key);
          this.#revokeStale(request.assetId);
          decoder = next;
        }
      }
    }
    if (!decoder) decoder = this.#create(request, url);
    decoder.used = this.#frame;
    this.#requested.add(request.key);
    const element = decoder.element;
    const ready = element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) {
      const end = Math.max(0, element.duration - NUDGE);
      const target = mediaSeekTime(request.sourceTime, {
        end,
        reverse: request.reversed,
        nudge: NUDGE,
      });
      const native =
        playing &&
        !request.reversed &&
        !request.frozen &&
        request.speed >= 0.0625 &&
        request.speed <= 16;
      if (native) {
        const clockTarget = Math.min(
          end,
          target + this.#clockOffset * request.speed,
        );
        const drift = element.currentTime - clockTarget;
        // Small drift is steered with the playback rate; large drift re-seeks.
        const rate =
          Math.abs(drift) > STEER_SECONDS
            ? request.speed *
              (1 - Math.max(-MAX_STEER, Math.min(MAX_STEER, drift * 4)))
            : request.speed;
        if (Math.abs(element.playbackRate - rate) > 1e-3)
          element.playbackRate = rate;
        if (element.paused) {
          this.#seek(decoder, clockTarget);
          element.play().catch(() => undefined);
        } else if (Math.abs(drift) > DRIFT_SECONDS)
          this.#seek(decoder, clockTarget);
      } else {
        if (!element.paused) element.pause();
        if (
          Math.abs(element.currentTime - target) > NUDGE / 2 ||
          element.seeking
        )
          this.#seek(decoder, target);
        // U2: while a seek is still on its way, the nearest frame already
        // seen (a small copy) shows at once instead of the stale one.
        if (element.seeking && decoder.cache.size) {
          let best: HTMLCanvasElement | null = null;
          let distance = 0.5;
          for (const [ms, frame] of decoder.cache) {
            const d = Math.abs(ms / 1000 - target);
            if (d < distance) {
              distance = d;
              best = frame;
            }
          }
          if (best) return best;
        }
      }
    }
    if (
      playing &&
      (!ready ||
        (element.seeking && this.now() - decoder.seekStarted > SLOW_SEEK_MS))
    )
      this.#buffering = true;
    return ready ? element : null;
  }

  #seek(decoder: VideoDecoder, target: number): void {
    const element = decoder.element;
    if (element.seeking) {
      // One seek at a time: remember the latest target and issue it on 'seeked'.
      decoder.wanted = target;
      return;
    }
    if (element.currentTime === target) return;
    decoder.wanted = null;
    decoder.seekStarted = this.now();
    element.currentTime = target;
  }

  #create(request: MediaFrameRequest, url: string): VideoDecoder {
    const decoder = this.#make(request, url);
    this.#videos.set(request.key, decoder);
    return decoder;
  }

  #revokeStale(assetId: string): void {
    const stale = this.#stale.get(assetId);
    if (stale) URL.revokeObjectURL(stale);
    this.#stale.delete(assetId);
  }

  #make(request: MediaFrameRequest, url: string): VideoDecoder {
    if (this.#videos.size >= MAX_DECODERS) {
      // Free the least recently drawn decoder.
      const [oldest] = [...this.#videos.entries()].sort(
        (a, b) => a[1].used - b[1].used,
      );
      if (oldest) {
        this.#release(oldest[1]);
        this.#videos.delete(oldest[0]);
      }
    }
    const element = document.createElement('video');
    element.muted = true;
    element.playsInline = true;
    element.preload = 'auto';
    const decoder: VideoDecoder = {
      element,
      assetId: request.assetId,
      url,
      wanted: null,
      seekStarted: 0,
      used: this.#frame,
      cache: new Map(),
    };
    element.addEventListener('loadeddata', () => this.changed());
    element.addEventListener('seeked', () => {
      // U2: keep a small copy of each frame reached while paused.
      if (element.paused && element.videoWidth) {
        try {
          const frame = document.createElement('canvas');
          frame.width = Math.min(CACHE_WIDTH, element.videoWidth);
          frame.height = Math.max(
            1,
            Math.round(
              (frame.width * element.videoHeight) / element.videoWidth,
            ),
          );
          frame
            .getContext('2d')
            ?.drawImage(element, 0, 0, frame.width, frame.height);
          decoder.cache.set(Math.round(element.currentTime * 1000), frame);
          if (decoder.cache.size > CACHE_FRAMES)
            decoder.cache.delete(decoder.cache.keys().next().value!);
        } catch {
          // A frame that cannot be copied is simply not cached.
        }
      }
      if (decoder.wanted !== null) {
        const next = decoder.wanted;
        decoder.wanted = null;
        this.#seek(decoder, next);
      }
      this.changed();
    });
    element.src = url;
    return decoder;
  }

  #release(decoder: VideoDecoder): void {
    decoder.element.pause();
    decoder.element.removeAttribute('src');
    decoder.element.load();
  }
}
