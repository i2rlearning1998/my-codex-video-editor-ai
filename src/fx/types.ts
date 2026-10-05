export interface Surface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}
export type ParamValue = number | boolean | string;
export type Params = Readonly<Record<string, ParamValue>>;
export interface Param {
  name: string;
  type: 'number' | 'boolean' | 'select' | 'color';
  min: number;
  max: number;
  default: ParamValue;
  label: string;
  options?: readonly string[];
}
export interface Context {
  time: number;
  duration: number;
  seed: number;
  width: number;
  height: number;
}
export interface Definition {
  id: string;
  name: string;
  category: string;
  kind: 'effect' | 'filter' | 'adjustment';
  params: readonly Param[];
  alpha: 'preserve' | 'spatial' | 'modify';
  apply(src: Surface, dst: Surface, params: Params, ctx: Context): void;
}
export interface Transition {
  id: string;
  name: string;
  category: string;
  kind: 'transition';
  params: readonly Param[];
  alpha: 'mix';
  apply(
    from: Surface,
    to: Surface,
    dst: Surface,
    progress: number,
    params: Params,
    ctx: Context,
  ): void;
}
export type Item = Definition | Transition;
