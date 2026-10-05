import type {
  Context,
  Definition,
  Item,
  Params,
  Surface,
  Transition,
} from './types';
import { copy, resize, surface } from './surface';
import { filters } from './filters';
import { effects } from './effects';
import { transitions } from './transitions';
export { transitions } from './transitions';
export { effects } from './effects';
export { filters } from './filters';
import { adjustments, blendModes } from './adjustments';
export {
  adjustments,
  blendModes,
  adjustmentDefaults,
  fadeAlpha,
} from './adjustments';
export * from './types';
export { surface, copy, resize, random } from './surface';
export { defaults, sanitize } from './definition';

export const getEffect = (id: string): Definition | undefined =>
  effects.find((d) => d.id === id);
export const getFilter = (id: string): Definition | undefined =>
  filters.find((d) => d.id === id);
export const getTransition = (id: string): Transition | undefined =>
  transitions.find((d) => d.id === id);
export const getBlendMode = (id: string) => blendModes.find((d) => d.id === id);
export const getAdjustment = (id: string) =>
  adjustments.find((d) => d.id === id);
export const getItem = (id: string): Item | undefined =>
  getEffect(id) ?? getFilter(id) ?? getAdjustment(id) ?? getTransition(id);
export function renderStack(
  src: Surface,
  stack: readonly { id: string; params: Params }[],
  ctx: Context,
): Surface {
  let current = copy(src);
  if (!stack.length) return current;
  let out = surface(src.width, src.height);
  for (const entry of stack) {
    const def = getItem(entry.id);
    if (!def || def.kind === 'transition')
      throw new RangeError('Unknown stack item: ' + entry.id);
    def.apply(current, out, entry.params, ctx);
    [current, out] = [out, current];
  }
  return current;
}
export function renderThumbnail(
  def: Item,
  sample: Surface,
  w: number,
  h: number,
): Surface {
  const src = resize(sample, w, h),
    dst = surface(w, h),
    ctx = { time: 1, duration: 4, seed: 42, width: w, height: h };
  if (def.kind === 'transition') {
    const to = copy(src);
    for (let i = 0; i < to.data.length; i += 4) {
      to.data[i] = 255 - src.data[i]!;
      to.data[i + 2] = 255 - src.data[i + 2]!;
    }
    def.apply(src, to, dst, 0.5, {}, ctx);
  } else def.apply(src, dst, {}, ctx);
  return dst;
}
