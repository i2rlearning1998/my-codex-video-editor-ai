import type { DrawContext } from '../types';
import { drawingMethods, drawingStyles } from './policy';
/** No canvas, pixel buffers, prototypes or native return objects exposed to source. */
export function drawingFacade(ctx: DrawContext) {
  let depth = 0,
    calls = 0;
  const target = Object.create(null) as Record<string, unknown>;
  const count = () => {
    if (++calls > 100000) throw new Error('Drawing call limit exceeded');
  };
  for (const key of drawingMethods) {
    target[key] = (...args: unknown[]) => {
      count();
      if (
        args.some(
          (v) =>
            (typeof v === 'number' &&
              (!Number.isFinite(v) || Math.abs(v) > 1e7)) ||
            (typeof v === 'string' && v.length > 2000),
        )
      )
        throw new Error('Invalid drawing argument');
      if (key === 'save') {
        if (depth >= 32) throw new Error('Save nesting limit');
        depth++;
        ctx.save();
        return;
      }
      if (key === 'restore') {
        if (depth <= 0) throw new Error('Unbalanced restore');
        depth--;
        ctx.restore();
        return;
      }
      if (key === 'measureText') {
        const width = ctx.measureText(String(args[0] ?? '')).width;
        return Object.freeze(Object.assign(Object.create(null), { width }));
      }
      const method = ctx[key] as (...values: unknown[]) => unknown;
      method.apply(ctx, args);
    };
  }
  for (const key of drawingStyles)
    Object.defineProperty(target, key, {
      get: () => ctx[key],
      set: (value: unknown) => {
        count();
        if (typeof value !== 'string' && typeof value !== 'number')
          throw new Error('Style must be scalar');
        if (
          typeof value === 'number' &&
          (!Number.isFinite(value) || Math.abs(value) > 100000)
        )
          throw new Error('Invalid style');
        if (typeof value === 'string' && value.length > 256)
          throw new Error('Style too long');
        Reflect.set(ctx, key, value);
      },
      enumerable: true,
    });
  return {
    ctx: Object.freeze(target),
    finish() {
      const unbalanced = depth !== 0;
      while (depth > 0) {
        ctx.restore();
        depth--;
      }
      if (unbalanced) throw new Error('Unbalanced save/restore');
    },
  };
}
