import type { ParamSpec, Params } from '../blocks/types';
export type { ParamSpec, Params } from '../blocks/types';
export type Library = 'three' | 'pixi' | 'lottie';
export interface FreeCodeMeta {
  id: string;
  name: string;
  version: string;
  category: string;
  duration: number;
  fps?: number;
  seekable: boolean;
  keepFrame: boolean;
  thumbnailTime: number;
  libs: readonly Library[];
  params: readonly ParamSpec[];
}
export interface ValidationError {
  line: number;
  message: string;
}
export type ValidationResult =
  { ok: true; meta: FreeCodeMeta } | { ok: false; errors: ValidationError[] };
export interface OpenOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  params: Params;
  seed: number;
}
export interface FreeCodeRuntime {
  validate(source: string): ValidationResult;
  open(source: string, opts: OpenOptions): Promise<FreeCodeSession>;
}
export interface FreeCodeSession {
  readonly meta: FreeCodeMeta;
  renderFrame(frame: number): Promise<ImageBitmap>;
  thumbnail(): Promise<ImageBitmap>;
  dispose(): void;
}
