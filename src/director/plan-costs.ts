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
  /** ROUND-C4 (0.5): scenes that only reuse the person's own media. */
  reused: readonly boolean[] = [],
): { max: number; sceneCosts: number[] } {
  const saved = reused.reduce(
    (n, r, i) => n + (r ? (base?.scenes[i]?.max ?? 0) : 0),
    0,
  );
  return {
    max: Math.ceil(
      Math.max(0, (base?.max ?? 0) - saved) + mediaExtra + graphics,
    ),
    sceneCosts: Array.from({ length: sceneCount }, (_, i) =>
      reused[i] ? 0 : Math.ceil(base?.scenes[i]?.max ?? 0),
    ),
  };
}

// ROUND-C4 (0.5): a scene that reuses media the person already has is
// charged only for what is new (a new graphic, a Studio run: both counted on
// their own lines), not at its scene method's full cost. One rule for the
// Director's Plan card and the connector's plan and scene costs.

interface CostScene {
  readonly notes?: string;
  readonly layers?: readonly {
    readonly kind?: string;
    readonly mediaIntent?: { readonly query?: string; readonly type?: string };
  }[];
}
/** Words of a name, as the slot and file matching uses them. */
export const nameWords = (x: string) =>
  x
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
/** The media a scene names (pictures, clips, sounds; not icons). */
export function sceneMediaQueries(scene: CostScene): string[] {
  const out: string[] = [];
  for (const l of scene.layers ?? []) {
    const q = l.mediaIntent?.query?.trim();
    const t = l.mediaIntent?.type ?? 'photo';
    if (l.kind !== 'media' || !q || ['icon', 'emoji', 'sticker'].includes(t))
      continue;
    out.push(q);
  }
  return out;
}
/** True when the scene names media and the person owns every one of them. */
export function sceneReusesMedia(
  scene: CostScene,
  owns: (query: string) => boolean,
): boolean {
  const q = sceneMediaQueries(scene);
  return q.length > 0 && q.every(owns);
}
/** Whether a file name holds every word of a media query (the slot rule). */
export function fileMatches(query: string, fileName: string): boolean {
  const have = new Set(nameWords(fileName.replace(/\.[a-z0-9]+$/i, '')));
  const need = nameWords(query);
  return need.length > 0 && need.every((w) => have.has(w));
}
/** The method credits of one scene (0 when it only reuses owned media). */
export function sceneMethodCredits(
  config: PlatformConfig,
  scene: CostScene,
  owns?: (query: string) => boolean,
): number {
  if (owns && sceneReusesMedia(scene, owns)) return 0;
  const method = /method:([a-z0-9-]+)/.exec(scene.notes ?? '')?.[1];
  const tool = config.director.tools.find((t) => t.id === method);
  return tool?.costId ? costOf(config, tool.costId, 1, 'max') : 0;
}
