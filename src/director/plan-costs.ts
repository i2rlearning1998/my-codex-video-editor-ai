// ROUND-C3 (Part 1): the Plan card's numbers, DOM-free, shared by the
// in-panel Director (src/ai-mode/director.ts) and the MCP tools
// (server/mcp/tools.ts), so both show the same credits and rewrites.
import { costOf, type PlatformConfig } from '../platform-config';
import type { VideoPlan } from '../video-plan';

/** Credits of the plan's new graphics (the owner's cost each, at most). */
export function graphicsCredits(
  config: PlatformConfig,
  plan: Pick<VideoPlan, 'defs'>,
): number {
  const each = costOf(
    config,
    config.director.authoring.newGraphicCostId,
    1,
    'max',
  );
  return (plan.defs?.blocks.length ?? 0) * each;
}

/** Plan rewrites the person still has on this Video. */
export function rewritesLeft(config: PlatformConfig, used: number): number {
  return Math.max(0, config.director.rewritesPerVideo - used);
}

/** The estimate's scene lines and the plan's most, as the Plan card shows. */
export function planTotals(
  base: { max: number; scenes: readonly { max: number }[] } | null,
  sceneCount: number,
  mediaExtra: number,
  graphics: number,
): { max: number; sceneCosts: number[] } {
  return {
    max: Math.ceil((base?.max ?? 0) + mediaExtra + graphics),
    sceneCosts: Array.from({ length: sceneCount }, (_, i) =>
      Math.ceil(base?.scenes[i]?.max ?? 0),
    ),
  };
}
