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
  /** The seek target still to issue once the current seek completes. */
  wanted: number | null;
  seekStarted: number;
  used: number;
}

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
  readonly #videos = new Map<string, VideoDecoder>();
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

  frame(
    request: MediaFrameRequest,
    playing: boolean,
  ): CanvasImageSource | null {
    if (this.#disposed) return null;
    const url = this.#url(request.assetId);
    if (!url) return null;
    return request.kind === 'image'
      ? this.#image(request.assetId, url)
      : this.#video(request, url, playing);
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
    for (const decoder of this.#videos.values()) this.#release(decoder);
    this.#videos.clear();
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
      const stored = store ? await store.read(mediaKey(fingerprint)) : null;
      if (!stored || this.#disposed) return null;
      // Stored files can lose their MIME type (OPFS); SVG needs it to decode.
      const typed =
        !stored.type && typeof asset.metadata.mimeType === 'string'
          ? stored.slice(0, stored.size, asset.metadata.mimeType)
          : stored;
      return URL.createObjectURL(typed);
    })().then(
      (url) => {
        this.#urls.set(assetId, url);
        if (url) this.changed();
        return url;
      },
      () => {
        this.#urls.set(assetId, null);
        return null;
      },
    );
    this.#urls.set(assetId, loading);
    return null;
  }

  #image(assetId: string, url: string): HTMLImageElement | null {
    const known = this.#images.get(assetId);
    if (known instanceof HTMLImageElement) return known;
    if (known !== undefined) return null;
    this.#images.set(assetId, 'loading');
    const image = new Image();
    image.src = url;
    image.decode().then(
      () => {
        this.#images.set(assetId, image);
        this.changed();
      },
      () => this.#images.set(assetId, null),
    );
    return null;
  }

  #video(
    request: MediaFrameRequest,
    url: string,
    playing: boolean,
  ): HTMLVideoElement | null {
    let decoder = this.#videos.get(request.key);
    if (decoder && decoder.assetId !== request.assetId) {
      this.#release(decoder);
      this.#videos.delete(request.key);
      decoder = undefined;
    }
    if (!decoder) decoder = this.#create(request, url);
    decoder.used = this.#frame;
    this.#requested.add(request.key);
    const element = decoder.element;
    const ready = element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) {
      const end = Math.max(0, element.duration - NUDGE);
      const target = Math.max(
        0,
        Math.min(end, request.sourceTime + (request.reversed ? -NUDGE : NUDGE)),
      );
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
      wanted: null,
      seekStarted: 0,
      used: this.#frame,
    };
    element.addEventListener('loadeddata', () => this.changed());
    element.addEventListener('seeked', () => {
      if (decoder.wanted !== null) {
        const next = decoder.wanted;
        decoder.wanted = null;
        this.#seek(decoder, next);
      }
      this.changed();
    });
    element.src = url;
    this.#videos.set(request.key, decoder);
    return decoder;
  }

  #release(decoder: VideoDecoder): void {
    decoder.element.pause();
    decoder.element.removeAttribute('src');
    decoder.element.load();
  }
}
