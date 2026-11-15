// ROUND-C1 C1.3: v4 media picking by the asset rule (loaded lazily, only
// for a v4 plan, so the editor's first load does not grow).
import type { PlanLayer } from './schema';
import {
  rankCandidates,
  scoreCandidate,
  type MediaCandidate,
  type MediaChoice,
  type ResolveServices,
} from './resolve';

export type AssetSource = 'mine' | 'library' | 'stock' | 'ai';
export interface AssetRule {
  readonly order: readonly AssetSource[];
  readonly onlyMine: boolean;
  /** Licences a pick may carry ([] = any the provider reports). */
  readonly licences: readonly string[];
  readonly aiImagesMax: number;
  readonly aiVideosMax: number;
}
export interface MediaNeed {
  /** Seconds the layer shows (footage must last at least this long). */
  readonly seconds: number;
  /** The candidate keys other layers already use. */
  readonly used: ReadonlySet<string>;
}
export interface MediaChoiceV4 extends MediaChoice {
  /** Why each rejected candidate was not taken (plain sentences). */
  readonly rejected: readonly string[];
  /** The query that found the pick. */
  readonly query?: string;
}
const sourceOf = (c: MediaCandidate): AssetSource =>
  c.source === 'asset' ? 'mine' : c.source === 'library' ? 'library' : 'stock';
/** Why a candidate may not be used for this layer, or null. */
export function rejectReason(
  c: MediaCandidate,
  layer: PlanLayer,
  rule: AssetRule,
  need: MediaNeed,
): string | null {
  const intent = layer.mediaIntent!;
  if (rule.onlyMine && c.source !== 'asset')
    return `"${c.title}" is not one of your files.`;
  if (!rule.order.includes(sourceOf(c)))
    return `"${c.title}" comes from a source this video does not use.`;
  if (
    c.source === 'stock' &&
    rule.licences.length &&
    !rule.licences.includes(c.licence ?? '')
  )
    return `"${c.title}" has a licence this video may not use (${c.licence ?? 'unknown'}).`;
  if (need.used.has(c.key))
    return `"${c.title}" is already used by another layer.`;
  const video = intent.type === 'video';
  if (video !== (c.kind === 'video') && intent.type !== 'audio')
    return `"${c.title}" is not a ${video ? 'video' : 'picture'}.`;
  if (intent.type === 'audio' && c.kind !== 'audio')
    return `"${c.title}" is not a sound.`;
  const wantSeconds = Math.max(
    layer.minDuration ?? 0,
    video ? need.seconds : 0,
  );
  if (
    video &&
    (c.duration ?? 0) > 0 &&
    (c.duration ?? 0) - (layer.sourceIn ?? 0) < wantSeconds - 0.05
  )
    return `"${c.title}" is ${Math.round(c.duration ?? 0)} s; the layer needs ${Math.ceil(wantSeconds)} s.`;
  const big = layer.size === 'full' || (layer.width ?? 0) >= 60;
  if (
    c.source === 'stock' &&
    big &&
    c.width > 0 &&
    c.height > 0 &&
    Math.min(c.width, c.height) < 480
  )
    return `"${c.title}" is too small to fill the screen.`;
  return null;
}
/**
 * V4: resolves a media layer by the asset rule. Its queries are tried in
 * order; for each, the person's files, the library and stock (by kind,
 * every enabled provider) are ranked; the first candidate that passes the
 * checks is picked. Up to four alternatives are kept. A plan pick the
 * person kept (`preferred`) still wins.
 */
export async function resolveMediaV4(
  layer: PlanLayer,
  services: ResolveServices,
  rule: AssetRule,
  need: MediaNeed,
  preferred?: string,
): Promise<MediaChoiceV4> {
  const intent = layer.mediaIntent;
  if (!intent)
    return {
      chosen: null,
      alternatives: [],
      flag: 'needs-asset',
      reason: 'No media described.',
      rejected: [],
    };
  const queries = [
    ...new Set(
      [...(layer.queries ?? []), intent.query]
        .map((q) => q.trim())
        .filter(Boolean),
    ),
  ];
  const rejected: string[] = [];
  let lastReason: string | undefined;
  let all: MediaCandidate[] = [];
  for (const query of queries) {
    const local = services.local(query, intent.type);
    let stock: readonly MediaCandidate[] = [];
    if (!rule.onlyMine && rule.order.includes('stock')) {
      try {
        stock = await services.stock(query, intent.type, intent.orientation, 1);
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error);
      }
    }
    const ranked = rankCandidates(
      [...local, ...stock],
      query,
      intent.type,
      intent.orientation,
    ).filter(
      (c) =>
        c.source !== 'asset' || scoreCandidate(c, query, intent.type) >= 10,
    );
    // The rule's order decides first; the rank decides inside one source.
    const order = (c: MediaCandidate) => rule.order.indexOf(sourceOf(c));
    const ordered = preferred
      ? [
          ...ranked.filter((c) => c.key === preferred),
          ...ranked.filter((c) => c.key !== preferred),
        ]
      : [...ranked].sort((a, b) => order(a) - order(b));
    all = [...all, ...ordered.filter((c) => !all.some((x) => x.key === c.key))];
    const pick = ordered.find((c) => {
      if (c.key === preferred) return true;
      const why = rejectReason(c, layer, rule, need);
      if (why) rejected.push(why);
      return !why;
    });
    if (pick) {
      const alternatives = [
        pick,
        ...ordered.filter(
          (c) => c !== pick && !rejectReason(c, layer, rule, need),
        ),
      ].slice(0, 5);
      return { chosen: pick, alternatives, flag: null, rejected, query };
    }
  }
  const offer = rule.onlyMine
    ? 'Add a file with this name to Media.'
    : rule.order.includes('ai') &&
        (intent.type === 'video' ? rule.aiVideosMax : rule.aiImagesMax) > 0
      ? 'Reword the search, make a code graphic, or make an AI picture.'
      : 'Reword the search or make a code graphic.';
  return {
    chosen: null,
    alternatives: all.slice(0, 4),
    flag: 'needs-asset',
    reason: `Nothing usable for "${intent.query}". ${offer}${lastReason ? ` (${lastReason})` : ''}`,
    rejected,
  };
}
