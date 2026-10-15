// X1: the preview's code-frame lookup. The renderer asks for a code layer's
// frame; this answers from the frame cache (the same frames the export reads)
// and starts the bake when frames are missing. While a frame loads it shows
// the nearest earlier one, so playback never flashes empty.
import type { MediaFrameRequest } from '../render/adapter';
import type { CodeBaker, BakeSpec } from './baker';
import type { FrameCache } from './cache';
import type { CodeLive } from './live';
import type { CodePosters } from './poster';
import {
  bakeSize,
  cacheKeyOf,
  codeMeta,
  codeParams,
  codeSeedOf,
  type CodeData,
  type CodeQuality,
} from './meta';

const PREFETCH = 8;

/** The bake spec of a code layer at a canvas size and quality. */
export function bakeSpecOf(
  code: CodeData,
  request: NonNullable<MediaFrameRequest['code']>,
  quality: CodeQuality,
): BakeSpec {
  const size = bakeSize(request.width, request.height, quality);
  return {
    cacheKey: cacheKeyOf(
      code.bakeKey,
      request.width,
      request.height,
      request.fps,
      quality,
    ),
    tier: code.tier,
    source: code.source,
    frames: request.frames,
    width: size.width,
    height: size.height,
    fps: request.fps,
    duration: codeMeta(code).duration,
    params: codeParams(code),
    seed: codeSeedOf(code),
  };
}

export class CodeFrames {
  /** Draft or Full per layer (transient, editing only; export is Full). */
  readonly quality = new Map<string, CodeQuality>();
  /** P1: the last frame drawn per layer, kept across a re-bake. */
  readonly #last = new Map<
    string,
    { cacheKey: string; image: CanvasImageSource; copy: boolean }
  >();
  constructor(
    private readonly cache: FrameCache,
    private readonly baker: CodeBaker,
    /** The stored code of a layer id, from the open project. */
    private readonly codeOf: (layerId: string) => CodeData | null,
    private readonly changed: () => void,
    /** P1: the thumbnail frame shown before the bake has a frame. */
    private readonly posters: CodePosters | null = null,
    /** P1: the frame rendered directly while a control is dragged. */
    private readonly live: CodeLive | null = null,
  ) {}

  /** P1: the last frame request per layer (the playhead's frame). */
  readonly #requests = new Map<string, MediaFrameRequest>();
  requestOf(layerId: string): MediaFrameRequest | null {
    return this.#requests.get(layerId) ?? null;
  }
  qualityOf(layerId: string): CodeQuality {
    return this.quality.get(layerId) ?? 'full';
  }
  specFor(request: MediaFrameRequest): BakeSpec | null {
    const code = this.codeOf(request.key);
    if (!code || !request.code) return null;
    return bakeSpecOf(code, request.code, this.qualityOf(request.key));
  }

  /**
   * The frame to draw, never blank once anything is known: the live frame of
   * a dragged control; else the baked frame (or the nearest earlier one);
   * else the last frame drawn before a re-bake; else the poster.
   */
  frame(
    request: MediaFrameRequest,
    playing: boolean,
  ): CanvasImageSource | null {
    const spec = this.specFor(request);
    if (!spec) return null;
    const key = request.key;
    this.#requests.set(key, request);
    const frame = request.code!.frame;
    this.baker.ensure(spec);
    this.cache.touch(spec.cacheKey);
    const exact = this.cache.get(spec.cacheKey, frame, this.changed);
    if (playing)
      for (let ahead = 1; ahead <= PREFETCH; ahead++) {
        const next = frame + ahead;
        if (next < this.cache.stored(spec.cacheKey))
          void this.cache.load(spec.cacheKey, next);
      }
    const image = exact ?? this.cache.nearest(spec.cacheKey, frame);
    const live = this.live?.get(key) ?? null;
    if (live) {
      if (!image || !this.live!.done(key, spec.cacheKey)) return live;
      this.live!.clear(key);
    }
    if (image) {
      this.#last.set(key, { cacheKey: spec.cacheKey, image, copy: false });
      return image;
    }
    const last = this.#last.get(key);
    if (last && last.cacheKey !== spec.cacheKey) {
      // The old bake's frame may be evicted from the cache: keep a copy.
      if (!last.copy) {
        const kept = copyOf(last.image);
        if (!kept) this.#last.delete(key);
        else this.#last.set(key, { ...last, image: kept, copy: true });
      }
      const kept = this.#last.get(key);
      if (kept) return kept.image;
    }
    const code = this.codeOf(key);
    if (!code || !this.posters) return null;
    return this.posters.image(
      code.bakeKey,
      bakeSpecOf(code, request.code!, 'full'),
    );
  }
}

/** A drawable copy of an image (null when it was closed meanwhile). */
function copyOf(image: CanvasImageSource): OffscreenCanvas | null {
  const { width, height } = image as { width: number; height: number };
  if (!width || !height) return null;
  try {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}
