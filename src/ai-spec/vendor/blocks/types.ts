export type DrawContext =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export interface Size {
  readonly width: number;
  readonly height: number;
}
export type Value = number | string | boolean;
export type Params = Readonly<Record<string, Value>>;
interface SpecBase {
  name: string;
  label: string;
}
export type ParamSpec = SpecBase &
  (
    | {
        type: 'number';
        min: number;
        max: number;
        step: number;
        default: number;
      }
    | { type: 'color'; default: string }
    | { type: 'text'; default: string; maxLength?: number }
    | { type: 'bool'; default: boolean }
    | { type: 'select'; default: string; options: readonly string[] }
  );
export interface BlockInfo {
  id: string;
  version: string;
  name: string;
  category: string;
  defaultDuration: number;
  params: readonly ParamSpec[];
  thumbnailTime?: number;
}
export interface BlockModule extends BlockInfo {
  render(
    ctx: DrawContext,
    t: number,
    size: Size,
    params: Params,
    seed: number,
  ): void;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
