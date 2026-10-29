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
