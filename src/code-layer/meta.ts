// X1: reading a code layer's stored data, and the keys of its baked frames.
import type { BlockInfo, ParamSpec, Params } from '../blocks/types';
import { contentHash, stableJson } from './hash';
import type { FreeCodeLibrary, FreeCodeMeta } from './runtime-types';

export type CodeTier = 'B' | 'C';
export type CodeQuality = 'full' | 'draft';
/** What the project stores on a code layer (schema 8 `layer.code`). */
export interface CodeData {
  readonly tier: CodeTier;
  readonly source: string;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly params: Readonly<Record<string, unknown>>;
  readonly bakeKey: string;
  readonly templateId?: string | undefined;
}
/** The longest animation the editor accepts (spec section 2). */
export const MAX_CODE_DURATION = 120;
/**
 * The bundled library versions a bake depends on (part of every key, so a
 * library update re-bakes). Set by the runtime adapter (X5).
 */
let libraryVersions = '';
export function setCodeLibraryVersions(versions: string): void {
  libraryVersions = versions;
}

const LIBS: readonly FreeCodeLibrary[] = ['three', 'pixi', 'lottie'];
/** A Tier B block's info as the common meta shape. */
export function blockMeta(info: BlockInfo): FreeCodeMeta {
  return {
    id: info.id,
    name: info.name,
    version: info.version,
    category: info.category,
    duration: info.defaultDuration,
    // Tier B is a pure function of t, so any frame can be drawn.
    seekable: true,
    keepFrame: false,
    thumbnailTime: info.thumbnailTime ?? info.defaultDuration / 2,
    libs: [],
    params: info.params,
  };
}
/** The stored meta read defensively (it was validated on import). */
export function codeMeta(code: Pick<CodeData, 'meta'>): FreeCodeMeta {
  const m = code.meta;
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const duration = Math.min(
    MAX_CODE_DURATION,
    Math.max(0.1, num(m.duration, 5)),
  );
  return {
    id: typeof m.id === 'string' ? m.id : 'code',
    name: typeof m.name === 'string' ? m.name : 'Code animation',
    version: typeof m.version === 'string' ? m.version : '1.0.0',
    category: typeof m.category === 'string' ? m.category : '',
    duration,
    ...(typeof m.fps === 'number' && m.fps > 0 ? { fps: m.fps } : {}),
    seekable: m.seekable === true,
    keepFrame: m.keepFrame === true,
    thumbnailTime: Math.min(duration, Math.max(0, num(m.thumbnailTime, 0))),
    libs: Array.isArray(m.libs)
      ? (m.libs.filter((lib) =>
          LIBS.includes(lib as FreeCodeLibrary),
        ) as FreeCodeLibrary[])
      : [],
    params: Array.isArray(m.params) ? (m.params as ParamSpec[]) : [],
  };
}
/** Every declared param, with its default where the stored value is missing. */
export function codeParams(code: Pick<CodeData, 'meta' | 'params'>): Params {
  const values: Record<string, number | string | boolean> = {};
  for (const spec of codeMeta(code).params) {
    const stored = code.params[spec.name];
    values[spec.name] =
      typeof stored === typeof spec.default
        ? (stored as number | string | boolean)
        : spec.default;
  }
  return values;
}
/** The host seed: a pure function of the source, so a bake always repeats. */
export function codeSeed(source: string): number {
  return parseInt(contentHash(source).slice(0, 7), 16);
}
/** The seed of a stored code record: `meta.seed` (a Composition Spec
 *  item's seed) when set, else the source's. */
export function codeSeedOf(code: Pick<CodeData, 'source' | 'meta'>): number {
  const seed = code.meta.seed;
  return typeof seed === 'number' && Number.isSafeInteger(seed) && seed >= 0
    ? seed
    : codeSeed(code.source);
}
/**
 * The project's bake key: the source, params, duration, seed and library
 * versions. Size, frame rate and quality are added by `cacheKeyOf`.
 */
export function bakeKeyOf(
  code: Pick<CodeData, 'tier' | 'source' | 'meta' | 'params'>,
): string {
  const meta = codeMeta(code);
  return contentHash(
    stableJson({
      tier: code.tier,
      source: code.source,
      params: codeParams(code),
      duration: meta.duration,
      seed: codeSeedOf(code),
      libs: meta.libs.length ? libraryVersions : '',
    }),
  );
}
/** The frame rate a code animation bakes at. */
export function codeFps(code: Pick<CodeData, 'meta'>, projectFps: number) {
  return codeMeta(code).fps ?? projectFps;
}
export const frameCount = (duration: number, fps: number) =>
  Math.max(1, Math.ceil(duration * fps - 1e-6));
/** The baked frame shown at a source time (the frame that started last). */
export function frameAt(sourceTime: number, fps: number, count: number) {
  return Math.min(
    count - 1,
    Math.max(0, Math.floor(Math.max(0, sourceTime) * fps + 1e-6)),
  );
}
/** Pixel size of a bake: Full is the project size, Draft half of it. */
export function bakeSize(
  width: number,
  height: number,
  quality: CodeQuality,
): { width: number; height: number } {
  return quality === 'full'
    ? { width, height }
    : {
        width: Math.max(1, Math.round(width / 2)),
        height: Math.max(1, Math.round(height / 2)),
      };
}
/** The frame cache's key: the bake key plus pixel size, rate and quality. */
export function cacheKeyOf(
  bakeKey: string,
  width: number,
  height: number,
  fps: number,
  quality: CodeQuality,
): string {
  const size = bakeSize(width, height, quality);
  return `${bakeKey}${contentHash(`${size.width}x${size.height}@${fps}`).slice(0, 12)}${quality === 'full' ? 'f' : 'd'}`;
}
