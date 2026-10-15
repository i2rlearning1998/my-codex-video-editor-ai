import type { DrawContext } from '../../src/blocks/types';
/** Canvas call-log double. Deliberately not a rasterizer or pixel-parity claim. */
export function recording() {
  const log: unknown[][] = [];
  let depth = 0;
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(_target, key) {
      if (key === 'save')
        return () => {
          depth++;
          log.push(['save']);
        };
      if (key === 'restore')
        return () => {
          if (depth <= 0) throw new Error('Unbalanced restore');
          depth--;
          log.push(['restore']);
        };
      if (key === 'measureText')
        return (text: string) => ({ width: text.length * 12 });
      if (typeof key === 'string' && key in state) return state[key];
      return (...args: unknown[]) => {
        if (args.some((v) => typeof v === 'number' && !Number.isFinite(v)))
          throw new Error('Nonfinite draw');
        log.push([key, ...args]);
      };
    },
    set(_target, key, value) {
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('Nonfinite style');
      state[String(key)] = value;
      log.push(['set', key, value]);
      return true;
    },
  }) as unknown as DrawContext;
  return {
    ctx,
    log,
    get depth() {
      return depth;
    },
  };
}
