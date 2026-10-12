// X1 (CODE-TIERS-SPEC section 4): the editor-side contract of the Tier C
// free-code runtime. Codex builds the real runtime (`src/freecode`); the
// editor depends only on these types, so a fake can stand in for tests.
import type { ParamSpec, Params } from '../blocks/types';
export type { ParamSpec, Params } from '../blocks/types';

export type FreeCodeLibrary = 'three' | 'pixi' | 'lottie';
export interface FreeCodeMeta {
  id: string;
  name: string;
  version: string;
  category: string;
  /** Seconds. */
  duration: number;
  /** Optional; the project's frame rate when missing. */
  fps?: number;
  seekable: boolean;
  keepFrame: boolean;
  thumbnailTime: number;
  libs: readonly FreeCodeLibrary[];
  params: readonly ParamSpec[];
}
export interface FreeCodeError {
  line: number;
  message: string;
}
export type FreeCodeValidation =
  { ok: true; meta: FreeCodeMeta } | { ok: false; errors: FreeCodeError[] };
export interface FreeCodeOpenOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  params: Params;
  seed: number;
}
export interface FreeCodeRuntime {
  validate(source: string): FreeCodeValidation;
  open(source: string, opts: FreeCodeOpenOptions): Promise<FreeCodeSession>;
}
export interface FreeCodeSession {
  readonly meta: FreeCodeMeta;
  /** Sequential (0, 1, 2 ...), or any frame when `meta.seekable`. */
  renderFrame(frame: number): Promise<ImageBitmap>;
  thumbnail(): Promise<ImageBitmap>;
  /** Kills the sandbox. */
  dispose(): void;
}
