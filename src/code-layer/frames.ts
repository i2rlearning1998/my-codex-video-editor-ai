// X1: the preview's code-frame lookup. The renderer asks for a code layer's
// frame; this answers from the frame cache (the same frames the export reads)
// and starts the bake when frames are missing. While a frame loads it shows
// the nearest earlier one, so playback never flashes empty.
import type { MediaFrameRequest } from '../render/adapter';
import type { CodeBaker, BakeSpec } from './baker';
import type { FrameCache } from './cache';
import {
  bakeSize,
  cacheKeyOf,
  codeMeta,
  codeParams,
  codeSeed,
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
    seed: codeSeed(code.source),
  };
}

export class CodeFrames {
  /** Draft or Full per layer (transient, editing only; export is Full). */
  readonly quality = new Map<string, CodeQuality>();
  constructor(
    private readonly cache: FrameCache,
    private readonly baker: CodeBaker,
    /** The stored code of a layer id, from the open project. */
    private readonly codeOf: (layerId: string) => CodeData | null,
    private readonly changed: () => void,
  ) {}

  qualityOf(layerId: string): CodeQuality {
    return this.quality.get(layerId) ?? 'full';
  }
  specFor(request: MediaFrameRequest): BakeSpec | null {
    const code = this.codeOf(request.key);
    if (!code || !request.code) return null;
    return bakeSpecOf(code, request.code, this.qualityOf(request.key));
  }

  frame(request: MediaFrameRequest, playing: boolean): ImageBitmap | null {
    const spec = this.specFor(request);
    if (!spec) return null;
    const frame = request.code!.frame;
    this.baker.ensure(spec);
    this.cache.touch(spec.cacheKey);
    const image = this.cache.get(spec.cacheKey, frame, this.changed);
    if (playing)
      for (let ahead = 1; ahead <= PREFETCH; ahead++) {
        const next = frame + ahead;
        if (next < this.cache.stored(spec.cacheKey))
          void this.cache.load(spec.cacheKey, next);
      }
    return image ?? this.cache.nearest(spec.cacheKey, frame);
  }
}
