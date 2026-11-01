// Scene methods: how a scene is made (Director tools with a cost). Swapping a
// scene to a cheaper or richer method follows the owner's cost table.
import {
  costById,
  toolDecision,
  type Plan,
  type PlatformConfig,
} from '../platform-config';

/** Methods this plan may use, in the owner's preference order. */
export function allowedMethods(c: PlatformConfig, plan: Plan): string[] {
  return c.director.methodOrder.filter((m) => {
    const d = toolDecision(c.director, plan, m);
    return d.ok;
  });
}
/** Every enabled method, cheapest first (for swaps). */
export function methodsByCost(c: PlatformConfig): string[] {
  const max = (m: string) => {
    const t = c.director.tools.find((x) => x.id === m);
    return (t?.costId && costById(c, t.costId)?.max) || 0;
  };
  return c.director.methodOrder
    .filter((m) => c.director.tools.find((t) => t.id === m)?.enabled)
    .sort(
      (a, b) =>
        max(a) - max(b) ||
        c.director.methodOrder.indexOf(a) - c.director.methodOrder.indexOf(b),
    );
}
/** The next cheaper or richer method, or null. Plan-locked ones are returned too (the card shows Upgrade). */
export function swapTarget(
  c: PlatformConfig,
  current: string,
  dir: 'cheaper' | 'richer',
): string | null {
  const list = methodsByCost(c);
  const i = list.indexOf(current);
  if (i < 0) return null;
  return list[dir === 'cheaper' ? i - 1 : i + 1] ?? null;
}
