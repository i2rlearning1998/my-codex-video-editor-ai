import type {
  Context,
  Definition,
  Item,
  Params,
  Surface,
  Transition,
} from './types';
import { copy, resize, surface } from './surface';
import { defaults } from './definition';
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

export { clearEffectCaches } from './effects-b';

const staticIds = new Map<string, boolean>();
/**
 * True when an effect, filter or adjustment gives the same pixels at any time
 * and seed (measured once per id on a small noisy picture, so a new effect
 * needs no list). A stack of such items can be cached by its input pixels.
 */
export function isTimeStatic(id: string): boolean {
  let known = staticIds.get(id);
  if (known !== undefined) return known;
  const def = getItem(id);
  if (!def || def.kind === 'transition') known = false;
  else {
    const size = 24;
    const base = surface(size, size);
    let seed = 12345;
    for (let i = 0; i < base.data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      base.data[i] = i % 4 === 3 ? 255 : (seed >>> 24) & 255;
    }
    const params = defaults(def);
    try {
      const run = (time: number, seedValue: number, duration: number) => {
        const out = surface(size, size);
        def.apply(copy(base), out, params, {
          time,
          duration,
          seed: seedValue,
          width: size,
          height: size,
        });
        return out.data;
      };
      const first = run(0, 1, 2);
      known = [
        [0.13, 3, 2],
        [0.37, 9, 3],
        [0.7, 99, 5],
        [1.1, 5, 2],
        [1.9, 7, 2],
        [3.3, 11, 8],
        [6.1, 13, 12],
      ].every(([time, seedValue, duration]) => {
        const next = run(time!, seedValue!, duration!);
        return first.every((value, i) => value === next[i]);
      });
    } catch {
      known = false;
    }
  }
  staticIds.set(id, known);
  return known;
}
