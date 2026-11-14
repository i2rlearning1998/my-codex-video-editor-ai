// FINAL3 V2.1: finding media for a plan's media layers. The editor's own
// library is asked first, then stock (photos and videos: Pexels or Pixabay;
// icons: Iconify; emoji: the sticker sets). Candidates are ranked by how
// many query words their title and tags hold, the wanted orientation and
// kind, then by key, so the same plan always picks the same media. The top
// four are kept as alternatives. A failure never blocks the build: the
// layer gets a fallback card and a "needs asset" flag.
import type { PlanLayer } from './schema';

export type MediaKind = 'image' | 'video' | 'audio';
export interface MediaCandidate {
  /** "library:<id>", "asset:<id>" or "<provider>:<item id>". */
  readonly key: string;
  readonly source: 'library' | 'asset' | 'stock';
  readonly kind: MediaKind;
  readonly title: string;
  readonly tags: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly thumbUrl?: string;
  /** Provider-specific data the importer needs (a stock item). */
  readonly payload?: unknown;
  /** V4: seconds of footage or sound (0 or missing: unknown or a picture). */
  readonly duration?: number;
  /** V4: the licence id and the credit line a stock pick carries. */
  readonly licence?: string;
  readonly attribution?: string;
  /** V4: the provider that found it (registry id). */
  readonly provider?: string;
}
export interface ResolveServices {
  /** The project's media and the editor library matching a query. */
  local(query: string, type: PlanMediaType): readonly MediaCandidate[];
  /** Stock search; throws when the provider fails or has no key. */
  stock(
    query: string,
    type: PlanMediaType,
    orientation: Orientation | undefined,
    page: number,
  ): Promise<readonly MediaCandidate[]>;
}
type PlanMediaType = NonNullable<PlanLayer['mediaIntent']>['type'];
type Orientation = 'landscape' | 'portrait' | 'square';
export interface MediaChoice {
  readonly chosen: MediaCandidate | null;
  /** Up to four ranked candidates (the chosen one first). */
  readonly alternatives: readonly MediaCandidate[];
  readonly flag: 'needs-asset' | null;
  /** Why the layer needs an asset (plain text), when it does. */
  readonly reason?: string;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1);
const orientationOf = (width: number, height: number): Orientation =>
  Math.abs(width - height) <= Math.max(width, height) * 0.05
    ? 'square'
    : width > height
      ? 'landscape'
      : 'portrait';
/** A candidate's score for a query (higher is better). */
export function scoreCandidate(
  candidate: MediaCandidate,
  query: string,
  type: PlanMediaType,
  orientation?: Orientation,
): number {
  const wanted = words(query);
  const have = new Set([
    ...words(candidate.title),
    ...candidate.tags.flatMap(words),
  ]);
  let score = wanted.filter((word) => have.has(word)).length * 10;
  if (
    orientation &&
    candidate.width > 0 &&
    candidate.height > 0 &&
    orientationOf(candidate.width, candidate.height) === orientation
  )
    score += 4;
  if (type === 'audio') {
    if (candidate.kind === 'audio') score += 3;
  } else if ((type === 'video') === (candidate.kind === 'video')) score += 3;
  if (candidate.source !== 'stock') score += 1;
  return score;
}
export function rankCandidates(
  candidates: readonly MediaCandidate[],
  query: string,
  type: PlanMediaType,
  orientation?: Orientation,
): MediaCandidate[] {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => !seen.has(candidate.key) && seen.add(candidate.key))
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, query, type, orientation),
    }))
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.candidate.key < b.candidate.key
          ? -1
          : 1,
    )
    .map((entry) => entry.candidate);
}

const EXTENSION =
  /\.(png|jpe?g|webp|gif|svg|avif|bmp|mp4|mov|webm|m4v|mkv|mp3|wav|m4a|ogg|aac|flac)\s*$/i;
/** A name or query as plain lowercase words (no extension, no dashes). */
export const nameWords = (text: string): string[] =>
  text
    .trim()
    .replace(EXTENSION, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
/**
 * The person's own file for a query: its name (without extension, dashes or
 * case) holds every word of the query ("globe-earth" is "Globe Earth.PNG").
 */
export function namesMatch(title: string, query: string): boolean {
  const wanted = nameWords(query);
  if (!wanted.length) return false;
  const have = new Set(nameWords(title));
  return wanted.every((word) => have.has(word));
}
/**
 * FIX7: what a build may use on its own. Only the person's own media whose
 * name fits the query (or a candidate the person chose and the plan kept).
 * Stock and library picks are suggestions, never filled in silently: a
 * missing file stays missing and is listed by name.
 */
export const mayUse = (
  candidate: MediaCandidate,
  query: string,
  preferred?: string,
): boolean =>
  candidate.key === preferred ||
  (candidate.source === 'asset' && namesMatch(candidate.title, query));

/**
 * Resolves one media layer. A `preferred` key (a swap kept in the plan's
 * `resolved`) wins when it is still among the candidates or is a local one.
 */
export async function resolveMedia(
  layer: PlanLayer,
  services: ResolveServices,
  preferred?: string,
): Promise<MediaChoice> {
  const intent = layer.mediaIntent;
  if (!intent)
    return {
      chosen: null,
      alternatives: [],
      flag: 'needs-asset',
      reason: 'No media described.',
    };
  const local = services.local(intent.query, intent.type);
  let stock: readonly MediaCandidate[] = [];
  let reason: string | undefined;
  // FIX7: stock is searched only for a pick the person made earlier; a
  // build never goes looking for anything the person has not added.
  if (preferred && !/^(asset|library):/.test(preferred)) {
    try {
      stock = await services.stock(
        intent.query,
        intent.type,
        intent.orientation,
        1,
      );
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
  }
  const ranked = rankCandidates(
    [...local, ...stock],
    intent.query,
    intent.type,
    intent.orientation,
  );
  const keep = preferred
    ? (ranked.find((candidate) => candidate.key === preferred) ?? null)
    : null;
  const ordered = keep
    ? [keep, ...ranked.filter((candidate) => candidate !== keep)]
    : ranked;
  const alternatives = ordered.slice(0, 4);
  const usable = alternatives.filter((candidate) =>
    mayUse(candidate, intent.query, preferred),
  );
  const chosen = usable[0] ?? null;
  return chosen
    ? { chosen, alternatives, flag: null }
    : {
        chosen: null,
        alternatives,
        flag: 'needs-asset',
        reason:
          alternatives.length > 0
            ? `Missing: "${intent.query}". Add a file with this name to Media.`
            : (reason ??
              `Missing: "${intent.query}". Add a file with this name to Media.`),
      };
}

// --- V4 (ROUND-C1 C1.3): finding media on its own --------------------------
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
